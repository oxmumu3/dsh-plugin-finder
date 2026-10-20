# Plugin Finder Implementation Plan

User approved the HTML prototype and real implementation on 2026-10-20. This checklist records the implemented local preview and the release work handed back to root. Evidence boundaries are in `docs/verification.md`.

**Goal:** Deliver an installable DSH plugin with a real catalog, host-model intent/recommendation and safe workspace conversation handoff.

**Architecture:** Host ESM bundle, official authenticated connection routes, bounded schema-validated model calls, packaged metadata index, native React main/sidebar slots. No independent model account, no global DOM shell, no automatic installation or message submission.

**Tech Stack:** Node 22, DSH 0.2.x public SDK, native React host surface, Node test runner, npm tgz.

## Task 1: Real candidate catalog

- [x] Cover source provenance, Chinese/English capability retrieval, empty matches, DSH/Node/platform/Key filtering and blocked sources with tests.
- [x] Implement `catalog/index.mjs`, `catalog/plugins.json` and `scripts/refresh-catalog.mjs` with fixed HTTPS sources and bounded reads; never execute candidate packages.
- [x] Refresh and inspect 15 pinned real bundles: 11 metadata/entry checks, 2 requiring source-build confirmation and 2 blocked from recommendations. Candidate installation/task/combination states remain untested.

## Task 2: Intent and plan service

- [x] Validate intent and plan schemas, known/unique plugin IDs, kind/ID counts, capability coverage and plugin-step source capability IDs.
- [x] Bound request text to 6000 characters, capabilities and queries to 6, recalled candidates to 8 and selected plugins to 2. A normal completed flow requests analysis and recommendation once each; explicit retries and provider retries may add calls.
- [x] Apply supported deterministic eligibility filters and label unresolved constraints. Keep exact installation sources and proof state under Host authority.
- [x] Use the host global provider/model/account with exact-route `prepareCall` configuration for lightweight auxiliary reasoning, without changing global settings. Validate full response termination and map limits, account errors and cancellation to safe messages.

## Task 3: Real host adapter

- [x] Register bootstrap/analyze/recommend/feedback under official authenticated `connection.fetch`, with method/content/body/query limits and safe errors.
- [x] Implement bounded plugin-owned local feedback storage with serialized writes, at most 100 records, and no automatic external transmission.
- [x] Verify route/model/service behavior, lifecycle closure and concurrent-call rejection. Keep runtime profiles, credentials and private diagnostics outside the distribution allowlist.

## Task 4: Native UI and handoff

- [x] Register one matching main/sidebar panel, scoped disposable CSS and actual workspace choices; preserve the host shell.
- [x] Implement describe → editable six-field understanding → source-backed candidates and plan → explicit workspace → `connectWorkspace` → retain and validate exact Session binding → `requestDraftInitialization({prompt,clearPreviousDraft:false})`.
- [x] On `applied`, open the target Session and select the native conversation panel. On `preserved`/`blocked`, keep the plan and show the corresponding recovery message. Never submit a Session message.
- [x] Test cancellation/stale results, double clicks, deleted workspaces, missing model, retained-binding expiry, reference release and native/gap outcomes.

## Task 5: Install and real bounded verification

- [x] Build a local tgz and install it using the official `0.2.1-rc.2` Desktop-carried CLI into a dedicated `DSH_HOME` Web profile with a synthetic workspace.
- [x] In one Ego Lite verification TaskSpace, observe the native sidebar/page, real index, host-model analysis and a `single` recommendation for `dsh-data-quality`.
- [x] Select `sample-workspace` and read back a complete 4366-character unsent draft from the native editor, including the requirement, fixed sources and limitations.
- [x] Replace the draft with `synthetic-user-draft-marker`, repeat handoff, receive `preserved` and verify that the marker remains unchanged.
- [x] Save a synthetic partial-completion feedback record through the UI and read back one matching outcome/IDs/note record in isolated `storages/plugin_finder.json`.
- [x] Stop only the owned test Host and remove temporary credential copies. Leave the user normal profile unchanged. No candidate installation/execution, task submission or author message occurred.

## Task 6: Review and release

- [x] Complete independent SDK/code reviews, fix material findings with regression tests, then run the final build followed by `npm test`: 66 passed, 0 failed.
- [x] Write installation, first-use, fee/privacy, feedback and verification documentation. Source development starts with `npm ci --ignore-scripts --legacy-peer-deps`; DSH SDK peers remain host-provided.
- [ ] Root: after final documentation changes, rebuild the release tgz, inspect its exact contents and calculate SHA-256.
- [ ] Root: publish only project sources/assets and the package, verify anonymous download against SHA-256, and validate installation/loading/uninstall in a second disposable clean profile. No outreach messages.

The public-download and second-profile outcomes belong in the corresponding GitHub Release acceptance record after they have been observed. The frozen package documentation links that record without asserting an outcome in advance. External-user feedback, retention and task success remain separate later evidence.
