# Restore the confirmed original employees

Run from the repository root in PowerShell:

```powershell
Set-Location backend
node scripts/auditEmployees.js
node scripts/restoreOriginalEmployees.js --dry-run --resolve-emp001-test
```

Review the audit before applying:

```powershell
node scripts/restoreOriginalEmployees.js --apply --resolve-emp001-test
node scripts/auditEmployees.js
```

The scripts read `backend/.env` and use its existing `MONGO_URI`. No credentials belong in command arguments. The migration reads the confirmed identities from `frontend/src/data/workers.js`, validates all seven identities, and never imports employees from historical WorkEntries automatically.

**Confirmed EMP001 correction:** the user confirmed that EMP001 - Test is a temporary Worker and the original source plus eight historical entries identify EMP001 as Abinesh. The explicit `--resolve-emp001-test` flag permits ONLY this exact correction. The live audit must still find an existing Worker _id and historical entries whose names exclusively equal Abinesh. Conflicting historical names, other name conflicts, or duplicate IDs still stop all writes. Without the flag, Test remains a blocking conflict.

The dry-run lists the proposed correction (including its existing _id and dependency count), the six missing employees, and any remaining conflicts. It makes no writes. Do not apply until the dry-run has been reviewed and application is approved.

On a later approved apply, the EMP001 update matches its existing _id, employeeId EMP001, and name Test, uses no upsert, and sets only employeeId EMP001, name Abinesh, and status Active. It preserves timestamps and optional fields. If that record changed since the audit, the transaction aborts. The existing-record verification permits only this exact change. WorkEntry fingerprints must remain unchanged. On rerun, an already corrected Active EMP001 is left unchanged.


The apply command audits again. Any duplicate ID, conflicting name, historical identity conflict, or inactive original Worker blocks all writes. Apart from the explicitly authorized correction, matching Active employees remain byte-for-byte unchanged, including optional fields and timestamps. New originals use the existing Worker schema defaults and Active status. Additional legitimate workers are preserved. Only missing original IDs receive `$setOnInsert` upserts, protected by an existing unique employeeId index.

Applying requires MongoDB transaction support (Atlas/replica set) and an existing unique employeeId index. There is no destructive or nontransactional fallback. Each transaction attempt writes a local, git-ignored Worker backup plus a WorkEntry fingerprint. No WorkEntry writes occur. A failed verification aborts the transaction. Successful application exercises the existing getWorkers controller's Active query and prints all returned IDs/names, total Worker count, and Active API count. Reruns do not duplicate or update restored employees.

The controller verification is not a browser login or an HTTP authentication test. After success, start/restart the backend if needed, sign in, open Work Entry, and click Refresh employees. The dropdown continues using authenticated GET /api/workers. Check all seven originals plus later Active employees. No new test employee is needed.

If network access fails, no completed restoration is implied. Keep the audit output and resolve connectivity before running apply.
