# Live plugin distribution correction

> **For agentic workers:** Use superpowers:subagent-driven-development to implement each isolated task and review the integrated result.

**Goal:** A user task must discover relevant plugins from changing ecosystem sources, including plugins absent from the shipped package, and reach an informed installation/first-use handoff.

**Architecture:** Load live third-party curated indexes and optional user-configured native markets; supplement with bounded GitHub topic search. Rank a bounded shortlist, read source documentation and manifests, retain provenance and source health, then use the existing host-model recommendation and retained native draft handoff. The old 15 records are historical metadata, never the candidate boundary or a silent failure fallback.

**Tech Stack:** Existing ESM host plugin, native DSH model/session services, read-only HTTPS sources, React host panel, Node test runner.

## Non-negotiable product acceptance

- Source additions are discoverable without shipping a new plugin build.
- Actual tasks discover relevant native bundles outside the old 15; source count is not adoption or task-success evidence.
- All-source failure produces a search-specific error before the model can label it a supply gap; partial failures and cache age remain visible.
- Candidate capability clues cite author/index text, never permission labels such as fs-read/network. Installation and task evidence remain distinct.
- Preserve source/install/version conflicts, prerequisites, existing draft protection and explicit host installation confirmation.
- Public release accurately states dynamic coverage and limits. The old release is superseded, not retrospectively relabeled as implementing this design.

## Task 1 — Dynamic discovery

Files: `src/discovery.js`, `test/discovery.test.mjs`.

- [x] Write failing fixture tests for new source entries, bounded cache/refresh, malformed sources, native-market pagination, source failures, manifest and README provenance.
- [x] Implement `createDiscovery().search({intent,hostVersion,nodeVersion,platform,signal})` returning candidates, sources, warnings and searchedAt.
- [x] Probe live sources using document conversion, Mermaid/LaTeX preview and journal/calendar tasks; verify no candidate is admitted because of a fixed seed membership.

## Task 2 — Service integration

Files: `index.js`, `src/service.js`, `src/contracts.js`, `test/live-service.test.mjs`, existing service tests.

- [x] Write six failing regression tests: outside-seed recommendation, search failure before model call, partial failure limits, feedback for discovered candidates, native-only skip, safe HTTP error.
- [x] Replace production static retrieval with live discovery and host/Node/Key eligibility filtering. Supply bounded source documentation to the host model.
- [x] Accept feedback only for known discovered IDs; propagate safe discovery errors; cancel/close owned discovery work.
- [x] Run focused service tests and the full suite after integration.

## Task 3 — Honest native UI

Files: `src/client.js`, `src/client-style.js`, `test/client.test.mjs`.

- [x] Test and render per-source live/cache/stale/failed/unconfigured status, fetch time, incomplete coverage and recommendation count.
- [x] Remove fixed 15-item scope language. Distinguish manifest-checked and index-only evidence, and author document reads.
- [x] Preserve the exact retained-binding draft implementation and its regression coverage.

## Task 4 — Real acceptance and release

Files: README, installation/verification records, package version, prebuilt client and public release assets.

- [x] Run real online searches for three non-seeded tasks and save sanitized provenance/results, including failure checks.
- [x] Use a disposable DSH profile to run a real host-model recommendation for a discovered non-seeded candidate and inspect native draft readback.
- [x] Record installation confirmation and first-use execution separately. Do not execute unreviewed candidate lifecycle scripts merely to create a success claim.
- [ ] Publish the corrected preview, anonymously download/checksum and install/uninstall in a clean profile. Mark the old release superseded.
- [x] Document comparison tasks against manual/source-native discovery, remaining friction and the real-user feedback protocol; do not invent external usage.
