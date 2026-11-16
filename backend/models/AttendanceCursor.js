const mongoose = require('mongoose');
module.exports = mongoose.model('AttendanceCursor', new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  sequence: { type: Number, default: 0 },
  lastVerifiedAt: Date,
}));
