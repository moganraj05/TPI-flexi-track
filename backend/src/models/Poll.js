const mongoose = require('mongoose');

const POLL_STATUS = ['open', 'closed'];

const pollSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    date: { type: Date, required: true },
    shift: { type: String, default: 'general', trim: true },
    shiftStart: { type: String, trim: true },
    shiftEnd: { type: String, trim: true },
    status: { type: String, enum: POLL_STATUS, default: 'open' },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autoCreated: { type: Boolean, default: true },
    sendReminder: { type: Boolean, default: true },
    reminderMinutesBefore: { type: Number, default: 30, min: 5, max: 120 },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

pollSchema.index(
  { department: 1, shiftStart: 1, shiftEnd: 1, date: 1 },
  { unique: true, name: 'uniq_shift_poll' }
);

module.exports = mongoose.model('Poll', pollSchema);
module.exports.POLL_STATUS = POLL_STATUS;
