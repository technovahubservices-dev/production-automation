// Raw collection reads only: no models, index creation, or database writes.
async function readDependencies(db, session) {
  // MongoDB transaction sessions require sequential operations.
  const attendance = await db.collection('attendancesessions').aggregate([
    { $group: { _id: '$employeeId', names: { $addToSet: '$employeeName' }, workerIds: { $addToSet: '$workerId' }, entries: { $sum: 1 } } },
  ], { session }).toArray();
  const events = await db.collection('attendanceevents').aggregate([
    { $group: { _id: '$workerId', entries: { $sum: 1 } } },
  ], { session }).toArray();
  const cursors = await db.collection('attendancecursors').find({}, { session, projection: { _id: 1 } }).toArray();
  return { attendance, events, cursors };
}

function dependencyConflicts(original, workers, { attendance = [], events = [], cursors = [] } = {}) {
  const conflicts = [];
  const workerIds = new Set(workers.map(w => String(w._id)));
  for (const employee of original) {
    const worker = workers.find(w => w.employeeId === employee.employeeId);
    for (const row of attendance.filter(row => row._id === employee.employeeId)) {
      if (row.names.some(name => name !== employee.name))
        conflicts.push({ employeeId: employee.employeeId, reason: 'Attendance names conflict with the original identity; manual review required.' });
      if (!worker || row.workerIds.some(id => String(id) !== String(worker._id)))
        conflicts.push({ employeeId: employee.employeeId, reason: 'Attendance references a different or missing Worker _id. Do not insert a replacement identity.' });
    }
  }
  const references = [
    ...attendance.flatMap(row => row.workerIds.map(id => ({ id, source: 'attendancesessions' }))),
    ...events.map(row => ({ id: row._id, source: 'attendanceevents' })),
    ...cursors.map(row => ({ id: row._id, source: 'attendancecursors' })),
  ];
  const reported = new Set();
  for (const { id, source } of references) {
    const key = source + ':' + String(id);
    if (!workerIds.has(String(id)) && !reported.has(key)) {
      reported.add(key);
      conflicts.push({ workerId: String(id), source, reason: 'Orphaned attendance Worker reference; review before restoring employees with new IDs.' });
    }
  }
  return conflicts;
}

function workerIdentityConflicts(workers) {
  const conflicts = [], seen = new Set();
  for (const worker of workers) {
    const canonical = typeof worker.employeeId === 'string' ? worker.employeeId.trim().toUpperCase() : '';
    if (!canonical || canonical !== worker.employeeId)
      conflicts.push({ employeeId: worker.employeeId, reason: 'Invalid or unnormalized stored employee ID; manual review required before inserting identities.' });
    if (seen.has(canonical)) conflicts.push({ employeeId: canonical, reason: 'Duplicate employee IDs already exist; stop for manual review.' });
    seen.add(canonical);
  }
  return conflicts;
}

module.exports = { readDependencies, dependencyConflicts, workerIdentityConflicts };
