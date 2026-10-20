# Plugin Finder Implementation Plan

> **For agentic workers:** Execute using superpowers:subagent-driven-development. User already approved the prototype and implementation. Root owns integration; separate agent owns catalog only.

**Goal:** Deliver an installable DSH plugin with a real catalog, host-model intent/recommendation and safe workspace conversation handoff.

**Architecture:** Host ESM bundle, authenticated connection routes, bounded schema-validated model calls, packaged metadata index, native React main/sidebar slots. No independent model account, no global DOM shell, no automatic installation or message submission.

**Tech Stack:** Node 22, DSH 0.2.x public SDK, native React host surface, Node test runner, npm tgz.

## Task 1: Real candidate catalog

- [ ] Agent writes failing tests in `test/catalog.test.mjs` for source provenance, compatibility filters, Chinese/English capability matching and empty matches; runs `node --test test/catalog.test.mjs` and records expected failure.
- [ ] Implement `catalog/index.mjs`, `catalog/plugins.json` and `scripts/refresh-catalog.mjs`; only read fixed HTTPS npm/GitHub sources with bounded timeout/body size; never execute candidate packages.
- [ ] Run the same tests green and inspect actual candidate count, pinned versions and evidence fields.

## Task 2: Intent and plan service

- [ ] Root writes `test/service.test.mjs`: `assert.rejects` for unknown plugin IDs, repeated IDs, more than 2 candidates, invalid intent, unsupported recommendation kinds; verify author metadata cannot become installation authority and gap/native plans cannot contain install IDs. Run red.
- [ ] Implement `src/contracts.js`, `src/model.js`, `src/service.js`: request text <= 6000 chars; <= 6 capabilities; bounded queries; 2 model calls per full flow; max 8 recalled candidates; model only selects known IDs. Use context-provided llm.prepareCall and global default selection.
- [ ] Add host-model stream tests for complete response, missing finish, timeout/abort and malformed JSON. Run `node --test test/service.test.mjs test/model.test.mjs` green.

## Task 3: Real host adapter

- [ ] Write route tests for GET bootstrap, POST analyze/recommend/feedback, invalid method/body, lifecycle close and concurrent-call rejection. Confirm red via `node --test test/routes.test.mjs`.
- [ ] Implement `index.js`, `src/routes.js`, `src/feedback.js`, `package.json`, `cordis.patch.yml`. Register only plugin-owned authenticated paths and bounded local storage. No mutation of profile or other plugins.
- [ ] Run route/model/service tests together green. Pack file list must exclude runtime files, credentials, test profiles and private paths.

## Task 4: Native UI and handoff

- [ ] Verify native contract with a minimal client test: same panel ID for main/sidebar; disposal removes owned CSS; startSession gets explicit workspace and `clearPreviousDraft:false`; submit is never called.
- [ ] Implement `src/client.js`, scoped CSS and native state: describe → editable understanding → authoritative candidate cards + plan → explicit workspace → startSession → selectPanel(null). Show source links, current evidence and configuration errors.
- [ ] Check cancellation/stale responses, repeated click, no workspace, missing model and native/gap outcomes. Run `node --test test/client.test.mjs` green.

## Task 5: Install and real bounded verification

- [ ] Build tgz with `npm pack --pack-destination dist`; record SHA256 and inspected package contents.
- [ ] Use a dedicated DSH_HOME and synthetic workspace; install the tgz through official CLI, start isolated Web on an unused local port, and inspect bundle enable/load state. Never stop the live host or mount personal workspaces.
- [ ] In Ego Lite, verify native sidebar entry, real catalog read, actual host-model analyze/recommend, explicit-workspace unsent draft, draft preservation and feedback persistence. Use one TaskSpace for this verification goal.
- [ ] Uninstall in a second disposable profile and verify owned contributions are gone. Keep missing model/auth evidence separate if actual credentials cannot be safely used.

## Task 6: Review and release

- [ ] Independent spec review then code-quality review; fix material findings with regression tests.
- [ ] Run `npm test` and package smoke fresh after fixes. Write `docs/verification.md` with actual results and limits, not implied success.
- [ ] Provide install/first-use/feedback instructions and a shareable release candidate. If publishing a public repository/release is available under the user's launch request, publish only project sources/assets and verify an anonymous package download against SHA256. No outreach messages.

