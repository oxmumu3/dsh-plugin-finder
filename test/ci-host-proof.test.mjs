import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHostContract } from '../scripts/ci-sdk.mjs';

const complete = () => ({
  actualCordis: true, actualHostConnectionDispatcher: true, actualToolRuntime: true,
  actualJsonDomainPersistence: true, fourCapabilityFeedback: true, disposeAndReenable: true,
  registeredFinderTools: ['finder_lookup', 'finder_activate', 'finder_create', 'finder_status'],
  network: { denied: 0 }, realModelCalls: 0, realMessagesSent: 0, forbiddenInvocations: 0,
});
const accept = proof => validateHostContract(proof, { finder: true });

test('Host evidence accepts all four verified Finder tools regardless of ordering', () => {
  const proof = complete();
  proof.registeredFinderTools.reverse();
  assert.equal(accept(proof), proof);
});

test('Host evidence rejects missing or unverified official runtime and persistence checks', () => {
  for (const field of ['actualCordis', 'actualHostConnectionDispatcher', 'actualToolRuntime',
    'actualJsonDomainPersistence', 'fourCapabilityFeedback', 'disposeAndReenable']) {
    for (const value of [undefined, false, 1, 'true']) {
      assert.throws(() => accept({ ...complete(), [field]: value }), /complete evidence/, field);
    }
  }
  for (const proof of [undefined, null, {}]) assert.throws(() => accept(proof), /complete evidence/);
});

test('Host evidence rejects absent, incomplete, duplicate and extra Finder tool registrations', () => {
  const names = complete().registeredFinderTools;
  for (const registeredFinderTools of [undefined, {}, names.join(','), [], names.slice(0, 3),
    [...names.slice(0, 3), names[0]], [...names, 'unexpected_tool'],
    [...names.slice(0, 3), 'unexpected_tool']]) {
    assert.throws(() => accept({ ...complete(), registeredFinderTools }), /complete evidence/);
  }
});

test('Host evidence rejects missing, nonzero and falsely typed side-effect counters', () => {
  for (const field of ['realModelCalls', 'realMessagesSent', 'forbiddenInvocations']) {
    for (const value of [undefined, 1, -1, false, '0']) {
      assert.throws(() => accept({ ...complete(), [field]: value }), /complete evidence/, field);
    }
  }
  for (const network of [undefined, {}, { denied: 1 }, { denied: -1 }, { denied: '0' }]) {
    assert.throws(() => accept({ ...complete(), network }), /complete evidence/);
  }
});
