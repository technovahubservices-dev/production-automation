const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Worker' },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  attendanceDate: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: Date,
  status: { type: String, enum: ['Checked In', 'Checked Out'], required: true },
  durationMs: { type: Number, default: 0, min: 0 },
  checkInEventId: { type: String, required: true, unique: true },
  checkOutEventId: String,
}, { timestamps: true });
schema.index({ workerId: 1 }, { unique: true, partialFilterExpression: { status: 'Checked In' } });
schema.index({ attendanceDate: 1, workerId: 1 });
module.exports = mongoose.model('AttendanceSession', schema);
