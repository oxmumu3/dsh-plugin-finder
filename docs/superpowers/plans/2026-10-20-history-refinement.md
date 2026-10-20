# History and refinement repair Implementation Plan

> **For agentic workers:** Use subagent-driven development with file ownership below and test-first behavioral regressions.

**Goal:** Deliver the originally designed 我的方案 / 历史方案 flow without erasing prior work.

**Architecture:** A separate plugin-owned history domain retains task revisions and exact session links. The existing legacy domain stays readable and unchanged. Client task/revision identities guard history navigation, feedback and refinement.

**Tech Stack:** Existing Node ESM service, DSH storageDomain/connection APIs, React client, node:test.

## Backend worker

- [ ] Own `src/history.js`, `src/service.js`, backend history/workflow/service tests. Write failing tests for non-destructive reset, immutable revision refinement, two task separation, durable failed saves, legacy migration and duplicate import.
- [ ] Use `historyStore` persistence adapter supplied by entrypoint: `{read(id),write(row),list(),readPointer(),writePointer(value)}`; rows are `{id,serialized}`, pointer is `{activeTaskId,activeRevisionId}`. `list()` returns all task rows from the declared table. Keep each serialized task <= 8,000,000 characters; reject capacity overrun without pruning. Do not use raw files or touch installed profile.
- [ ] Service methods: `history({offset,limit})`, `open({taskId,revisionId})`, `refine({taskId,revisionId,feedback,signal})`, `handoff({taskId,revisionId,workspaceId,sessionId,status})`, `importBackup({workflow,origin})`, `exportTask({taskId})`; existing analyze/recommend/feedback accept taskId/revisionId, reset starts blank without deleting history.
- [ ] Responses include `workflow`, `history`, `historyTotal`; workflow metadata includes taskId/revisionId/revisionNumber/revisions/feedback/handoff. `refine` appends user feedback to the original goal/materials and uses analysis stage, not an automatic install/execute. `recommend` re-searches and records a new snapshot. Restore/open never invokes model.

## Client worker

- [ ] Own `src/client.js`, `src/client-style.js`, `test/client.test.mjs`. Add failing behavioral tests for new-request/history/reload and feedback refinement; preserve retained Session draft protections.
- [ ] Internal tabs 找方案 / 我的方案. History list opens exact task/revision; show version/feedback and source times, current task export/import JSON. The existing result feedback is local save; a separate explicit optimize action calls `refine` and returns to understanding for confirmation.
- [ ] New request clears screen only after server durability acknowledgment, history remains reachable from blank page. All task writes carry taskId/revisionId; stale/failed operations preserve visible work.
- [ ] Handoff persists returned exact IDs through `handoff`; reopened saved sessions use retain/binding/workspace membership checks, then openSession only, no connectWorkspace or new draft injection.

## Root integration

- [ ] Own `index.js`, `src/routes.js`, `src/contracts.js`, package version, docs and release. Register separate history domain alongside legacy through owned lifecycles; backend adapter uses declared tables, no raw storage edits.
- [ ] Routes keep 32KiB ordinary payloads, allow bounded import JSON up to 256KiB; task export returns plain JSON. Keep no-store/same-origin and sanitized errors.
- [ ] Run targeted worker tests then full suite/build. Independent review fixes concrete data-loss, stale-tab or privacy failures before packaging.
- [ ] Back up current Finder-owned state; publish/install user-owned update through current native manager, never restart Host or touch other plugins. Import the exact real checkpoint via plugin UI, clearly marked restored, preserve current work; verify new-task/history/version persistence and original session navigation on actual Desktop.
