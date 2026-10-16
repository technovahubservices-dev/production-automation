const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const { originalEmployees } = require('./auditEmployees');

function planRestoration(original, workers, historical, { resolveEmp001Test = false } = {}) {
  const conflicts = [], missing = [], unchanged = [], corrections = [];
  const counts = new Map();
  for (const worker of workers) counts.set(worker.employeeId, (counts.get(worker.employeeId) || 0) + 1);
  for (const [employeeId, count] of counts) if (count > 1) conflicts.push({ employeeId, reason: 'Duplicate employee IDs already exist; stop for manual review.' });
  for (const employee of original) {
    const worker = workers.find(w => w.employeeId === employee.employeeId);
    const dependency = historical.find(h => h._id === employee.employeeId);
    if (resolveEmp001Test && employee.employeeId === 'EMP001' && employee.name === 'Abinesh' && worker?.name === 'Test') {
      // User explicitly confirmed this one test identity. History must corroborate it.
      if (worker._id && dependency?.entries > 0 && dependency.names.length > 0 && dependency.names.every(name => name === 'Abinesh')) {
        corrections.push({ _id: worker._id, employeeId: 'EMP001', fromName: 'Test', name: 'Abinesh', status: 'Active', workEntryCount: dependency.entries });
      } else conflicts.push({ employeeId: 'EMP001', reason: 'Confirmed correction requires an existing Worker _id and historical entries exclusively identifying EMP001 as Abinesh. Stop without changing data.' });
    } else if (worker && worker.name !== employee.name) {
      conflicts.push({ employeeId: employee.employeeId, expectedName: employee.name, currentName: worker.name, createdAt: worker.createdAt, workEntryCount: dependency?.entries || 0, historicalNames: dependency?.names || [], reason: 'Identity conflict. A recent timestamp or the name Test alone does not prove test origin. Preserve Worker; confirm provenance before correction.' });
    } else if (worker && worker.status !== 'Active') {
      conflicts.push({ employeeId: employee.employeeId, reason: 'Existing matching employee is not Active. Preserve status; review before restoration.' });
    } else if (dependency?.names.some(name => name !== employee.name)) {
      conflicts.push({ employeeId: employee.employeeId, expectedName: employee.name, historicalNames: dependency.names, reason: 'Historical identity conflict; preserve history and stop.' });
    } else if (worker) unchanged.push(employee.employeeId);
    else missing.push(employee);
  }
  return { missing, unchanged, corrections, conflicts };
}

function correctionOperation(correction) {
  if (correction.employeeId !== 'EMP001' || correction.fromName !== 'Test' || correction.name !== 'Abinesh' || correction.status !== 'Active' || !correction._id) throw new Error('Unapproved Worker correction.');
  return {
    filter: { _id: correction._id, employeeId: 'EMP001', name: 'Test' },
    update: { $set: { employeeId: 'EMP001', name: 'Abinesh', status: 'Active' } },
  };
}

