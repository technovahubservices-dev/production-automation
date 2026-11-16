const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceCursor = require('../models/AttendanceCursor');

const indiaDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
function validateEvent(e) {
  if (!e || !/^[0-9a-f-]{36}$/i.test(e.eventId || '') || !mongoose.isObjectIdOrHexString(e.workerId) ||
      typeof e.employeeId !== 'string' || !e.employeeId.trim() || e.employeeId !== e.employeeId.trim().toUpperCase() ||
      !['CHECK_IN', 'CHECK_OUT'].includes(e.action) || !Number.isSafeInteger(e.sequence) || e.sequence < 1 ||
      e.demoMode !== false || e.checks?.passkey !== true || e.checks?.face !== true ||
      typeof e.verifiedAt !== 'string' || !Number.isFinite(Date.parse(e.verifiedAt)) ||
      new Date(e.verifiedAt).toISOString() !== e.verifiedAt || Date.parse(e.verifiedAt) > Date.now() + 30_000)
    throw Object.assign(new Error('Invalid attendance event.'), { status: 400 });
  // Older signed events remain deliverable after an outage. Request signatures must still be fresh.
}
function transition(open, e, latestClosed) {
  const time = new Date(e.verifiedAt);
  if (e.action === 'CHECK_IN') {
    if (open) return { accepted: false, code: 'ALREADY_CHECKED_IN', message: 'Already checked in.', session: open };
    if (latestClosed && time < new Date(latestClosed.checkOut))
      return { accepted: false, code: 'OUT_OF_ORDER', message: 'Verification predates the last checkout.' };
    return { accepted: true, code: 'CHECKED_IN', message: 'Check In recorded.' };
  }
  if (!open) return { accepted: false, code: 'NO_OPEN_SESSION', message: 'No matching Check In. Check in first.' };
  if (time <= new Date(open.checkIn)) return { accepted: false, code: 'OUT_OF_ORDER', message: 'Check Out must follow Check In.' };
  return { accepted: true, code: 'CHECKED_OUT', message: 'Check Out recorded.', durationMs: time - new Date(open.checkIn) };
}
async function ingest(e) {
  validateEvent(e);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify([
    e.eventId, e.workerId, e.employeeId, e.sequence, e.action, e.verifiedAt, e.checks.passkey, e.checks.face, e.demoMode,
  ])).digest('hex');
  // Retry duplicate-key races using a new transaction snapshot.
  for (let attempt = 0; attempt < 4; attempt++) {
    const dbSession = await mongoose.startSession();
    try {
      let result;
      await dbSession.withTransaction(async () => {
        const prior = await AttendanceEvent.findOne({ eventId: e.eventId }).session(dbSession).lean();
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw Object.assign(new Error('Event ID reused with different data.'), { status: 409 });
          result = { ...prior.result, duplicate: true }; return;
        }
        let cursor = await AttendanceCursor.findById(e.workerId).session(dbSession);
        if (!cursor) [cursor] = await AttendanceCursor.create([{ _id: e.workerId, sequence: 0 }], { session: dbSession });
        if (e.sequence !== cursor.sequence + 1)
          throw Object.assign(new Error('Attendance event sequence gap or conflict; earlier delivery must complete first.'), { status: 409 });
        const worker = await Worker.findById(e.workerId).session(dbSession);
        result = { accepted: false, code: 'EMPLOYEE_UNAVAILABLE', message: 'Employee mapping is missing, changed, or inactive.' };
        if (worker && worker.status === 'Active' && worker.employeeId === e.employeeId) {
          const open = await AttendanceSession.findOne({ workerId: worker._id, status: 'Checked In' }).session(dbSession).lean();
          const latest = await AttendanceSession.findOne({ workerId: worker._id, status: 'Checked Out' }).sort({ checkOut: -1 }).session(dbSession).lean();
          result = cursor.lastVerifiedAt && new Date(e.verifiedAt) < cursor.lastVerifiedAt
            ? { accepted: false, code: 'OUT_OF_ORDER', message: 'Verification predates an already processed action.' }
            : transition(open, e, latest);
          if (result.accepted) {
            let row;
            if (e.action === 'CHECK_IN') {
              [row] = await AttendanceSession.create([{
                workerId: worker._id, employeeId: worker.employeeId, employeeName: worker.name,
                attendanceDate: indiaDate(e.verifiedAt), checkIn: e.verifiedAt, status: 'Checked In', checkInEventId: e.eventId,
              }], { session: dbSession });
            } else {
              row = await AttendanceSession.findOneAndUpdate({ _id: open._id, status: 'Checked In' }, {
                $set: { checkOut: e.verifiedAt, checkOutEventId: e.eventId, status: 'Checked Out', durationMs: result.durationMs },
              }, { returnDocument: 'after', session: dbSession });
            }
            result.session = row.toObject();
          }
        }
        cursor.sequence = e.sequence;
        if (!cursor.lastVerifiedAt || new Date(e.verifiedAt) > cursor.lastVerifiedAt) cursor.lastVerifiedAt = e.verifiedAt;
        await cursor.save({ session: dbSession });
        await AttendanceEvent.create([{ eventId: e.eventId, workerId: e.workerId, sequence: e.sequence, payloadHash, result }], { session: dbSession });
      });
      return result;
    } catch (error) {
      if (error.code !== 11000 || attempt === 3) throw error;
    } finally { await dbSession.endSession(); }
  }
}
function summarize(rows) {
  const employees = new Map();
  for (const row of rows) {
    const key = String(row.workerId);
    if (!employees.has(key)) employees.set(key, { workerId: key, employeeId: row.employeeId, employeeName: row.employeeName, days: new Set(), totalMs: 0, sessionCount: 0, incompleteSessions: 0, daily: {} });
    const item = employees.get(key);
    item.days.add(row.attendanceDate); item.sessionCount++;
    item.totalMs += row.durationMs || 0;
    if (row.status === 'Checked In') item.incompleteSessions++;
    item.daily[row.attendanceDate] = (item.daily[row.attendanceDate] || 0) + (row.durationMs || 0);
  }
  return [...employees.values()].map(({ days, ...item }) => ({ ...item, attendanceDays: days.size, totalHours: item.totalMs / 3_600_000 }));
}
module.exports = { indiaDate, validateEvent, transition, ingest, summarize };
