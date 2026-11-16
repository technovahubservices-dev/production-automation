# Local Starlit + SecureVerify attendance

Attendance is separate from production WorkEntries. This integration does not change production hours, output calculations, historical records, settings, or employee-management permissions. It is a biometric prototype, not a production attendance assurance system.

## Prerequisites and first setup

Use Node.js 22.12+ (tested with 24.21), npm, PowerShell, a supported WebAuthn browser/device, and a camera. Keep both repositories beside one another as `production-automation` and `biometric`.

From PowerShell:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix ..\biometric\backend ci
npm --prefix ..\biometric\frontend ci
```

Four local `.env` files have been generated for this workspace. On a fresh copy without `.env` files, run:

```powershell
node backend/scripts/configureLocalIntegration.js
```

The helper refuses to overwrite any existing `.env`. It generates random login, enrollment, and service secrets, uses only the dedicated local replica set below, and does not connect to a database. On another machine, edit the two project paths in these instructions as needed.

## Start the local database

In terminal 1:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation\backend
node scripts/startLocalMongo.js
```

This launches a MongoDB 8.0.17 single-node replica set named `starlit-local`, bound to `127.0.0.1:27018`. The first launch may download MongoDB. Data persists in `backend/.local-mongo`; Ctrl+C stops the database without removing its data. No installed MongoDB service, existing database, or production URI is used. The test binary is cached in `.test-mongodb`. These paths are git-ignored.

MongoDB transactions are required for atomic session updates, receipts, and outbox sequencing. Do not use a standalone MongoDB instance for attendance. Existing standalone Starlit operation remains available when the integration is disabled.

## Create a local login, then start both apps

Once the local database says it is ready, run once in another terminal:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation\backend
node scripts/createLocalAdmin.js
```

This helper only accepts the exact dedicated local Starlit URI. It creates `superadmin` using `LOCAL_ADMIN_PASSWORD` from Starlit's `backend/.env`, and preserves an existing account. No employees are seeded and no production employee data is copied. Avoid the older seed scripts for this setup: they reset their named accounts.

Run the following in four separate terminals:

```powershell
# Terminal 2: Starlit API
Set-Location C:\Users\Admin\Desktop\production-automation\backend
npm run dev
```

```powershell
# Terminal 3: Starlit frontend
Set-Location C:\Users\Admin\Desktop\production-automation\frontend
npm run dev
```

```powershell
# Terminal 4: SecureVerify API
Set-Location C:\Users\Admin\Desktop\biometric\backend
npm run dev
```

```powershell
# Terminal 5: SecureVerify frontend
Set-Location C:\Users\Admin\Desktop\biometric\frontend
npm run dev
```

Download face models once, if not already installed:

```powershell
Set-Location C:\Users\Admin\Desktop\biometric
powershell -ExecutionPolicy Bypass -File scripts/download-models.ps1
```

Open Starlit at `http://localhost:5173` and SecureVerify at `http://localhost:5174/biometric/`. Use **localhost**, not an interchangeable IP hostname, for WebAuthn origin consistency. SecureVerify loads models from `/biometric/models`.

Login as `superadmin`; retrieve its password from `LOCAL_ADMIN_PASSWORD` in Starlit's local `.env`. Create employees through **Workers**. In SecureVerify, choose **Employee enrollment**, enter an existing active employee ID and the `ADMIN_ENROLL_KEY` from its local `.env`, start the camera, enroll the face, and register the employee's passkey. Starlit's canonical name replaces the supplied name. Only an authorized enrollment can link a previously standalone SecureVerify employee to Starlit.

Select **Check In** or **Check Out**, then verify. **Verify identity only** preserves standalone verification without attendance writes. A verified identity can still have a rejected attendance action; read the attendance confirmation separately. Pending delivery is retried automatically and the receipt is polled while visible.

## Environment variables

| File | Variables |
|---|---|
| Starlit `backend/.env` | `PORT=5000`; `MONGO_URI=mongodb://127.0.0.1:27018/starlit_local?replicaSet=starlit-local`; random `JWT_SECRET`; `BIOMETRIC_INTEGRATION_ENABLED=true`; shared random `BIOMETRIC_SERVICE_SECRET`; `LOCAL_ADMIN_PASSWORD` for the local account helper only |
| Starlit `frontend/.env` | `VITE_API_URL=http://localhost:5000` (without `/api`) |
| SecureVerify `backend/.env` | `PORT=5001`; `MONGODB_URI=mongodb://127.0.0.1:27018/biometric_verification_local?replicaSet=starlit-local`; `RP_ID=localhost`; `RP_NAME`; `ORIGIN=http://localhost:5174`; random `ADMIN_ENROLL_KEY`; `DEMO_MODE=false`; `STARLIT_INTEGRATION_ENABLED=true`; `STARLIT_API_URL=http://localhost:5000`; same `BIOMETRIC_SERVICE_SECRET` |
| SecureVerify `frontend/.env` | `VITE_API_URL=http://localhost:5001/api` (includes `/api`) |

