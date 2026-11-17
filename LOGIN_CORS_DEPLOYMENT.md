# Starlit login CORS fix

## Diagnosis

Verified against the live Starlit backend on November 17, 2026:

| Request | Result before deployment |
| --- | --- |
| OPTIONS `/api/auth/login`, Origin `https://frontend-seven-silk-lcv373ygdo.vercel.app` | 403, `Origin is not permitted.`, no Access-Control-Allow-Origin |
| OPTIONS `/api/auth/login`, Origin `https://technovahub.in` | 204, matching Access-Control-Allow-Origin |
| POST `/api/auth/login`, main-domain origin, synthetic nonexistent username | 401, `Invalid username or password.`, matching Access-Control-Allow-Origin |

The Vercel origin was missing from `backend/config/cors.js`. This was an application CORS rejection before authentication, rather than evidence of a MongoDB failure. The allowed-domain invalid login also confirmed that the deployed authentication/database lookup could respond normally at the time of testing. A successful login with an existing production account still requires user verification after deployment.

The existing global `cors` middleware already handled OPTIONS and preceded JSON parsing and all routes. Its order remains: CORS, CORS error handler, JSON/raw-body parsing, attendance routes, health route, other API routes including `/api/auth`. MongoDB connection and replica-set checks still finish before the server listens.

`NODE_ENV` is the only environment variable controlling the CORS allowlist. Production previously allowed only the apex and www domains. Non-production also allowed localhost ports 5173 and 5174. No `CORS_ORIGIN` or similar variable is read.

Login uses `POST /api/auth/login`, Mongoose user lookup, bcrypt verification, and a 12-hour JWT containing the user's ID and role. The frontend stores token/user in localStorage, sends bearer tokens for protected APIs, and removes them on logout. It does not use cookie authentication or `credentials: include`.

Other frontend calls already use `frontend/src/config/api.js` and `VITE_API_URL`. Login alone hardcoded the Render backend URL; it now uses that shared configuration. The existing production env file already supplies the correct Starlit backend URL.

## Changed files

- `backend/config/cors.js`: add the exact authorized Vercel origin; retain both custom domains and the existing non-production localhost policy. Explicitly include HEAD and OPTIONS alongside existing methods. Permit Content-Type and Authorization; keep cookie credentials disabled. Originless service calls remain permitted, subject to their existing authentication.
- `backend/app.js` (new): extract the existing Express stack into `createApp` so HTTP tests use the production middleware and routes without loading local env files or starting a production database connection. Raw-body capture for HMAC is preserved.
- `backend/server.js`: instantiate that app; retain dotenv loading, MongoDB startup, integration initialization, and listener behavior.
- `backend/tests/cors.test.js`: exact allowlist and development policy checks; HTTP preflight, blocked-origin, malformed-body and login checks using an isolated temporary MongoDB replica set. Verify real bcrypt/JWT behavior, both roles, authorization, and unchanged fixture records after login.
- `frontend/src/pages/Login.jsx`: use the shared API URL; retain the existing submit, token storage, callback and error behavior.
- `frontend/tests/login.mjs` (new): exercise the real submit handler with controlled HTTP responses; verify configured URL, payload, token/user storage and invalid-credential errors.
- `LOGIN_CORS_DEPLOYMENT.md` (new): diagnosis, validation and release instructions.

No biometric repository files, authentication controllers/models, authorization rules, passwords, production database records, integration flags/secrets, signature validation, or logout code were changed. No env files were modified.

## Validation results

Run from the project root in PowerShell:

```powershell
npm --prefix backend test
npm --prefix frontend run build
Push-Location frontend
node tests/login.mjs
node tests/attendance.mjs
node --test src/context/productionUnits.test.js
Pop-Location
node tests/password-management-ui.mjs
npm --prefix frontend run lint
git diff --check
```

- Backend: **48 tests passed**, zero failures/skips. Includes CORS and real MongoDB login, existing password/auth tests, biometric HMAC tampering/stale request rejection, signed employee lookup, real WebAuthn enrollment/authentication, attendance recording, outage retries, replay handling and production passkey origin checks.
- Frontend production build: **passed**.
- New login UI check: **passed**.
- Existing attendance UI check: **passed**.
- Existing production units unit test: **failed** under Node 24.21.0 with `ERR_IMPORT_ATTRIBUTE_MISSING`; unchanged `productionUnits.js` imports JSON without a Node JSON import attribute.
- Existing password management UI script: **failed** at `tests/password-management-ui.mjs:113`, checking Settings section/button text in unchanged UI code.
- Frontend lint: exit 0, with existing warnings in unrelated components.
- `git diff --check`: passed.

Initial sandbox runs could not spawn Node/Vite/MongoDB subprocesses (`EPERM`). The results above are from subsequent approved runs outside that process restriction. All database-backed tests used temporary local databases; they did not load either project's .env or connect to production.

## Environment settings

Render requires **no new CORS variables**. Keep `NODE_ENV=production`. Preserve the current `MONGO_URI`, `JWT_SECRET`, `BIOMETRIC_SERVICE_SECRET`, `BIOMETRIC_INTEGRATION_ENABLED`, and email settings. Do not rotate secrets or run seed/reset scripts for this release.

