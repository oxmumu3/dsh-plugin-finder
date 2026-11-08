import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection';
import { Storage } from '@deepseek-ai/dsh-storage';
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import * as plugin from '../index.js';
import { assertTransportAdmission } from './ci-transport-contract.mjs';
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const finder = metadata.name.endsWith('finder');
const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-host-contract-')));
const ctx = new Context();
// No browser/account auth is created: the official service's same-process owner
// peer exercises its real dispatcher. All state lives in this synthetic directory.
let authenticated = false;
const connection = new HostConnectionService(ctx, [], { isAuthenticated: () => authenticated, authenticateApi: () => undefined });
const dispatcher = connection.createSharedFetchHandler('/api');
const request = (path, options) => new Request('http://127.0.0.1' + path, options);
let ownerPeer, admission;
const dispatch = (path, peer = ownerPeer, options) => dispatcher.fetch(request(path, options), peer);
let backend, facility, tools;
const finderToolNames = ['finder_lookup', 'finder_activate', 'finder_create', 'finder_status'];
// The four capability tools are the verified feedback contract; finder_search is
// a read-only auxiliary registration that must still be present and disposed.
// Session-scoped tools are registered globally with a when() condition: the expert
// card writer and the creator-mode experience tools resolve only inside their sessions.
const scopedFinderToolNames = ['finder_plan_update', 'finder_creator_guide', 'finder_creator_note', 'finder_creator_step'];
const allFinderToolNames = [...finderToolNames, 'finder_search', ...scopedFinderToolNames];
const promptSections = new Map();
let forbiddenInvocations = 0;
const forbidden = operation => () => { forbiddenInvocations++; assert.fail('No ' + operation + ' in compatibility CI'); };
const feedbackRow = { id: 'entries', rows: [{ id: '4a8a40de-0c62-411f-b8fe-f758c00bc3c1', createdAt: '2026-11-03T00:00:00.000Z', outcome: 'complete', pluginIds: ['ci-one', 'ci-two', 'ci-three', 'ci-four'], note: 'Synthetic four-capability persistence contract', stage: 'complete' }] };
try {
  assert.equal(globalThis.__dshCiNetwork?.nonLoopbackAllowed, false, 'Network denial preload is required');
  // Presentation and session/workspace entry points stay synthetic. The official
  // ToolRuntime validates, registers, looks up and disposes the real definitions.
  ctx.provide('systemPrompt', {
    tools: () => () => {},
    section: section => {
      assert.equal(promptSections.has(section.name), false, 'Duplicate prompt section');
      promptSections.set(section.name, section);
      return () => promptSections.delete(section.name);
    },
    getSectionOrder: () => 0,
  });
  tools = new ToolRuntime(ctx);
  ctx.provide('workspaceRegistry', { list: () => [], resolveByPath: forbidden('workspace resolution') });
  ctx.provide('sessionController', { create: forbidden('Session creation') });
  ctx.provide('llm', { prepareCall: forbidden('model dispatch') });
  if (finder) {
    const storage = new Storage(ctx); backend = new JsonStorageBackend(directory);
    storage.backend.register('ci-json', backend); facility = new DomainFacility(ctx, { backend: 'ci-json' });
    ctx.provide('storageDomain', facility);
    ctx.provide('workingDirectory', { get: forbidden('working directory lookup') });
    ctx.provide('sandboxPolicy', { resolve: forbidden('sandbox policy resolution') });
  }
  const path = finder ? '/api/plugin_finder/bootstrap' : '/api/agent_twin/status';
  for (let mount = 0; mount < 2; mount++) {
    admission = assertTransportAdmission(connection, process.env.DSH_TEST_SDK_VERSION, value => { authenticated = value; });
    ownerPeer = admission.peer;
    const fiber = ctx.plugin(plugin, finder ? {} : { stateDirectory: directory }); await fiber;
    if (!finder) {
      const children = [...ctx.registry.entries()].flatMap(([, runtime]) => [...runtime.fibers]).filter(child => child.parent.fiber.uid === fiber.uid);
      assert.equal(children.length, 1); await children[0]; assert.equal(children[0].state, 2);
    }
    const response = await dispatch(path); assert.equal(response.status, 200, await response.clone().text());
    const state = await response.json();
    if (finder) {
      assert.equal(state.hostVersion, process.env.DSH_TEST_SDK_VERSION);
      assert.equal(state.telemetry.enabled, false); assert.equal(state.workflow ?? null, null);
      for (const name of allFinderToolNames) assert.ok(tools.get(name), 'Missing official ToolRuntime registration: ' + name);
      assert.deepEqual(tools.schemas().map(tool => tool.name).sort(), [...allFinderToolNames].sort());
      assert.match(promptSections.get('finder:agent-routing')?.text({ scope: undefined }) ?? '', /finder_lookup/);
      // Scoped sections stay empty for a scope that is neither an expert nor a creator-mode session.
      assert.equal(promptSections.get('finder:expert-session')?.text({ scope: { id: 'ci-plain-session' } }), '');
      assert.equal(promptSections.get('finder:creator-assist')?.text({ agent: { id: 'ci-plain-session' } }), '');
      const domain = facility.get('plugin_finder'); assert.ok(domain);
      if (mount === 0) await domain.table('feedback').put('entries', feedbackRow);
      assert.deepEqual(await domain.table('feedback').get('entries'), feedbackRow, 'Four-capability feedback must survive domain close and reopen');
    } else {
      assert.equal(state.service.enabled, false); assert.equal(state.project, null); assert.ok(tools.get('agent_twin'));
    }
    if (!admission.legacyOperator) assert.equal((await dispatch(path, { principal: { kind: 'synthetic-non-owner' } })).status, 403);
    assert.equal((await dispatch(path, ownerPeer, { method: 'DELETE' })).status, 404);
    await fiber.dispose(); assert.equal((await dispatch(path)).status, 404);
    if (finder) {
      for (const name of allFinderToolNames) assert.equal(tools.get(name), undefined, 'Disposed Finder tool remains callable: ' + name);
      assert.equal(promptSections.has('finder:agent-routing'), false);
    } else assert.equal(tools.get('agent_twin'), undefined);
  }
  assert.equal(forbiddenInvocations, 0, 'Contract must not enter a Session, workspace, model or installation path');
  assert.equal(globalThis.__dshCiNetwork.denied, 0);
  console.log(JSON.stringify({ package: metadata.name, sdk: process.env.DSH_TEST_SDK_VERSION, actualCordis: true, actualHostConnectionDispatcher: true, actualJsonDomainPersistence: finder, actualToolRuntime: true, registeredFinderTools: finder ? finderToolNames : [], fourCapabilityFeedback: finder, disposeAndReenable: true, ownerRoute: 200, authenticationBoundary: admission.legacyOperator ? 'legacy-operator-admission' : 'owner-peer-admission-and-route', unauthenticatedRequest: admission.unauthenticatedRequest, foreignAuthority: admission.foreignAuthority, otherPrincipal: admission.legacyOperator ? null : 403, unsupportedMethod: 404, removedRoute: 404, realModelCalls: 0, realMessagesSent: 0, forbiddenInvocations, network: globalThis.__dshCiNetwork }));
} finally { await ctx.fiber.dispose(); await facility?.closeAll(); await backend?.close(); await rm(directory, { recursive: true, force: true }); }
