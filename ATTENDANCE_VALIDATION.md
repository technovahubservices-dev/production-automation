# Attendance implementation and validation

Validated locally on November 16, 2026 with Node.js 24.21.0. Nothing was pushed or deployed. No production database was connected to or modified.

## Results

| Check | Result |
|---|---|
| Starlit `npm --prefix backend test` | **41 passed, 0 failed** |
| SecureVerify backend `npm test` | **3 passed, 0 failed** |
| Starlit frontend `node tests/attendance.mjs` | Passed: daily/monthly rendering, admin visibility, overnight totals, CSV values and formula escaping |
| Starlit frontend `node tests/adminDate.mjs` | Passed for both roles across Overview, Dashboard, Department, WorkEntry, Production, Workers and Reports |
| Starlit frontend `node tests/departments.mjs` | Passed: all 13 departments for both roles |
| Starlit frontend `npm run lint` | Exit 0; existing warnings remain in pre-existing code; no warning in the new attendance page |
| Both frontends `npm run build` | Passed |
| Built frontend HTTP previews | Both HTML/JS entry points passed; all three SecureVerify model manifests and four weight shards served under `/biometric/models/` |
| Local startup smoke test | Passed: dedicated persistent replica set, local account helper, both actual API CLI entry points, login, JWT-protected attendance query, SecureVerify integration health |
| `git diff --check` in both repositories | Passed |

SecureVerify's face-model bundle produces Vite's non-blocking >500 kB chunk warning. Expected error-path logs from wrong-origin, missing-UV, and missing-JWT tests are not test failures.

The cross-project test uses a temporary single-node MongoDB replica set, separate test databases, actual ES256 registration and signed WebAuthn assertions, and loopback HTTP services. It does not load project `.env` files. It covers signed-request failures, concurrent repeated delivery, duplicate check-in, checkout without check-in, out-of-order events, event-ID mutation, sequence gaps, overnight/month attribution, multiple sessions, report filtering/permissions, inactive/mismapped workers, canonical enrollment, single-use/expired/action-bound sessions, wrong origin, missing user verification, mismatch rejection, outage queues, sender database reconnection, and receiver-response-loss recovery. It verifies an existing production WorkEntry remains byte-for-byte unchanged.

The local startup smoke test created only a dedicated `starlit_local` database/account on port 27018 and the local SecureVerify database/indexes. Its processes and preview servers were stopped. The local database files persist for the user's next run. No employees or attendance were seeded into those persistent databases.

## Existing stale tests

These scripts were also run and still fail against the existing project behavior. Their relevant source files and production calculations were left unchanged, confirmed with `git diff --exit-code`.

1. `tests/settings-integration.mjs`: imports JSON without the Node-required import attribute. An in-memory JSON loader reveals a second existing failure: it imports `productionTotals`, which is no longer exported by `productionUnits.js`.
2. `tests/password-management-ui.mjs`: password-management behavior assertions run, then the old Settings section-label assertions fail. The current Settings UI combines departments/measurement units; the test expects the older separate labels.
3. `frontend/src/context/productionUnits.test.js`: direct execution is blocked by the same JSON import-attribute issue. With an in-memory loader, two tests pass and one fails because it expects `?` for CLEANING while the unchanged formatter returns `-`.

These are not attendance failures. No compatibility export, production calculation change, or unrelated UI label change was introduced to satisfy stale assertions.

The existing backend login-notification suite initially exposed a logger mismatch. The failure message now uses `console.error` instead of `console.log`, matching its existing safe-error assertion. Login, email payloads and password behavior are unchanged; that suite now passes.

Physical camera capture, device prompts and human face accuracy were not automated. They require an interactive device check; virtual-authenticator success does not establish biometric accuracy or liveness.

## Files added or changed

Paths below are relative to each project. The existing untracked `production-automation/backend/models/production-automation.code-workspace` was left untouched.

### production-automation

Added:

- `LOCAL_ATTENDANCE.md`
- `ATTENDANCE_VALIDATION.md`
- `backend/.env.example`
- `backend/middleware/biometricServiceAuth.js`
- `backend/models/AttendanceSession.js`
- `backend/models/AttendanceEvent.js`
- `backend/models/AttendanceCursor.js`
- `backend/routes/attendanceRoutes.js`
- `backend/services/attendanceService.js`
- `backend/scripts/configureLocalIntegration.js`
- `backend/scripts/startLocalMongo.js`
- `backend/scripts/createLocalAdmin.js`
- `backend/tests/attendanceIntegration.test.js`
- `backend/tests/attendanceRules.test.js`
- `frontend/.env.example`
- `frontend/src/pages/Attendance.jsx`
- `frontend/src/pages/Attendance.css`
- `frontend/tests/attendance.mjs`

Changed:

- `.gitignore`: ignore local dependency/binary caches and development database files.
- `README.md`: link the integration setup.
- `backend/controllers/authController.js`: safe notification error logging channel only.
- `backend/package.json`, `backend/package-lock.json`: test command and isolated MongoDB test/development harness dependency.
- `backend/server.js`: capture exact signed bodies, mount attendance API, require replica-set support when enabled, initialize constraints, and close failed startup connections.
- `frontend/src/App.jsx`: Attendance navigation/page/title.
- `frontend/vite.config.js`: explicit port 5173 with strict-port behavior.

### biometric

Added:

- `ATTENDANCE_INTEGRATION.md`
- `backend/package-lock.json`
- `backend/src/app.js`
- `backend/src/starlit.js`
- `backend/tests/security.test.js`
- `frontend/.env.example`
- `frontend/package-lock.json`

Changed:

- `.gitignore`: ignore local npm cache.
- `README.md`, `SECURITY.md`: integration and corrected authentication-security documentation.
- `backend/.env.example`: dedicated local database, origins, ports, service configuration.
- `backend/package.json`: security test command.
- `backend/src/models.js`: stable employee link, canonical credential metadata, durable verification/outbox state and delivery leases.
- `backend/src/server.js`: app bootstrap, required indexes, optional replica-set check and delivery worker.
- `frontend/src/App.jsx`: action selection, canonical-name enrollment, verification sessions, protected registration, delivery receipts, model base path and attendance confirmation.
- `frontend/vite.config.js`: explicit strict port 5174.

Ignored local artifacts were also prepared: four `.env` files with random secrets, installed dependencies/caches, downloaded face weights, both `dist` builds, the cached MongoDB binary, and the dedicated local development database. No secrets are included in tracked source or this report.

## Operations and limits

[LOCAL_ATTENDANCE.md](LOCAL_ATTENDANCE.md) contains exact startup commands, environment variables, API behavior, report rules and remaining security limitations. The local superadmin password is `LOCAL_ADMIN_PASSWORD` in Starlit `backend/.env`; the enrollment key is `ADMIN_ENROLL_KEY` in SecureVerify `backend/.env`. Neither is printed here.

This remains a prototype: browser-generated descriptors are forgeable, robust liveness detection is absent, the face threshold is unvalidated, templates lack application encryption/retention controls, and enrollment uses a shared admin key. Passkeys do not reveal whether fingerprint, face or PIN was used. Stable Worker links prevent identity confusion, but renaming a linked employee ID requires an explicit mapping review/migration. Missing checkouts remain open and flagged rather than generating invented hours.
