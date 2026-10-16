const { test } = require('node:test');
const assert = require('node:assert/strict');
const WorkEntry = require('../models/WorkEntry');
const Worker = require('../models/Worker');
const Settings = require('../models/SystemSettings');
const controller = require('../controllers/workEntryController');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('Admin date access and unchanged Super Admin query permissions', async () => {
  const originalWorkerFind = Worker.findOne;
  Worker.findOne = async () => ({ employeeId: "E1", name: "Test" });
  const originalFind = WorkEntry.find;
  const originalCreate = WorkEntry.create;
  const originalSettings = Settings.findOne;
  let filter, created;
  WorkEntry.find = value => { filter = value; return { sort: async () => [] }; };
  WorkEntry.create = async value => { created = value; return value; };
  Settings.findOne = async () => ({ departments: [{ name: 'CNC', active: true }], shifts: [{ name: 'Day' }] });
  try {
    for (const query of [{ date: '2000-01-01' }, { date: '2999-01-01' }, { fromDate: '2000-01-01', toDate: today() }, { date: { $ne: today() } }]) {
      filter = null;
      const res = response();
      await controller.getWorkEntries({ user: { role: 'admin' }, query }, res);
      assert.equal(res.code, 403); assert.equal(filter, null);
    }
    for (const query of [{}, { date: today() }, { fromDate: today(), toDate: today(), department: 'CNC', employeeId: 'E1' }]) {
      const res = response();
      await controller.getWorkEntries({ user: { role: 'admin' }, query }, res);
      assert.equal(res.code, 200); assert.equal(filter.date, today());
    }
    for (const query of [{}, { date: '2000-01-01' }, { fromDate: '2000-01-01', toDate: '2000-02-01' }]) {
      const res = response();
      await controller.getWorkEntries({ user: { role: 'superadmin' }, query }, res);
      assert.equal(res.code, 200);
      assert.deepEqual(filter.date, query.date || (query.fromDate ? { $gte: query.fromDate, $lte: query.toDate } : undefined));
    }
    const body = { employeeId: 'E1', employeeName: 'Test', department: 'CNC', shift: 'Day', inTime: '09:00', outTime: '17:00' };
    for (const role of ['admin', 'superadmin']) for (const date of ['2000-01-01', '2999-01-01', today()]) {
      created = null; const res = response();
      await controller.createWorkEntry({ user: { role }, body: { ...body, date } }, res);
      const allowed = role === 'superadmin' || date === today();
      assert.equal(res.code, allowed ? 201 : 403);
      assert.equal(created?.date, allowed ? date : undefined);
      if (allowed) assert.equal(created.hours, 8);
    }
  } finally { Worker.findOne = originalWorkerFind; WorkEntry.find = originalFind; WorkEntry.create = originalCreate; Settings.findOne = originalSettings; }
});
