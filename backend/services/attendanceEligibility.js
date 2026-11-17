const AttendanceSession = require('../models/AttendanceSession');
const AttendanceEvent = require('../models/AttendanceEvent');
const Worker = require('../models/Worker');
const { indiaDate } = require('./attendanceService');

async function getCheckedInWorkers({ employeeId, now = new Date() } = {}) {
  return AttendanceSession.aggregate([
    { $match: { attendanceDate: indiaDate(now), checkIn: { $lte: now }, ...(employeeId ? { employeeId } : {}) } },
    // Check the latest session before filtering its status, so an older open row
    // cannot qualify an employee whose later session has already closed.
    { $sort: { checkIn: -1, _id: -1 } },
    { $group: { _id: '$workerId', session: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$session' } },
    { $match: { status: 'Checked In', checkOut: null, checkOutEventId: null } },
    // Sessions have no client-controlled "verified" flag. Their accepted event
    // is written atomically by ingest only after the signed biometric checks.
    { $lookup: {
      from: AttendanceEvent.collection.name,
      let: { eventId: '$checkInEventId', workerId: '$workerId', sessionId: '$_id' },
      pipeline: [{ $match: { $expr: { $and: [
        { $eq: ['$eventId', '$$eventId'] }, { $eq: ['$workerId', '$$workerId'] },
        { $eq: ['$result.accepted', true] }, { $eq: ['$result.code', 'CHECKED_IN'] },
        { $eq: ['$result.session._id', '$$sessionId'] },
        { $eq: ['$result.session.status', 'Checked In'] },
      ] } } }], as: 'biometricEvent',
    } },
    { $match: { 'biometricEvent.0': { $exists: true } } },
    { $lookup: { from: Worker.collection.name, localField: 'workerId', foreignField: '_id', as: 'worker' } },
    { $unwind: '$worker' },
    { $match: { 'worker.status': 'Active', $expr: { $eq: ['$worker.employeeId', '$employeeId'] } } },
    { $project: { _id: '$worker._id', employeeId: '$worker.employeeId', name: '$worker.name' } },
    { $sort: { employeeId: 1 } },
  ]);
}

module.exports = { getCheckedInWorkers };