Example files and generated configuration use port 27018 / replica set `starlit-local`. Enrollment and service keys require at least 32 characters. Secrets belong only in backend `.env` files; never in `VITE_*` settings or source control. Existing optional Starlit SMTP settings remain supported; the local setup leaves them unset.

To use SecureVerify standalone, set `STARLIT_INTEGRATION_ENABLED=false`. To disable Starlit integration endpoints, set `BIOMETRIC_INTEGRATION_ENABLED=false`. Demo mode supports identity-only demonstrations and never creates attendance.

## Attendance and reporting rules

- Check In opens one session per stable Starlit Worker ID. Another Check In is rejected until checkout.
- Check Out closes that open session, including across midnight. Checkout without an open session is rejected.
- Any number of completed sessions per day is permitted. Time between sessions is excluded; no automatic break deduction, payroll rounding, overtime, or schedule inference is applied.
- Completed duration is the exact difference between full UTC timestamps. Display/CSV hours are formatted; database durations are not rounded.
- All session hours belong to the India check-in date. A January 31 22:00–February 1 06:00 session contributes eight hours to January 31 and January's report.
- Open sessions have zero finalized hours and a separate live elapsed display. Superadmins see open sessions outside the selected reporting period. There is no automatic checkout or fabricated correction.
- Starlit **Attendance** has daily reports for admins and daily/monthly history for superadmins, employee/status filters, session details, daily totals, and separate summary/session CSV exports. Filters apply to report totals. Employees without records show “No attendance recorded”; this does not imply absence or leave.
- Attendance snapshots preserve the employee name at check-in. The Starlit Worker record controls new actions. Missing/inactive workers and stale employee-ID mappings are rejected. Employee IDs should remain stable after linking; renames/reassignment require an explicit audited mapping migration, not automatic relinking. History is preserved.

## API and reliability

Starlit:

- `GET /api/attendance/employees/:employeeId`: service-authenticated active employee lookup.
- `POST /api/attendance/biometric`: service-authenticated attendance ingestion.
- `GET /api/attendance?date=YYYY-MM-DD` or `?month=YYYY-MM`: existing user JWT, with optional `employeeId` and `status`. Server enforces role/date restrictions.

SecureVerify retains its enrollment/passkey/face/audit API. Options now return `sessionId`; verify requests must include that session ID and the same employee/action. Register endpoints both require `x-admin-key`. `GET /api/attendance/receipt/:id` accepts a high-entropy scoped bearer receipt, so receipt IDs must be treated as private.

Service requests use HMAC-SHA256 over destination label, method, exact path, timestamp, and exact body. Signatures expire after 60 seconds; retries get a fresh signature but retain the original event ID, verification time, and sequence. HTTP is permitted only to loopback; remote service URLs must use HTTPS. No face templates or passkey credentials are transmitted to Starlit.

Each employee's events are transactionally numbered and persisted with verification. The worker's delivery lease and sequence checks prevent checkout overtaking check-in. A lost response is safe: Starlit returns the stored event outcome and rejects event-ID reuse with changed data. Rejected business actions consume their sequence and are shown to the user; transport/configuration failures remain pending with exponential backoff capped at 60 seconds. Pending receipts are not TTL-deleted. Permanent mapping/configuration conflicts must be reviewed; do not reset counters or delete receipts to unblock them.

## Tests and builds

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation
npm --prefix backend test
```

The cross-project integration test expects both sibling checkouts and their backend dependencies. It creates temporary databases in its own isolated replica set, uses real ES256 WebAuthn registration/assertions, and never loads either `.env`. MongoDB is downloaded on first run. Use the frontend's own working directory for Vite-based tests:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation\frontend
node tests/adminDate.mjs
node tests/departments.mjs
node tests/attendance.mjs
npm run build
Set-Location C:\Users\Admin\Desktop\biometric\backend
npm test
Set-Location C:\Users\Admin\Desktop\biometric\frontend
npm run build
```

See `ATTENDANCE_VALIDATION.md` for results and existing stale-test failures. Physical camera/authenticator operation still needs an interactive check on the employee device.

## Remaining biometric limitations

Face descriptors are still computed in the browser and can be forged; comparing them on the server does not establish camera authenticity. There is no robust liveness/presentation-attack detection. The 0.48 threshold has not been validated for a real workforce. Passkeys require user verification but cannot prove whether the device used fingerprint, face, or PIN. Enrollment still uses a shared admin key rather than per-administrator identity, consent, or review. Templates are not application-encrypted at rest, and automated retention/deletion and account recovery are not implemented. Backend clocks must be synchronized. Do not treat this prototype as payroll-grade proof of presence or production biometric access control.