In the existing Starlit Vercel project, check Settings → Environment Variables:

```text
VITE_API_URL=https://production-automation-5ss0.onrender.com
```

Use the backend root URL with no `/api` suffix. Set it for Production and for Preview if that environment serves the authorized Vercel frontend. A dashboard value overrides the repository's Vite env default. If it is already correct, no environment change is needed. Rebuild after changing Vite variables. Do not put secrets in VITE variables.

## Git commands for the user

Nothing has been committed, pushed or deployed by Codex. Review the diff, then run:

```powershell
Set-Location C:\Users\Admin\Desktop\production-automation
git diff --check
git diff
Get-Content backend/app.js
Get-Content frontend/tests/login.mjs
Get-Content LOGIN_CORS_DEPLOYMENT.md
git add -- backend/config/cors.js backend/app.js backend/server.js backend/tests/cors.test.js frontend/src/pages/Login.jsx frontend/tests/login.mjs LOGIN_CORS_DEPLOYMENT.md
git diff --cached --stat
git commit -m "Fix Starlit login CORS for authorized Vercel frontend"
git push origin master
```

These commands stage only the seven listed files. They do not stage env files. A push can trigger a Vercel Git deployment depending on existing project settings; check those settings before pushing if you need to control deployment timing. The checked-in Render blueprint disables automatic deployment, but confirm the actual service configuration.

## Manual deployment

1. Render Dashboard → existing `production-automation` service. Confirm the linked repository and `master` branch. Preserve root directory `backend`, build command `npm ci --omit=dev`, start command `npm start`, and health check `/`.
2. After the reviewed commit has been pushed, choose Manual Deploy → Deploy latest commit. Alternatively choose Deploy a specific commit and enter the new commit SHA. Confirm the deployed SHA includes this fix. Wait for successful MongoDB connection, server startup and a healthy service. See [Render deployment documentation](https://render.com/docs/deploys).
3. Verify the backend preflight below before testing the browser. The allowlist fix takes effect after the backend deployment; restarting the old code will not add the missing origin.
4. Check `VITE_API_URL` in the existing Starlit Vercel project as described above. Deploy the new frontend commit from `master`; if Git already created that deployment, inspect it rather than redeploying an older commit. If you changed environment variables afterward, use Deployments → the deployment for the new commit → Redeploy. Ensure the intended Production/Preview environment is selected. See [Vercel environment variable documentation](https://vercel.com/docs/environment-variables/managing-environment-variables).
5. Visit the three authorized frontend origins. A newly generated Vercel deployment hostname is a different origin and is intentionally not automatically allowed; use the authorized hostname or custom domains. Keep existing domain routing and any shared biometric hosting setup.

## Post-deployment verification

Run these commands in PowerShell. They make no database changes:

```powershell
$starlitApi = 'https://production-automation-5ss0.onrender.com'
$starlitOrigins = @('https://technovahub.in', 'https://www.technovahub.in', 'https://frontend-seven-silk-lcv373ygdo.vercel.app')
foreach ($starlitOrigin in $starlitOrigins) {
  curl.exe -i -X OPTIONS "$starlitApi/api/auth/login" -H "Origin: $starlitOrigin" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,authorization'
}
curl.exe -i -X OPTIONS "$starlitApi/api/auth/login" -H 'Origin: https://evil.test' -H 'Access-Control-Request-Method: POST'
'{"username":"cors-verification-nonexistent","password":"invalid-test-password"}' | curl.exe -i "$starlitApi/api/auth/login" -H 'Origin: https://frontend-seven-silk-lcv373ygdo.vercel.app' -H 'Content-Type: application/json' --data-binary '@-'
```

Expect each allowed preflight to return 204 with an exactly matching `Access-Control-Allow-Origin`, `Vary: Origin`, the listed methods, and Content-Type/Authorization headers. No `Access-Control-Allow-Credentials` is needed. Expect the foreign origin to return 403 with no allow-origin header. Expect the invalid login to return 401 JSON with the authorized Vercel allow-origin header.

In Chrome DevTools → Network, enable Preserve log and open the authorized Vercel URL. Log in using an existing valid account privately. Check OPTIONS 204, POST `/api/auth/login` 200, the matching allow-origin header, dashboard entry, and authenticated requests using the returned bearer token. Check existing admin/superadmin permissions, logout, and an invalid login displaying the authentication error without a CORS failure. Never paste production credentials or JWTs into logs or this document.

Use the existing SecureVerify enrollment/employee lookup workflow to confirm the canonical Starlit employee is returned. Confirm that existing enrollment and passkey/face authentication remain usable. A real check-in/check-out creates attendance records: perform that operational smoke test only through the normal authorized attendance workflow, not through diagnostic curl commands. HMAC headers, service secret and integration flags are unchanged.

If a 502/503/504 or network error occurs after deployment, inspect Render health/startup logs and MongoDB connectivity. A proxy-generated error may lack CORS headers; the confirmed allowlist bug does not rule out a separate later outage. Do not change secrets or reset accounts to diagnose CORS.
