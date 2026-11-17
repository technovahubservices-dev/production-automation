# Starlit employee storage and SecureVerify review

## Production status: audit results required

No production records were written. No commit, push or deployment was performed. The biometric repository is unchanged.

Both projects' local MongoDB settings point to localhost, not production. The Starlit read-only audit and restoration dry run were attempted, including a run with network access outside the sandbox; both failed with `MongooseServerSelectionError` because the configured local database was unavailable. No production connection string was available to this task. No database credentials or service keys were printed.

Consequently, the current production presence, names, statuses, `_id` values and dependencies of **each of EMP001-EMP010 remain unverified**. No employees have been approved for restoration, and no missing-record list has been inferred from fixtures or test databases.

Production investigation needs read-only audit output from the intended MongoDB database. The user was asked to run the existing audit and dry run in Render or supply an existing secure environment-file path. If the deployed backend-only service cannot access the recovery fixture, use a full local checkout with the production URI configured privately; the deployment directory correction below also resolves that limitation after a separately approved release.

## Confirmed architecture and findings

1. Starlit Employee Management sends authenticated `POST /api/workers`. The controller calls `Worker.create`; Mongoose stores the employee in MongoDB's `workers` collection. IDs are trimmed/uppercased, names trimmed, and an employeeId unique index is declared. Sequential duplicates return 400; concurrent unique-index collisions return 409. EMP008-EMP010 follow this storage path if created by the current application; their actual production records still require audit confirmation.
2. Work Entry and Workers already use authenticated `GET /api/workers` through `useWorkers`. Employee Management uses the same hook and refreshes after saves. Dashboard also fetches Workers; Attendance retrieves active MongoDB employees in its response. Department, Production, Reports and Overview display API-backed historical work-entry snapshots, preserving names/history rather than rewriting old records.
3. One unused legacy component, `WorkerPanel.jsx`, still imported hardcoded activity from `data/workers.js`. That import is removed; it now renders API-derived entries supplied by its caller or `worker.activities`. Its fixed demo date is removed. This unused component is **not established as the root cause of the reported live SecureVerify failures**.
4. `workers.js` remains intact as a recovery fixture, with an explanatory comment. Audit/restoration scripts still read its seven identities; the restoration script validates them against all seven confirmed ID/name pairs. No live frontend module imports it after this change.
5. SecureVerify enrollment name autofill calls its admin-protected `GET /api/employees/:employeeId/lookup`. Its backend signs `GET /api/attendance/employees/:employeeId` with HMAC; Starlit normalizes the ID and searches MongoDB for an Active Worker. It returns the canonical name and Worker `_id`. Enrollment checks the existing `starlitWorkerId` before accepting the mapping and preserves existing passkeys. Name lookup is not biometric authentication.
6. Attendance writes still require the existing verified passkey/face session and signed service envelope. No authentication, authorization, enrollment, HMAC, secret, integration flag, retry, or attendance business logic was changed.

The reported production lookup root cause is therefore **not yet established**. Missing workers, inactive status, identity conflicts, or integration configuration must be distinguished with the actual production audits and signed lookup responses. The existence of the old frontend fixture does not prove that production MongoDB records are missing.

## Safer audit and restoration preparation

The read-only audit now includes existing Worker IDs, inactive/duplicate/unnormalized IDs, historical work-entry name conflicts, attendance names and Worker mappings, and orphaned attendance session/event/cursor references. The restoration dry run performs the same dependency checks. Recreating a missing Worker with a new `_id` when attendance still refers to an old identity is blocked.

The default restoration path remains insert-only. A later approved application snapshots Workers before database writes, fingerprints work entries plus attendance collections, uses a transaction and the existing unique index, and verifies preserved existing Workers and history. A new isolated test runs the actual CLI dry run and application twice against a disposable database, validating the backup and idempotency. The older `--resolve-emp001-test` rename option remains legacy code for separate historical workflows; it is explicitly excluded from this task and from current instructions.

The scripts cannot inspect the separate production SecureVerify database automatically. Before approving any insertion, review its enrollment and queued-event Worker mappings. Existing enrollments/passkeys must never be deleted, reset, overwritten, or remapped to bypass an identity conflict.

## Files inspected

Starlit:

