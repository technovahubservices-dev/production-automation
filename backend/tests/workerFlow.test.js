const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Worker = require('../models/Worker');
const WorkEntry = require('../models/WorkEntry');
const Settings = require('../models/SystemSettings');
test('authenticated worker management and Admin work entry flow', async () => {
  process.env.JWT_SECRET = 'worker-flow-test-only';
  const originals = [User.findById, Worker.findOne, Worker.find, Worker.create, Worker.findByIdAndUpdate, WorkEntry.create, Settings.findOne];
  const existing = [
    { _id: 'existing1', employeeId: 'EMP001', name: 'Existing Worker', phone: '123', designation: 'Worker', status: 'Active' },
    { _id: 'existing2', employeeId: 'EMP002', name: 'Existing Inactive', status: 'Inactive' },
  ];
  const historicalEntry = { _id: 'historical', employeeId: 'EMP001', employeeName: 'Original historical name', date: '2000-01-01', hours: 8 };
  const records = structuredClone(existing); const entries = [structuredClone(historicalEntry)];
  const beforeExisting = JSON.stringify(records);
  const beforeHistory = JSON.stringify(entries[0]);
  User.findById = id => ({ select: async () => ({ _id: id, role: id, active: true }) });
  Worker.findOne = async query => records.find(w => w.employeeId === query.employeeId && (!query.status || w.status === query.status));
  Worker.find = query => ({ sort: async () => records.filter(w => !query.status || w.status === query.status) });
  Worker.create = async body => { const value = { ...body, _id: 'worker1', employeeId: body.employeeId.trim().toUpperCase(), name: body.name.trim(), status: body.status || 'Active' }; records.push(value); return value; };
  Worker.findByIdAndUpdate = async (id, body) => { const w = records.find(w => w._id === id); if (w) Object.assign(w, body); return w; };
  WorkEntry.create = async body => { entries.push(body); return { ...body, _id: 'entry1' }; };
  Settings.findOne = async () => ({ departments: [{ name: 'CNC', active: true }, { name: 'WELDING', active: true }], shifts: [{ name: 'Day' }] });
  const app = express(); app.use(express.json());
  app.use('/api/workers', require('../routes/workerRoutes'));
  app.use('/api/work-entries', require('../routes/workEntryRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(role, method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (role) headers.Authorization = 'Bearer ' + jwt.sign({ id: role }, process.env.JWT_SECRET);
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  }
  try {
    assert.equal((await call(null, 'GET', '/api/workers')).status, 401);
    assert.equal((await call('superadmin', 'POST', '/api/workers', { employeeId: ' emp900 ', name: 'Test Employee' })).status, 201);
    const list = await call('admin', 'GET', '/api/workers');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map(w => w.employeeId), ['EMP001', 'EMP900']);
    assert.equal(records.length, existing.length + 1);
    assert.equal(JSON.stringify(records.slice(0, existing.length)), beforeExisting);
    const duplicate = await call('superadmin', 'POST', '/api/workers', { employeeId: ' emp001 ', name: 'Replacement attempt' });
    assert.equal(duplicate.status, 400);
    assert.equal(records.length, existing.length + 1);
    assert.equal(JSON.stringify(entries[0]), beforeHistory);
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await call('admin', method, '/api/workers' + (method === 'POST' ? '' : '/worker1'), { name: 'Tampered' })).status, 403);
    assert.equal(records.find(w => w.employeeId === 'EMP900').name, 'Test Employee');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const department of ['CNC', 'WELDING', 'PURLIN']) {
      const res = await call('admin', 'POST', '/api/work-entries', { employeeId: 'EMP900', employeeName: 'Forged Name', date: today, department, shift: 'Day', inTime: '09:00', outTime: '10:00' });
      assert.equal(res.status, 201); assert.equal(res.body.data.employeeName, 'Test Employee'); assert.equal(res.body.data.employeeId, 'EMP900'); assert.equal(res.body.data.hours, 1);
    }
    assert.equal((await call('admin', 'POST', '/api/work-entries', { employeeId: 'MISSING', date: today, department: 'CNC' })).status, 400);
    const historical = JSON.stringify(entries);
    assert.equal((await call('superadmin', 'PATCH', '/api/workers/worker1', { name: 'Updated' })).status, 200);
    assert.equal((await call('superadmin', 'DELETE', '/api/workers/worker1')).status, 200);
    assert.equal((await call('admin', 'GET', '/api/workers?includeInactive=true')).body.data.length, 1);
    assert.equal((await call('superadmin', 'GET', '/api/workers?includeInactive=true')).body.data.length, 3);
    assert.equal(JSON.stringify(entries), historical);
    assert.equal(records.length, 3);
    assert.equal(JSON.stringify(records.slice(0, existing.length)), beforeExisting);
    assert.equal(JSON.stringify(entries[0]), beforeHistory);
    assert.equal((await call('admin', 'POST', '/api/work-entries', { employeeId: 'EMP900', date: today, department: 'CNC' })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    [User.findById, Worker.findOne, Worker.find, Worker.create, Worker.findByIdAndUpdate, WorkEntry.create, Settings.findOne] = originals;
  }
});
