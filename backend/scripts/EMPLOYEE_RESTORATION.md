# Review employees before any restoration

This task authorizes read-only production investigation only. Do not run `--apply` until the user approves a concrete plan based on production audit results. Do not use the legacy `--resolve-emp001-test` option: it permits a rename, whereas the current task requires stopping on identity conflicts and preserving existing names.

From a complete Starlit checkout with the intended database configured in `MONGO_URI`:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation\backend
node scripts/auditEmployees.js
node scripts/restoreOriginalEmployees.js --dry-run
```

The scripts use an already-set process `MONGO_URI` in preference to `backend/.env`. Check the intended target privately. The current local env points to localhost and cannot establish production state. Do not paste connection strings into chat, shell command arguments, reports or Git.

The confirmed recovery identities remain in `frontend/src/data/workers.js`. That file is retained for recovery and is no longer imported by live frontend components. The dry run validates all seven identities before planning changes. It reads Workers, work-entry names, attendance sessions, attendance events, and attendance cursors. Duplicate or unnormalized IDs, inactive originals, name conflicts, historical conflicts, and orphaned or mismatched attendance Worker references block restoration. A missing record does not establish that creating a new `_id` is safe: check SecureVerify mappings and queued events in its separate database too.

Before approval, review EMP001-EMP010, original names, statuses, existing Worker `_id` values, history counts/names, and SecureVerify `starlitWorkerId` mappings. Preserve EMP008-EMP010 exactly. If a missing Worker has an existing enrollment or queued event referring to its old `_id`, stop for identity recovery review; do not insert a replacement and do not re-enroll or delete credentials as a workaround.

The default approved restoration path inserts missing originals using `$setOnInsert`, existing schema defaults and an existing unique employeeId index. It never updates matching existing Workers. It rechecks the plan inside a MongoDB transaction, snapshots Workers to a git-ignored JSON backup BEFORE writes, and verifies WorkEntry plus attendance session/event/cursor fingerprints and existing Worker records before commit. There is no nontransactional fallback. Keep the backup on durable private storage; a Render ephemeral filesystem is not a durable backup destination. Do not commit backup files. The isolated automated test exercises backup, dry-run, apply, idempotency, history preservation and unchanged newer employees against a disposable database only.

No production apply was run for this task. A production apply command will only be appropriate after the actual audit, separate biometric mapping review, a durable backup plan, and explicit user approval.

## Read-only lookup checks

The new helper requires an explicit origin and reads only employee lookup routes:

```powershell
# Use the production service secret in the private execution environment, not in arguments.
node scripts/verifyEmployeeLookups.js --base-url https://production-automation-5ss0.onrender.com
# Requires ADMIN_ENROLL_KEY for the intended SecureVerify backend in that environment.
node scripts/verifyEmployeeLookups.js --base-url https://biometric-1z8l.onrender.com --secureverify
```

Each command checks EMP001-EMP010. The first checks signed Starlit MongoDB lookup; the second checks SecureVerify's admin-protected proxy and its signed call to Starlit. Both validate the original seven names exactly. Later employee names are reported from the actual API rather than invented. The helper prints no keys, HMAC headers, connection strings, face descriptors or passkey material. It exits nonzero if any ID fails. A failure may be authentication, configuration, connectivity or employee state; it is not proof of missing MongoDB records.

These GET checks do not enroll employees, authenticate passkeys, match faces or record attendance. Full face/passkey verification remains required for attendance.

See [EMPLOYEE_STORAGE_REPORT.md](../../EMPLOYEE_STORAGE_REPORT.md) for inspected files, results and deployment instructions.
