const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Worker = require('../models/Worker');
const User = require('../models/User');
const WorkEntry = require('../models/WorkEntry');
const Settings = require('../models/SystemSettings');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceCursor = require('../models/AttendanceCursor');
const { indiaDate, ingest } = require('../services/attendanceService');
const { getCheckedInWorkers } = require('../services/attendanceEligibility');
const { canonical } = require('../middleware/biometricServiceAuth');

test('checked-in workers and work submission use verified MongoDB attendance only', { timeout: 120000 }, async t => {
  // No .env, external database, employee restoration or enrollment operations.
  const env = { ...process.env };
  Object.assign(process.env, { JWT_SECRET: 'checked-in-workers-isolated-test',
    BIOMETRIC_INTEGRATION_ENABLED: 'true', BIOMETRIC_SERVICE_SECRET: crypto.randomBytes(32).toString('hex') });
  const repl = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: path.resolve(__dirname, '../../.test-mongodb') }, replSet: { count: 1 } });
  let server;
  try {
    await mongoose.connect(repl.getUri('checked_in_workers_test'));
    await Promise.all([Worker, User, WorkEntry, Settings, AttendanceSession, AttendanceEvent, AttendanceCursor].map(m => m.init()));
    const workers = await Worker.create(Array.from({ length: 10 }, (_, i) => ({ employeeId: `EMP${String(i + 1).padStart(3, '0')}`, name: `MongoDB employee ${i + 1}` })));
    const workersBefore = JSON.stringify(await Worker.find().sort({ employeeId: 1 }).lean());
    const users = await User.create(['admin', 'superadmin'].map(role => ({ name: role, username: role, role, password: 'isolated-password' })));
    await Settings.create({});
    const historic = await WorkEntry.create({ employeeId: 'EMP001', employeeName: 'Preserved historic name', department: 'CNC', date: '2024-01-01', hours: 8 });
    const fingerprint = JSON.stringify(await WorkEntry.findById(historic._id).lean());
    server = require('../app').createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (route, body, user = users[0]) => {
      const res = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: {
        'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}` } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
    };
    const list = () => call('/api/attendance/checked-in-workers');
    const sequences = new Map();
    const scan = async (worker, action, verifiedAt = new Date().toISOString()) => {
      const sequence = (sequences.get(worker.employeeId) || 0) + 1;
      sequences.set(worker.employeeId, sequence);
      const event = { eventId: crypto.randomUUID(), workerId: String(worker._id), employeeId: worker.employeeId,
        sequence, action, verifiedAt, demoMode: false, checks: { passkey: true, face: true } };
      const route = '/api/attendance/biometric', raw = JSON.stringify(event), timestamp = String(Date.now());
      const signature = crypto.createHmac('sha256', process.env.BIOMETRIC_SERVICE_SECRET).update(canonical('POST', route, timestamp, raw)).digest('hex');
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-service-timestamp': timestamp, 'x-service-signature': signature }, body: raw });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.data.accepted, true, JSON.stringify(result));
      return result.data.session;
    };
    const submit = (employeeId, user) => call('/api/work-entries', { employeeId, employeeName: 'Forged name',
      date: indiaDate(), department: 'CNC', shift: 'Day', inTime: '09:00', outTime: '10:00' }, user);

    await t.test('authenticated endpoint starts empty; unchecked employees rejected for both roles', async () => {
      assert.equal((await call('/api/attendance/checked-in-workers', null, null)).status, 401);
      const result = await list();
      assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
      assert.deepEqual(result.body.data, []); assert.equal(result.body.timezone, 'Asia/Kolkata');
      for (const user of users) assert.equal((await submit('EMP001', user)).status, 409);
      assert.equal(await WorkEntry.countDocuments(), 1);
    });
    await t.test('one and multiple verified sessions join canonical worker names; checkout removes worker', async () => {
      await scan(workers[8], 'CHECK_IN');
      assert.deepEqual((await list()).body.data.map(w => w.employeeId), ['EMP009']);
      const created = await submit(' emp009 ');
      assert.equal(created.status, 201); assert.equal(created.body.data.employeeName, workers[8].name);
      const saved = JSON.stringify(await WorkEntry.findById(created.body.data._id).lean());
      await scan(workers[9], 'CHECK_IN');
      assert.deepEqual((await list()).body.data.map(w => w.employeeId), ['EMP009', 'EMP010']);
      await scan(workers[8], 'CHECK_OUT');
      assert.deepEqual((await list()).body.data.map(w => w.employeeId), ['EMP010']);
      for (const user of users) {
        const rejected = await submit('EMP009', user);
        assert.equal(rejected.status, 409); assert.equal(rejected.body.code, 'EMPLOYEE_NOT_CHECKED_IN');
      }
      assert.equal(JSON.stringify(await WorkEntry.findById(created.body.data._id).lean()), saved);
      await scan(workers[8], 'CHECK_IN');
      assert.deepEqual((await list()).body.data.map(w => w.employeeId), ['EMP009', 'EMP010']);
    });
    await t.test('previous-day open session is excluded; date switches at IST midnight', async () => {
      await scan(workers[0], 'CHECK_IN', new Date(Date.now() - 86400000).toISOString());
      assert.ok(!(await list()).body.data.some(w => w.employeeId === 'EMP001'));
      assert.equal((await submit('EMP001')).status, 409);
      const boundary = new Date('2025-01-01T18:29:59.000Z');
      await ingest({ eventId: crypto.randomUUID(), workerId: String(workers[1]._id), employeeId: 'EMP002', sequence: 1,
        action: 'CHECK_IN', verifiedAt: boundary.toISOString(), demoMode: false, checks: { passkey: true, face: true } });
      assert.ok((await getCheckedInWorkers({ now: boundary })).some(w => w.employeeId === 'EMP002'));
      assert.ok(!(await getCheckedInWorkers({ now: new Date('2025-01-01T18:30:00.000Z') })).some(w => w.employeeId === 'EMP002'));
    });
    await t.test('unverified and future sessions, inactive and mismapped workers never qualify', async () => {
      const now = new Date();
      const fake = await AttendanceSession.create({ workerId: workers[2]._id, employeeId: 'EMP003', employeeName: 'Fake',
        attendanceDate: indiaDate(now), checkIn: now, status: 'Checked In', checkInEventId: crypto.randomUUID() });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP003' }), []);
      await AttendanceEvent.create({ eventId: fake.checkInEventId, workerId: workers[2]._id, sequence: 1, payloadHash: 'test',
        result: { accepted: false, code: 'CHECKED_IN', session: fake.toObject() } });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP003' }), []);
      await AttendanceSession.create({ workerId: workers[3]._id, employeeId: 'EMP004', employeeName: 'Future',
        attendanceDate: indiaDate(now), checkIn: new Date(now.getTime() + 3600000), status: 'Checked In', checkInEventId: crypto.randomUUID() });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP004', now }), []);
      await scan(workers[4], 'CHECK_IN');
      await Worker.updateOne({ _id: workers[4]._id }, { $set: { status: 'Inactive' } });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP005' }), []);
      await Worker.updateOne({ _id: workers[4]._id }, { $set: { status: 'Active', employeeId: 'CHANGED' } });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP005' }), []);
      await Worker.updateOne({ _id: workers[4]._id }, { $set: { employeeId: 'EMP005' } });
    });
    await t.test('newer closed session takes precedence over an older open record', async () => {
      const checkIn = new Date(Date.now() - 3000);
      await scan(workers[5], 'CHECK_IN', checkIn.toISOString());
      await AttendanceSession.create({ workerId: workers[5]._id, employeeId: 'EMP006', employeeName: workers[5].name,
        attendanceDate: indiaDate(), checkIn: new Date(checkIn.getTime() + 1000), checkOut: new Date(),
        status: 'Checked Out', checkInEventId: crypto.randomUUID(), checkOutEventId: crypto.randomUUID() });
      assert.deepEqual(await getCheckedInWorkers({ employeeId: 'EMP006' }), []);
    });
    await t.test('database failure fails closed for listing and submission; history and workers preserved', async () => {
      const aggregate = AttendanceSession.aggregate;
      const count = await WorkEntry.countDocuments();
      AttendanceSession.aggregate = async () => { throw new Error('Simulated attendance outage'); };
      try {
        const failed = await list(); assert.equal(failed.status, 503); assert.equal(failed.body.data, undefined);
        const rejected = await submit('EMP010'); assert.equal(rejected.status, 503);
        assert.match(rejected.body.message, /verify employee attendance/);
      } finally { AttendanceSession.aggregate = aggregate; }
      assert.equal(await WorkEntry.countDocuments(), count);
      assert.equal(JSON.stringify(await WorkEntry.findById(historic._id).lean()), fingerprint);
      // Explicit fixture mutations above were restored, except timestamps.
      const before = JSON.parse(workersBefore), after = JSON.parse(JSON.stringify(await Worker.find().sort({ employeeId: 1 }).lean()));
      for (const rows of [before, after]) for (const row of rows) delete row.updatedAt;
      assert.deepEqual(after, before);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await repl.stop();
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
