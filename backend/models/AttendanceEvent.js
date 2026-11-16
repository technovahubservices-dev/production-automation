const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sequence: { type: Number, required: true },
  payloadHash: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ workerId: 1, sequence: 1 }, { unique: true });
module.exports = mongoose.model('AttendanceEvent', schema);