- `frontend/src/data/workers.js`
- `frontend/src/hooks/useWorkers.js`
- `frontend/src/components/EmployeeManagement.jsx`, `WorkerPanel.jsx`
- `frontend/src/pages/WorkEntry.jsx`, `Workers.jsx`, `Attendance.jsx`, `Dashboard.jsx`, `Department.jsx`, `Production.jsx`, `Reports.jsx`, `ProductionDashboard.jsx` (employee/API references and relevant loading/rendering sections)
- `frontend/src/utils/workerDirectory.js`, `frontend/src/App.jsx`, `frontend/src/config/api.js`
- `backend/controllers/workerController.js`, `workEntryController.js`
- `backend/models/Worker.js`, `AttendanceSession.js`, `AttendanceEvent.js`, `AttendanceCursor.js`
- `backend/routes/workerRoutes.js`, `attendanceRoutes.js`
- `backend/middleware/biometricServiceAuth.js`, `backend/services/attendanceService.js`
- `backend/app.js`, `backend/server.js`, `backend/config/departments.js`
- `backend/scripts/auditEmployees.js`, `restoreOriginalEmployees.js`, `EMPLOYEE_RESTORATION.md`
- Existing employee audit/restoration/worker-flow/attendance-integration tests, frontend test harnesses, package scripts, `render.yaml`, and private env target classification (no values disclosed)

SecureVerify (read-only inspection):

- `backend/src/starlit.js`, `app.js`, `models.js`, production configuration behavior
- `frontend/src/App.jsx`, especially the enrollment lookup/autofill effect
- Backend security/configuration tests, frontend production tests and package scripts, `render.yaml`, private env target classification

## Files changed

| File | Change |
| --- | --- |
| `frontend/src/components/WorkerPanel.jsx` | Replace the remaining fixture import with supplied live activities; remove demo date |
| `frontend/src/data/workers.js` | Mark retained data as recovery-only; preserve all identities |
| `backend/scripts/auditEmployees.js` | Report IDs/status/duplicate/history conflicts and attendance dependencies |
| `backend/scripts/restoreOriginalEmployees.js` | Include dependency checks and attendance fingerprints in backup/verification |
| `backend/scripts/employeeDependencies.js` (new) | Shared read-only attendance summaries and conflict detection |
| `backend/scripts/verifyEmployeeLookups.js` (new) | Authenticated read-only EMP001-EMP010 API checks for both services |
| `backend/scripts/EMPLOYEE_RESTORATION.md` | Current review-first, insert-only workflow; exclude legacy rename option |
| `backend/tests/employeeDependencies.test.js` (new) | All original identities and conflicting/orphaned dependencies |
| `backend/tests/employeeLookupIntegration.test.js` (new) | Real MongoDB, creation/duplicates, ten signed/proxied lookups, preservation and restoration CLI safety |
| `frontend/tests/employees.mjs` (new) | Dynamic hook/refresh/errors, Work Entry options, panel, SecureVerify autofill and stale-response rejection |
| `render.yaml` | Use full repository root with backend-prefixed commands so shared code and recovery fixtures are available |
| `EMPLOYEE_STORAGE_REPORT.md` (new) | Findings, limits, tests and deployment/review steps |

## Validation

All database-backed checks used disposable local MongoDB replica sets, never production. Fixtures for later employee names are synthetic test data, not a claim about production EMP008-EMP010 identities.

- Starlit full backend suite: **58 passed**, zero failures/skips; includes the existing real WebAuthn/HMAC/check-in/check-out integration suite.
- Focused employee suite: **17 passed**, including the actual restoration CLI dry run, backup, insert-only apply and repeat-run preservation on a temporary database.
- SecureVerify unchanged backend suite: **5 passed**.
- New employee frontend check: **passed**; tests SecureVerify's existing lookup effect without editing that repository.
- Existing attendance and login UI checks: **passed**.
- Starlit frontend production build: **passed**.
- Frontend lint: exit 0, existing unrelated warnings.
- Production employee audit and restoration dry run: **unavailable**, local target connection failed; no conclusion about production records.
- Production signed/proxied lookups EMP001-EMP010: **pending production execution environment**. All ten passed through both real HTTP services in the isolated integration test.

