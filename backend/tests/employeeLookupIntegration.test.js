const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { originalEmployees } = require('../scripts/auditEmployees');
const { readDependencies } = require('../scripts/employeeDependencies');
const { planRestoration } = require('../scripts/restoreOriginalEmployees');
const { verifyLookups } = require('../scripts/verifyEmployeeLookups');
const Worker = require('../models/Worker');
const User = require('../models/User');
const WorkEntry = require('../models/WorkEntry');
const AttendanceSession = require('../models/AttendanceSession');

test('MongoDB employee master: creation, all ten signed/proxied lookups, dependencies and preservation', { timeout: 120000 }, async t => {
  const env = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-employee-test',
    BIOMETRIC_SERVICE_SECRET: crypto.randomBytes(32).toString('hex'), BIOMETRIC_INTEGRATION_ENABLED: 'true',
    STARLIT_INTEGRATION_ENABLED: 'true', ADMIN_ENROLL_KEY: crypto.randomBytes(32).toString('hex'),
    DEMO_MODE: 'false', ORIGIN: 'http://localhost:5174', RP_ID: 'localhost' });
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  });
  const repl = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: path.resolve(__dirname, '../../.test-mongodb') }, replSet: { count: 1 } });
  t.after(() => repl.stop());
  await mongoose.connect(repl.getUri('employee_master_test'));
  t.after(() => mongoose.disconnect());
  await Promise.all([Worker, User, WorkEntry, AttendanceSession].map(model => model.init()));
  const superadmin = await User.create({ name: 'Test owner', username: 'employee-test-owner', role: 'superadmin', password: 'isolated-password' });
  const token = jwt.sign({ id: superadmin._id }, process.env.JWT_SECRET);
  const { createApp } = require('../app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.STARLIT_API_URL = baseUrl;
  const call = async (method, route, body) => {
    const response = await fetch(baseUrl + route, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const originals = originalEmployees();
  const all = [...originals, ...[8, 9, 10].map(n => ({ employeeId: `EMP${String(n).padStart(3, '0')}`, name: `New employee ${n}` }))];
  await t.test('authenticated creation persists canonical identities and prevents concurrent duplicates', async () => {
    for (const employee of all) {
      const result = await call('POST', '/api/workers', { employeeId: ` ${employee.employeeId.toLowerCase()} `, name: employee.name });
      assert.equal(result.status, 201);
      assert.equal(result.body.data.employeeId, employee.employeeId);
      assert.equal((await Worker.findOne({ employeeId: employee.employeeId })).name, employee.name);
    }
    assert.equal((await call('POST', '/api/workers', { employeeId: ' emp001 ', name: 'Wrong identity' })).status, 400);
    const duplicates = await Promise.all([1, 2].map(() => call('POST', '/api/workers', { employeeId: 'RACE', name: 'Race fixture' })));
    assert.equal(duplicates.filter(row => row.status === 201).length, 1);
    assert.equal(duplicates.filter(row => [400, 409].includes(row.status)).length, 1);
    assert.equal(await Worker.countDocuments({ employeeId: 'RACE' }), 1);
  });
  const first = await Worker.findOne({ employeeId: 'EMP001' });
  await WorkEntry.create({ employeeId: first.employeeId, employeeName: first.name, department: 'CNC', date: '2024-01-01', hours: 1 });
  await AttendanceSession.create({ workerId: first._id, employeeId: first.employeeId, employeeName: first.name,
    attendanceDate: '2024-01-01', checkIn: new Date('2024-01-01T03:30:00Z'), checkOut: new Date('2024-01-01T04:30:00Z'),
    durationMs: 3600000, status: 'Checked Out', checkInEventId: crypto.randomUUID() });
  const historyBefore = JSON.stringify({ work: await WorkEntry.find().lean(), attendance: await AttendanceSession.find().lean() });
  const workersBefore = JSON.stringify(await Worker.find().sort({ employeeId: 1 }).lean());
  const bioMongoose = (await import('../../../biometric/backend/node_modules/mongoose/index.js')).default;
  await bioMongoose.connect(repl.getUri('employee_biometric_test'));
  t.after(() => bioMongoose.disconnect());
  const { Employee } = await import('../../../biometric/backend/src/models.js');
  await Employee.init();
  await Employee.create({ employeeId: 'EMP001', name: first.name, starlitWorkerId: String(first._id), faceDescriptor: Array(128).fill(0),
    credentials: [{ credentialID: 'preserved-passkey', publicKey: Buffer.from('existing-key'), counter: 5 }] });
  const enrollmentBefore = JSON.stringify(await Employee.find().lean());
  const { createApp: createBiometricApp } = await import('../../../biometric/backend/src/app.js');
  const bioServer = createBiometricApp().listen(0, '127.0.0.1');
  await new Promise(resolve => bioServer.once('listening', resolve));
  t.after(() => new Promise(resolve => bioServer.close(resolve)));
  const bioUrl = `http://127.0.0.1:${bioServer.address().port}`;
  await t.test('all EMP001–EMP010 resolve through signed Starlit and the SecureVerify proxy', async () => {
    const direct = await verifyLookups({ baseUrl, secret: process.env.BIOMETRIC_SERVICE_SECRET });
    const proxied = await verifyLookups({ baseUrl: bioUrl, secureverify: true, adminKey: process.env.ADMIN_ENROLL_KEY });
    assert.equal(direct.length, 10);
    assert.ok(direct.every(row => row.ok));
    assert.ok(proxied.every(row => row.ok));
    assert.deepEqual(proxied.map(row => row.name), all.map(row => row.name));
    assert.deepEqual(direct.map(row => row.name), all.map(row => row.name));
    assert.equal((await fetch(bioUrl + '/api/employees/EMP001/lookup')).status, 401);
    assert.equal((await fetch(baseUrl + '/api/attendance/employees/EMP001')).status, 401);
  });
  await t.test('read-only dependency audit and lookup leave workers, enrollments, passkeys and history unchanged', async () => {
    const workers = await Worker.find().lean();
    const dependencies = await readDependencies(mongoose.connection.db);
    assert.equal(dependencies.attendance[0]._id, 'EMP001');
    const plan = planRestoration(originals, workers, [{ _id: 'EMP001', names: ['Abinesh'], entries: 1 }], { dependencies });
    assert.deepEqual(plan.missing, []);
    assert.deepEqual(plan.conflicts, []);
    assert.equal(JSON.stringify(await Worker.find().sort({ employeeId: 1 }).lean()), workersBefore);
    assert.equal(JSON.stringify({ work: await WorkEntry.find().lean(), attendance: await AttendanceSession.find().lean() }), historyBefore);
    assert.equal(JSON.stringify(await Employee.find().lean()), enrollmentBefore);
  });
  await t.test('restoration CLI dry run, backup, insert-only transaction and idempotency use only a temporary database', async () => {
    const fs = require('node:fs');
    const { promisify } = require('node:util');
    const execFile = promisify(require('node:child_process').execFile);
    const scripts = path.resolve(__dirname, '../scripts');
    const uri = repl.getUri('employee_restoration_cli_test');
    const db = mongoose.connection.getClient().db('employee_restoration_cli_test');
    const later = all.slice(7).map(row => ({ ...row, _id: new mongoose.Types.ObjectId(), status: 'Active', designation: 'Preserved role' }));
    await db.collection('workers').insertMany(later);
    await db.collection('workers').createIndex({ employeeId: 1 }, { unique: true });
    await db.collection('workentries').insertOne({ employeeId: 'EMP001', employeeName: 'Abinesh', hours: 8 });
    await db.collection('attendancesessions').insertOne({ employeeId: 'EMP008', employeeName: later[0].name, workerId: later[0]._id });
    await db.collection('attendanceevents').insertOne({ workerId: later[0]._id, sequence: 1 });
    await db.collection('attendancecursors').insertOne({ _id: later[0]._id, sequence: 1 });
    const collections = ['workentries', 'attendancesessions', 'attendanceevents', 'attendancecursors'];
    const histories = {};
    for (const collection of collections) histories[collection] = JSON.stringify(await db.collection(collection).find().toArray());
    const invoke = flag => execFile(process.execPath, [path.join(scripts, 'restoreOriginalEmployees.js'), flag], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, MONGO_URI: uri }, timeout: 30000,
    });
    const dry = await invoke('--dry-run');
    assert.match(dry.stdout, /DRY RUN ONLY/);
    assert.equal(await db.collection('workers').countDocuments(), 3);
    const beforeBackups = new Set(fs.readdirSync(scripts));
    try {
      await invoke('--apply');
      const backups = fs.readdirSync(scripts).filter(name => !beforeBackups.has(name) && /^employee-restoration-backup-\d+\.json$/.test(name));
      assert.ok(backups.length > 0);
      const backup = JSON.parse(fs.readFileSync(path.join(scripts, backups[0]), 'utf8'));
      assert.equal(backup.workers.length, 3);
      assert.equal(backup.database, 'employee_restoration_cli_test');
      assert.deepEqual(Object.keys(backup.attendanceFingerprints).sort(), collections.slice(1).sort());
      const restored = await db.collection('workers').find().sort({ employeeId: 1 }).toArray();
      assert.equal(restored.length, 10);
      for (const row of later) assert.deepEqual(restored.find(w => w.employeeId === row.employeeId), row);
      for (const row of originals) assert.equal(restored.find(w => w.employeeId === row.employeeId).name, row.name);
      await invoke('--apply');
      assert.equal(JSON.stringify(await db.collection('workers').find().sort({ employeeId: 1 }).toArray()), JSON.stringify(restored));
      for (const collection of collections) assert.equal(JSON.stringify(await db.collection(collection).find().toArray()), histories[collection]);
      assert.equal(JSON.stringify(await Employee.find().lean()), enrollmentBefore);
    } finally {
      // Delete only the fake-data backup files created by this isolated test.
      for (const name of fs.readdirSync(scripts)) {
        if (!beforeBackups.has(name) && /^employee-restoration-backup-\d+\.json$/.test(name)) fs.unlinkSync(path.join(scripts, name));
      }
    }
  });
  await t.test('missing and inactive workers cannot be looked up or enrolled, and IDs normalize correctly', async () => {
    const employee = await Worker.create({ employeeId: 'INACTIVE', name: 'Inactive employee', status: 'Inactive' });
    const { lookupEmployee } = await import('../../../biometric/backend/src/starlit.js');
    await assert.rejects(lookupEmployee(employee.employeeId), /not found/);
    await assert.rejects(lookupEmployee('UNKNOWN'), /not found/);
    assert.equal((await lookupEmployee(' emp001 ')).name, 'Abinesh');
    for (const employeeId of ['INACTIVE', 'UNKNOWN']) {
      const response = await fetch(bioUrl + '/api/enroll', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_ENROLL_KEY },
        body: JSON.stringify({ employeeId, faceDescriptor: Array(128).fill(0) }) });
      assert.notEqual(response.status, 200);
      assert.equal(await Employee.countDocuments({ employeeId }), 0);
    }
  });
});
