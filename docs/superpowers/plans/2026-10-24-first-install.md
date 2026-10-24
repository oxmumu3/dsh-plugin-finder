# First installation in the existing Finder flow

Goal: the existing Use action installs and enables exactly the saved selected plugins, confirms them active, then submits the original task in its bound workspace. No plugin-manager navigation. Preserve all previous tasks/drafts and source identity.

Authorization: the user's 2026-10-24 request explicitly authorizes implementation, installation, real first-use acceptance, and updating the currently used Harness. The accepted page design is unchanged.

Architecture: deterministic Host preparation is separate from model execution. A locally claimed, created session with its official interaction UI mounted calls execution-prepare. The server derives candidates from the saved revision and persists bounded installation receipts before side effects. The official plugin manager operates in the current Host profile. A successful exact bundle/entry readback marks preparation ready; only then can the existing atomic submit grant issue the first model request. Creating a plugin still uses official cordis. Restoring an existing run observes it without re-installing or re-sending.

- [x] Installer adapter: src/plugin-installation.js + test/plugin-installation.test.mjs. Official inspect/installBundle/setBundleEnabled/listBundles/listPlugins. First persist requestId/installing, then mutate only selected bundle; resume by waitForInstall plus readback, never blind re-install after an unknown response. Reject conflicting source/version, inactive state and non-applied outcomes. Tests exercise unknown outcomes, cancellation, exact identities, concurrency and two-plugin partial progress.
- [x] Durable gate: src/history.js, src/service.js, src/routes.js and backend tests. Optional preparation field remains compatible with previous history. Validate complete local attempt/session/workspace identity, reject forged imported calls. No external call while holding history mutation queue. Guard submission on ready receipt and provide verified readiness to model.
- [x] Client adapter: src/workspace-execution.js and src/client.js. After mounting and before submit claim, await prepare using the ongoing operation signal (not the short submit timeout); show current-page progress. Failures leave unsent session resumable. Stop/detach prevents late model submission. Tests first reproduce the old premature submit behavior.
- [x] Host wiring/version: index.js injects installer, bump preview.9 and rebuild; tests/build and source-package-byte verification. No layout redesign.
- [x] Real acceptance: back up current Desktop history/drafts; use a genuinely not-installed public plugin in a dedicated workspace. Through Finder alone, search, use, observe install/enable, actual plugin tool/output, and refresh/resume without duplicates. Do not preinstall through manager or uninstall an existing user plugin to simulate first use.
- [x] Update current Desktop, verify old records/drafts unchanged, retain all failures/evidence, write final bounded results and commit locally. No public release.

Self-review: installing is profile-scoped while task results are workspace-scoped. Installed/enabled is not active, active is not task success. Unknown install is not failed/cancelled. An incomplete search is not market absence. User-facing steps expose only necessary permissions/configuration, not technical handoffs.

Completion: preview.9 real absent-plugin installation/use and preview.10 error-message finalization verified; see docs/first-install-acceptance-20261024.md.
