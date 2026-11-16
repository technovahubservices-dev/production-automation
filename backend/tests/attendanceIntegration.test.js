const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Worker = require('../models/Worker');
const User = require('../models/User');
const WorkEntry = require('../models/WorkEntry');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceCursor = require('../models/AttendanceCursor');
const { canonical } = require('../middleware/biometricServiceAuth');

// Minimal CBOR encoder for an actual ES256 virtual authenticator, without mocking verification.
function cbor(value) {
  const head = (major, n) => n < 24 ? Buffer.from([major * 32 + n]) : n < 256 ? Buffer.from([major * 32 + 24, n]) : Buffer.from([major * 32 + 25, n >> 8, n & 255]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (typeof value === 'number') return head(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}
function authenticator(rpID = 'localhost') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = crypto.randomBytes(32), id64 = id.toString('base64url');
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  let counter = 0;
  function data(flags) { const out = Buffer.alloc(37); crypto.createHash('sha256').update(rpID).digest().copy(out); out[32] = flags; out.writeUInt32BE(++counter, 33); return out; }
  function client(type, options, origin) { return Buffer.from(JSON.stringify({ type, challenge: options.challenge, origin: origin || 'http://localhost:5174', crossOrigin: false })); }
  return {
    id: id64,
    register(options, origin) {
      const size = Buffer.alloc(2); size.writeUInt16BE(id.length);
      const authData = Buffer.concat([data(0x45), Buffer.alloc(16), size, id, cose]);
      return { id: id64, rawId: id64, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: client('webauthn.create', options, origin).toString('base64url'), attestationObject: cbor({ fmt: 'none', authData, attStmt: {} }).toString('base64url'), transports: ['internal'] } };
    },
    authenticate(options, origin, flags = 0x05) {
      const authData = data(flags), clientData = client('webauthn.get', options, origin);
      const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]), privateKey);
      return { id: id64, rawId: id64, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url') } };
    },
  };
}

