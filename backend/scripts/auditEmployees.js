const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

function originalEmployees() {
  const root = path.resolve(__dirname, '../..');
  const source = fs.readFileSync(path.join(root, 'frontend/src/data/workers.js'), 'utf8');
  const identities = new Map();
  for (const match of source.matchAll(/employeeId:\s*"([^"]+)",\s*name:\s*"([^"]+)"/g)) {
    if (identities.has(match[1]) && identities.get(match[1]) !== match[2]) throw new Error('Conflicting original identity: ' + match[1]);
    identities.set(match[1], match[2]);
  }
  const employees = [...identities].map(([employeeId, name]) => ({ employeeId, name }));
  if (employees.length !== 7) throw new Error('Expected the confirmed seven original employees; review changed source before continuing.');
  return employees;
}

function reconcile(original, workers, historical) {
  const existing = new Map(workers.map(worker => [worker.employeeId, worker]));
  const namesById = new Map(historical.map(entry => [entry._id, entry.names]));
  const missing = [], conflicts = [];
  for (const employee of original) {
    const worker = existing.get(employee.employeeId);
    const historicalNames = namesById.get(employee.employeeId) || [];
    if (worker) {
      if (worker.name !== employee.name) conflicts.push({ employeeId: employee.employeeId, originalName: employee.name, workerName: worker.name, action: 'Preserve existing Worker unchanged; manual review required.' });
    } else if (historicalNames.some(name => name !== employee.name)) {
      conflicts.push({ ...employee, historicalNames, action: 'Do not import: historical identity conflicts.' });
    } else missing.push(employee);
  }
  return { missing, conflicts, historicalPresent: historical.filter(entry => existing.has(entry._id)), historicalMissing: historical.filter(entry => !existing.has(entry._id)) };
}

async function main() {
  const original = originalEmployees();
  console.log('ORIGINAL_SOURCE ' + JSON.stringify({ source: 'frontend/src/data/workers.js (confirmed original employee source)', count: original.length, employees: original }));
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI unavailable');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const workers = await db.collection('workers').find({}).sort({ employeeId: 1 }).toArray();
  const historical = await db.collection('workentries').aggregate([{ $group: { _id: '$employeeId', names: { $addToSet: '$employeeName' }, entries: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  const plan = reconcile(original, workers, historical);
  console.log('DATABASE_AUDIT ' + JSON.stringify({ database: db.databaseName, workerCount: workers.length, activeCount: workers.filter(w => w.status === 'Active').length, workers: workers.map(({ employeeId, name, status, createdAt, updatedAt }) => ({ employeeId, name, status, createdAt, updatedAt })), historicalUnique: historical.length, ...plan }, null, 2));
  // This script is intentionally read-only. No creation, updates, indexes, or migrations.
}
module.exports = { originalEmployees, reconcile };
if (require.main === module) {
  const timer = setTimeout(() => { console.error('Employee audit timed out; no records changed.'); process.exit(1); }, 15000);
  main().catch(error => { console.error('Employee audit failed: ' + error.name); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); clearTimeout(timer); });
}