Reproduce local validation:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation
npm --prefix backend test
Push-Location frontend
node tests/employees.mjs
node tests/attendance.mjs
node tests/login.mjs
npm run build
npm run lint
Pop-Location
npm --prefix ..\biometric\backend test
git diff --check
```

## Production read-only review before writes

Run in the Starlit backend directory with the intended production environment securely configured, preserving any existing credentials:

```text
node scripts/auditEmployees.js
node scripts/restoreOriginalEmployees.js --dry-run
node scripts/verifyEmployeeLookups.js --base-url https://production-automation-5ss0.onrender.com
```

Do not run `--apply` or `--resolve-emp001-test`. Review all ten Worker records and the seven exact original names, statuses, duplicate/index state, history and attendance mappings. Report only the necessary audit output, never connection strings or service secrets. A conflict blocks the whole restoration proposal; no automatic rename/deactivation/reactivation is authorized.

For the separate biometric mapping review, this read-only command can run in the **existing SecureVerify Render backend shell**, using its existing environment and dependency. It deliberately excludes descriptors, credential bytes and session/receipt IDs:

```bash
node --input-type=module <<'NODE'
import mongoose from 'mongoose';
const ids = Array.from({ length: 10 }, (_, i) => `EMP${String(i + 1).padStart(3, '0')}`);
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const employees = await db.collection('employees').aggregate([
    { $match: { employeeId: { $in: ids } } },
    { $project: { _id: 0, employeeId: 1, name: 1, starlitWorkerId: 1, passkeyCount: { $size: { $ifNull: ['$credentials', []] } } } },
    { $sort: { employeeId: 1 } }
  ]).toArray();
  const queued = await db.collection('verificationsessions').aggregate([
    { $match: { 'event.employeeId': { $in: ids }, delivery: 'pending' } },
    { $group: { _id: { employeeId: '$event.employeeId', workerId: '$event.workerId' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log(JSON.stringify({ employees, queued }, null, 2));
} catch { console.error('Read-only biometric audit failed; no records changed.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
NODE
```

Compare `starlitWorkerId` and pending-event worker IDs with Starlit Worker `_id` values. Legacy enrollments without a mapping also need review before insertion; absence of `starlitWorkerId` is not proof that replacing an identity is safe.

The new lookup helper's `--secureverify` mode additionally checks the proxy with `ADMIN_ENROLL_KEY` supplied privately in its execution environment. It makes GET requests only. It never bypasses face or passkey checks.

The proposed database action list remains **pending these audits**. If the audits show only missing originals and no conflicting historical/biometric mappings, prepare precisely those inserts and a durable Worker backup for user approval. EMP008-EMP010 and all existing records remain unchanged. Any identity conflict requires a separate user decision; do not infer permission from older restoration documentation.

## Deployment instructions, only after explicit release approval

1. Review the local diff and test results. No automated commit, push, deployment or production migration was performed. Publishing these changes and approving database restoration are separate actions.
2. Preserve Render's current production `MONGO_URI`, JWT secret, integration secret/flag and email settings. No secret rotation is required. Preserve SecureVerify's `MONGODB_URI`, admin key, service secret, `STARLIT_INTEGRATION_ENABLED=true`, `STARLIT_API_URL=https://production-automation-5ss0.onrender.com`, and `DEMO_MODE=false`. Do not replace production values with localhost env values.
3. In the existing Starlit Render service, keep the same repository, `master` branch and health check `/`. Set Root Directory to the repository root (clear `backend`), Build Command to `npm --prefix backend ci --omit=dev`, and Start Command to `npm --prefix backend start`. The revised `render.yaml` records these settings. The current backend imports `shared/departments.json`, and the recovery scripts need `frontend/src/data/workers.js`; files outside a configured service root are unavailable at runtime. See [Render monorepo documentation](https://render.com/docs/monorepo-support).
4. After a separately authorized commit/push, Render → Manual Deploy → Deploy latest commit, or deploy the reviewed specific SHA. Confirm healthy MongoDB connection and listener startup. A restart of old code does not release these changes. See [Render deployment documentation](https://render.com/docs/deploys).
5. In the existing Starlit Vercel project, preserve its hosting/domain settings and any combined biometric build. Ensure `VITE_API_URL=https://production-automation-5ss0.onrender.com` in the environment serving the intended frontend. Deploy the reviewed new frontend commit; redeploy that commit if environment variables were changed afterward. Vite variables are embedded at build time. See [Vercel environment variable documentation](https://vercel.com/docs/environment-variables/managing-environment-variables).
6. No SecureVerify code deployment is needed for these local changes. Its MongoDB-backed proxy and autofill were already implemented; only verify the existing production configuration and mappings.
7. Re-run the read-only audits and ten-ID lookup checks after release. Deployment alone does not create missing Workers. Do not apply any restoration until the user has approved its actual production plan and durable backup.
8. After any separately approved restoration, verify each EMP001-EMP010 lookup and original name, open Starlit Work Entry and refresh employees, and confirm new API-backed employees appear. In SecureVerify enrollment mode, enter the existing admin key privately and each ID to verify name autofill. Do not re-enroll existing employees merely to test lookup. An attendance smoke test must use the normal face/passkey flow and an authorized real attendance action; do not send fabricated production check-in/out events.
