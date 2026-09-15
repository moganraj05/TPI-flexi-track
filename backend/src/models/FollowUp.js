const mongoose = require('mongoose');

const STATUSES = ['pending', 'contacted', 'confirmed_coming', 'confirmed_not_coming'];

const followUpSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    poll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
    status: { type: String, enum: STATUSES, default: 'pending' },
    note: { type: String, trim: true, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

followUpSchema.index({ worker: 1, poll: 1 }, { unique: true });

module.exports = mongoose.model('FollowUp', followUpSchema);
module.exports.STATUSES = STATUSES;