async function historyFingerprint(db, session) {
  const hash = crypto.createHash('sha256'); let count = 0;
  for await (const entry of db.collection('workentries').find({}, { session }).sort({ _id: 1 })) { hash.update(JSON.stringify(entry)); count++; }
  return { count, sha256: hash.digest('hex') };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const resolveEmp001Test = process.argv.includes('--resolve-emp001-test');
  if ((apply && process.argv.includes('--dry-run')) || process.argv.slice(2).some(arg => !['--apply', '--dry-run', '--resolve-emp001-test'].includes(arg))) throw new Error('Usage: node scripts/restoreOriginalEmployees.js [--dry-run|--apply] [--resolve-emp001-test]');
  const original = originalEmployees();
  // Validate the confirmed identities; never silently import a changed fixture.
  const confirmed = ['EMP001:Abinesh', 'EMP002:Kumar', 'EMP003:Arun', 'EMP004:Suresh', 'EMP005:Prakash', 'EMP006:Vignesh', 'EMP007:Manoj'];
  if (original.map(w => w.employeeId + ':' + w.name).sort().join('|') !== confirmed.sort().join('|')) throw new Error('Original source no longer matches the user-confirmed identities.');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI unavailable');
  const timer = setTimeout(() => { console.error('Database connection unavailable; no migration started.'); process.exit(1); }, 15000);
  try { await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }); }
  finally { clearTimeout(timer); }
  const db = mongoose.connection.db;
  const workersCollection = db.collection(Worker.collection.collectionName);
  const audit = async (session) => {
    const workers = await workersCollection.find({}, { session }).sort({ _id: 1 }).toArray();
    const historical = await db.collection('workentries').aggregate([{ $group: { _id: '$employeeId', names: { $addToSet: '$employeeName' }, entries: { $sum: 1 } } }], { session }).toArray();
    return { workers, historical, plan: planRestoration(original, workers, historical, { resolveEmp001Test }) };
  };
  const before = await audit();
  console.log('AUDIT ' + JSON.stringify({ database: db.databaseName, mode: apply ? 'apply' : 'dry-run', workerCount: before.workers.length, historicalUnique: before.historical.length, historicalPresent: before.historical.filter(h => before.workers.some(w => w.employeeId === h._id)), historicalMissing: before.historical.filter(h => !before.workers.some(w => w.employeeId === h._id)), ...before.plan }, null, 2));
  if (before.plan.conflicts.length) throw new Error('Restoration stopped before writes. Resolve reported identity/status conflicts first. EMP001 Test was not changed.');
  if (!apply) { console.log('DRY RUN ONLY: no records changed. Run with --apply only after reviewing the audit.'); return; }
  const indexes = await workersCollection.indexes();
  if (!indexes.some(index => index.unique && !index.partialFilterExpression && Object.keys(index.key).length === 1 && index.key.employeeId === 1)) throw new Error('Unique employeeId index required for concurrent duplicate safety. No indexes or records were changed.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await audit(session);
      if (current.plan.conflicts.length) throw new Error('Data changed or conflicts appeared; aborting transaction.');
      const historyBefore = await historyFingerprint(db, session);
      const snapshotPath = path.join(__dirname, 'employee-restoration-backup-' + Date.now() + '.json');
      fs.writeFileSync(snapshotPath, JSON.stringify({ database: db.databaseName, workers: current.workers, historyFingerprint: historyBefore }, null, 2), { flag: 'wx' });
      console.log('Worker backup: ' + snapshotPath);
      for (const correction of current.plan.corrections) {
        const { filter, update } = correctionOperation(correction);
        // Raw collection update deliberately preserves _id, timestamps, and optional fields.
        const result = await workersCollection.updateOne(filter, update, { session, upsert: false });
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) throw new Error('EMP001 changed since audit; aborting transaction.');
      }
      for (const employee of current.plan.missing) {
        // Existing IDs are never updated. A unique index protects concurrent inserts.
        const worker = new Worker({ ...employee, status: 'Active' });
        await worker.validate();
        const insert = worker.toObject();
        const now = new Date(); insert.createdAt = now; insert.updatedAt = now;
        await workersCollection.updateOne({ employeeId: employee.employeeId }, { $setOnInsert: insert }, { upsert: true, session });
      }
      const after = await audit(session);
      if (after.plan.conflicts.length || after.plan.missing.length || after.plan.corrections.length) throw new Error('Post-migration identity verification failed; aborting transaction.');
      for (const oldWorker of current.workers) {
        const existing = after.workers.find(w => String(w._id) === String(oldWorker._id));
        const correction = current.plan.corrections.find(item => String(item._id) === String(oldWorker._id));
        const expected = correction ? { ...oldWorker, employeeId: 'EMP001', name: 'Abinesh', status: 'Active' } : oldWorker;
        if (JSON.stringify(existing) !== JSON.stringify(expected)) throw new Error('Unexpected existing Worker change; aborting transaction.');
      }
      if (JSON.stringify(await historyFingerprint(db, session)) !== JSON.stringify(historyBefore)) throw new Error('WorkEntry fingerprint changed; aborting transaction.');
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
  // Exercise the actual GET controller with its existing Active filter.
  const { getWorkers } = require('../controllers/workerController');
  let result, status;
  await getWorkers({ user: { role: 'admin' }, query: {} }, { status(code) { status = code; return this; }, json(body) { result = body; return this; } });
  if (status !== 200 || !result.success || original.some(employee => !result.data.some(w => w.employeeId === employee.employeeId && w.name === employee.name))) throw new Error('Post-commit GET worker verification failed; rerun the read-only audit.');
  console.log('VERIFIED ' + JSON.stringify({ workerCount: await workersCollection.countDocuments(), getWorkersCount: result.count, employees: result.data.map(w => ({ employeeId: w.employeeId, name: w.name })), historicalWorkEntries: 'unchanged', originalWorkers: 'all seven Active' }, null, 2));
}
module.exports = { planRestoration, correctionOperation };
if (require.main === module) main().catch(error => { console.error(error.name === 'Error' ? error.message : 'Restoration failed: ' + error.name + '. No destructive fallback attempted; rerun audit to inspect current state.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