test('isolated replica-set integration: signed attendance, real WebAuthn, reports, concurrency and retries', { timeout: 300000 }, async t => {
  // Never read either project's .env or connect to a user-supplied database.
  const previous = { ...process.env };
  const secret = crypto.randomBytes(32).toString('hex');
  Object.assign(process.env, { BIOMETRIC_SERVICE_SECRET: secret, BIOMETRIC_INTEGRATION_ENABLED: 'true', STARLIT_INTEGRATION_ENABLED: 'true', ADMIN_ENROLL_KEY: crypto.randomBytes(32).toString('hex'), DEMO_MODE: 'false', ORIGIN: 'http://localhost:5174', RP_ID: 'localhost', JWT_SECRET: 'isolated-attendance-test-secret' });
  const repl = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: path.resolve(__dirname, '../../.test-mongodb') }, replSet: { count: 1 }, instanceOpts: [{ ip: '127.0.0.1' }] });
  let starlitServer, bioServer, bioMongoose;
  try {
    await mongoose.connect(repl.getUri('starlit_test'));
    await Promise.all([Worker, User, WorkEntry, AttendanceSession, AttendanceEvent, AttendanceCursor].map(model => model.init()));
    const app = express(); app.use(express.json({ verify: (req, _res, b) => { req.rawBody = b.toString(); } }));
    app.use('/api/attendance', require('../routes/attendanceRoutes'));
    starlitServer = app.listen(0, '127.0.0.1'); await new Promise(resolve => starlitServer.once('listening', resolve));
    const base = `http://127.0.0.1:${starlitServer.address().port}`;
    process.env.STARLIT_API_URL = base;
    const signed = async (event, alter = {}) => {
      const raw = JSON.stringify(event), timestamp = String(Date.now()), route = '/api/attendance/biometric';
      const signature = crypto.createHmac('sha256', secret).update(canonical('POST', route, timestamp, raw)).digest('hex');
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-service-timestamp': timestamp, 'x-service-signature': signature, ...alter }, body: raw });
      return { status: response.status, body: await response.json() };
    };
    const [admin, superadmin] = await User.create([{ name: 'Admin', username: 'admin', password: 'test-password', role: 'admin' }, { name: 'Super', username: 'super', password: 'test-password', role: 'superadmin' }]);
    const report = async (query, user = superadmin) => {
      const response = await fetch(base + '/api/attendance?' + query, { headers: { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}` } });
      return { status: response.status, body: await response.json() };
    };
    const worker = await Worker.create({ employeeId: 'EMP001', name: 'Original Name' });
    const history = await WorkEntry.create({ employeeId: 'EMP001', employeeName: 'Historic', date: '2024-01-31', department: 'CNC', hours: 2 });
    const fingerprint = JSON.stringify(await WorkEntry.findById(history._id).lean());
    const event = (sequence, action, verifiedAt) => ({ eventId: crypto.randomUUID(), workerId: String(worker._id), employeeId: 'EMP001', sequence, action, verifiedAt, checks: { passkey: true, face: true }, demoMode: false });
    await t.test('signatures reject tampering, stale requests and absent authentication', async () => {
      const e = event(1, 'CHECK_IN', '2024-01-31T16:30:00.000Z');
      assert.equal((await signed(e, { 'x-service-signature': '0'.repeat(64) })).status, 401);
      assert.equal((await signed(e, { 'x-service-timestamp': '1000000000000' })).status, 401);
      assert.equal(await AttendanceSession.countDocuments(), 0);
    });
    await t.test('concurrent replay is idempotent; duplicate scan does not open another session', async () => {
      const e = event(1, 'CHECK_IN', '2024-01-31T16:30:00.000Z');
      const results = await Promise.all(Array.from({ length: 5 }, () => signed(e)));
      assert.ok(results.every(r => r.status === 200 && r.body.data.accepted));
      assert.equal(await AttendanceSession.countDocuments(), 1);
      assert.equal((await signed(event(2, 'CHECK_IN', '2024-01-31T16:31:00.000Z'))).body.data.code, 'ALREADY_CHECKED_IN');
      assert.equal((await signed({ ...e, action: 'CHECK_OUT' })).status, 409);
    });
    await t.test('overnight checkout and multiple sessions produce January totals, preserving production', async () => {
      const out = event(3, 'CHECK_OUT', '2024-02-01T00:30:00.000Z');
      assert.equal((await signed(out)).body.data.session.durationMs, 8 * 3600000);
      assert.equal((await signed(out)).body.data.duplicate, true);
      assert.equal((await signed(event(4, 'CHECK_IN', '2024-01-31T10:00:00.000Z'))).body.data.code, 'OUT_OF_ORDER');
      // A second completed session on another day exercises monthly accumulation.
      await signed(event(5, 'CHECK_IN', '2024-02-01T02:00:00.000Z'));
      await signed(event(6, 'CHECK_OUT', '2024-02-01T03:00:00.000Z'));
      assert.equal((await report('month=2024-01')).body.summary[0].totalHours, 8);
      assert.equal((await report('month=2024-02')).body.summary[0].totalHours, 1);
      await signed(event(7, 'CHECK_IN', '2024-02-01T04:00:00.000Z'));
      await signed(event(8, 'CHECK_OUT', '2024-02-01T05:00:00.000Z'));
      const feb = (await report('month=2024-02')).body.summary[0];
      assert.equal(feb.totalHours, 2); assert.equal(feb.attendanceDays, 1); assert.equal(feb.sessionCount, 2);
      assert.equal(JSON.stringify(await WorkEntry.findById(history._id).lean()), fingerprint);
      assert.equal((await signed(event(9, 'CHECK_OUT', '2024-02-01T06:00:00.000Z'))).body.data.code, 'NO_OPEN_SESSION');
      assert.equal((await signed(event(11, 'CHECK_IN', '2024-02-01T07:00:00.000Z'))).status, 409);
    });
    await t.test('reports enforce role/date access, filters and input validation', async () => {
      assert.equal((await report('month=2024-01', admin)).status, 403);
      assert.equal((await report('date=2024-01-31', admin)).status, 403);
      assert.equal((await report('date=2024-02-31')).status, 400);
      assert.equal((await report('month=2024-01&employeeId=EMP001&status=Checked%20Out')).body.data.length, 1);
      assert.equal((await report('month=2024-01&employeeId=UNKNOWN')).body.data.length, 0);
    });
    await t.test('inactive and mismapped employees cannot record attendance', async () => {
      await Worker.updateOne({ _id: worker._id }, { $set: { status: 'Inactive' } });
      assert.equal((await signed(event(10, 'CHECK_IN', '2024-02-01T07:00:00.000Z'))).body.data.code, 'EMPLOYEE_UNAVAILABLE');
      await Worker.updateOne({ _id: worker._id }, { $set: { status: 'Active' } });
      assert.equal((await signed({ ...event(11, 'CHECK_IN', '2024-02-01T08:00:00.000Z'), employeeId: 'WRONG' })).body.data.code, 'EMPLOYEE_UNAVAILABLE');
    });
    bioMongoose = (await import('../../../biometric/backend/node_modules/mongoose/index.js')).default;
    await bioMongoose.connect(repl.getUri('biometric_test'));
    const { Employee, VerificationSession, DeliveryLease } = await import('../../../biometric/backend/src/models.js');
    await Promise.all([Employee.init(), VerificationSession.init(), DeliveryLease.init()]);
    const { createApp } = await import('../../../biometric/backend/src/app.js');
    const { deliverWorker } = await import('../../../biometric/backend/src/starlit.js');
    bioServer = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => bioServer.once('listening', resolve));
    const bioBase = `http://127.0.0.1:${bioServer.address().port}`;
    const bio = async (route, body, adminAuth = false) => {
      const response = await fetch(bioBase + '/api' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(adminAuth ? { 'x-admin-key': process.env.ADMIN_ENROLL_KEY } : {}) }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const employee = await Worker.create({ employeeId: 'EMP002', name: 'Canonical Starlit Name' });
    const device = authenticator();
    await t.test('enrollment lookup requires admin and returns the signed canonical Starlit employee', async () => {
      const url = bioBase + '/api/employees/emp002/lookup';
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: { 'x-admin-key': process.env.ADMIN_ENROLL_KEY } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, employeeId: 'EMP002', name: employee.name });
      assert.equal((await Worker.findById(employee._id)).employeeId, 'EMP002');
    });
    await t.test('linked enrollment and real WebAuthn registration use canonical identity and credential ID', async () => {
      const enrolled = await bio('/enroll', { employeeId: ' emp002 ', name: 'Forged', faceDescriptor: Array(128).fill(0) }, true);
      assert.equal(enrolled.status, 200); assert.equal(enrolled.body.name, employee.name);
      const options = (await bio('/passkey/register/options', { employeeId: 'EMP002' }, true)).body;
      const registered = await bio('/passkey/register/verify', { employeeId: 'EMP002', sessionId: options.sessionId, response: device.register(options) }, true);
      assert.equal(registered.status, 200, JSON.stringify(registered.body));
      assert.equal((await Employee.findOne({ employeeId: 'EMP002' })).credentials[0].credentialID, device.id);
      assert.equal((await bio('/passkey/register/verify', { employeeId: 'EMP002', sessionId: options.sessionId }, true)).status, 401);
      assert.equal((await bio('/enroll', { employeeId: 'EMP002', name: 'Forged again', faceDescriptor: Array(128).fill(0) }, true)).status, 200);
      const stored = await Employee.findOne({ employeeId: 'EMP002' });
      assert.equal(stored.credentials[0].credentialID, device.id);
      assert.equal(stored.starlitWorkerId, String(employee._id));
      assert.equal(stored.name, employee.name);
    });
    async function authorize(action, tweaks = {}) {
      const options = (await bio('/passkey/auth/options', { employeeId: 'EMP002', action })).body;
      const response = device.authenticate(options, tweaks.origin, tweaks.flags);
      const verified = await bio('/passkey/auth/verify', { employeeId: 'EMP002', action, sessionId: options.sessionId, response });
      return { options, verified };
    }
    await t.test('real assertions enforce origin, UV, session binding, expiry and single use', async () => {
      assert.equal((await authorize('CHECK_IN', { origin: 'https://evil.test' })).verified.status, 400);
      assert.equal((await authorize('CHECK_IN', { flags: 0x01 })).verified.status, 400);
      const { options, verified } = await authorize('CHECK_IN'); assert.equal(verified.status, 200);
      assert.equal((await bio('/face/verify', { employeeId: 'EMP002', action: 'CHECK_OUT', sessionId: options.sessionId, faceDescriptor: Array(128).fill(0) })).status, 401);
      await VerificationSession.updateOne({ _id: options.sessionId }, { $set: { expiresAt: new Date(0) } });
      assert.equal((await bio('/face/verify', { employeeId: 'EMP002', action: 'CHECK_IN', sessionId: options.sessionId, faceDescriptor: Array(128).fill(0) })).status, 401);
      const mismatch = await authorize('CHECK_IN');
      assert.equal((await bio('/face/verify', { employeeId: 'EMP002', action: 'CHECK_IN', sessionId: mismatch.options.sessionId, faceDescriptor: Array(128).fill(1) })).status, 401);
      assert.equal(await VerificationSession.countDocuments({ delivery: 'pending' }), 0);
    });
    await t.test('end-to-end verification queues during outage; ordered retry survives sender restart and receiver response loss', async () => {
      process.env.STARLIT_API_URL = 'http://127.0.0.1:1';
      const checkIn = await authorize('CHECK_IN');
      const input = { employeeId: 'EMP002', action: 'CHECK_IN', sessionId: checkIn.options.sessionId, faceDescriptor: Array(128).fill(0) };
      const pending = await bio('/face/verify', input);
      assert.equal(pending.status, 200, JSON.stringify(pending.body)); assert.equal(pending.body.attendance.state, 'pending');
      assert.equal((await bio('/face/verify', input)).status, 401);
      const checkOut = await authorize('CHECK_OUT');
      await bio('/face/verify', { ...input, action: 'CHECK_OUT', sessionId: checkOut.options.sessionId });
      assert.equal(await VerificationSession.countDocuments({ delivery: 'pending' }), 2);
      // Reconnect to demonstrate queue persistence; no in-memory session/challenge state is needed.
      await bioMongoose.disconnect(); await bioMongoose.connect(repl.getUri('biometric_test'));
      process.env.STARLIT_API_URL = base;
      await VerificationSession.updateMany({ delivery: 'pending' }, { $set: { nextAttemptAt: new Date(0) } });
      await deliverWorker(String(employee._id));
      const first = await VerificationSession.findById(checkIn.options.sessionId);
      assert.equal(first.delivery, 'delivered');
      // Simulate the acknowledged write with its response lost to the sender.
      await VerificationSession.updateOne({ _id: first._id }, { $set: { delivery: 'pending', nextAttemptAt: new Date(0) } });
      await deliverWorker(String(employee._id));
      assert.equal((await VerificationSession.findById(first._id)).deliveryResult.duplicate, true);
      await deliverWorker(String(employee._id));
      const sessions = await AttendanceSession.find({ workerId: employee._id }).lean();
      assert.equal(sessions.length, 1); assert.equal(sessions[0].status, 'Checked Out'); assert.ok(sessions[0].durationMs > 0);
      assert.equal(await VerificationSession.countDocuments({ delivery: 'pending' }), 0);
      const receipt = await fetch(bioBase + '/api/attendance/receipt/' + first._id);
      assert.equal((await receipt.json()).attendance.state, 'delivered');
    });
    await t.test('production RP verifies real passkeys from apex and www, rejects foreign origins, then records both attendance actions', async () => {
      const saved = { ...process.env };
      Object.assign(process.env, { NODE_ENV: 'production', ORIGIN: 'https://technovahub.in,https://www.technovahub.in', RP_ID: 'technovahub.in',
        MONGODB_URI: repl.getUri('biometric_test'), STARLIT_API_URL: 'https://production-automation-5ss0.onrender.com' });
      const productionServer = createApp().listen(0, '127.0.0.1');
      await new Promise(resolve => productionServer.once('listening', resolve));
      // Startup validates the production target; all test service requests stay on the isolated receiver.
      process.env.STARLIT_API_URL = base;
      try {
        const productionBase = `http://127.0.0.1:${productionServer.address().port}`;
        const request = async (route, body, origin = 'https://technovahub.in', admin = false) => {
          const response = await fetch(productionBase + '/api' + route, { method: 'POST', headers: {
            'Content-Type': 'application/json', Origin: origin, ...(admin ? { 'x-admin-key': process.env.ADMIN_ENROLL_KEY } : {}) }, body: JSON.stringify(body) });
          return { status: response.status, body: await response.json() };
        };
        const worker = await Worker.create({ employeeId: 'EMP003', name: 'Production origin test' });
        const device = authenticator('technovahub.in');
        assert.equal((await request('/enroll', { employeeId: 'EMP003', faceDescriptor: Array(128).fill(0) }, undefined, true)).status, 200);
        let options = (await request('/passkey/register/options', { employeeId: 'EMP003' }, undefined, true)).body;
        assert.equal(options.rp.id, 'technovahub.in');
        assert.equal((await request('/passkey/register/verify', { employeeId: 'EMP003', sessionId: options.sessionId,
          response: device.register(options, 'https://www.technovahub.in') }, 'https://www.technovahub.in', true)).status, 200);
        options = (await request('/passkey/auth/options', { employeeId: 'EMP003' })).body;
        // An allowed HTTP Origin cannot hide a foreign origin signed by the authenticator.
        assert.equal((await request('/passkey/auth/verify', { employeeId: 'EMP003', sessionId: options.sessionId,
          response: device.authenticate(options, 'https://evil.test') })).status, 400);
        for (const [action, origin] of [['CHECK_IN', 'https://technovahub.in'], ['CHECK_OUT', 'https://www.technovahub.in']]) {
          options = (await request('/passkey/auth/options', { employeeId: 'EMP003', action }, origin)).body;
          assert.equal((await request('/passkey/auth/verify', { employeeId: 'EMP003', action, sessionId: options.sessionId,
            response: device.authenticate(options, origin) }, origin)).status, 200);
          const result = await request('/face/verify', { employeeId: 'EMP003', action, sessionId: options.sessionId, faceDescriptor: Array(128).fill(0) }, origin);
          assert.equal(result.status, 200); assert.equal(result.body.attendance.state, 'delivered');
        }
        const rows = await AttendanceSession.find({ workerId: worker._id }).lean();
        assert.equal(rows.length, 1); assert.equal(rows[0].status, 'Checked Out'); assert.ok(rows[0].durationMs > 0);
      } finally {
        await new Promise(resolve => productionServer.close(resolve));
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    });
  } finally {
    if (bioServer) await new Promise(resolve => bioServer.close(resolve));
    if (starlitServer) await new Promise(resolve => starlitServer.close(resolve));
    if (bioMongoose) await bioMongoose.disconnect();
    await mongoose.disconnect(); await repl.stop();
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
