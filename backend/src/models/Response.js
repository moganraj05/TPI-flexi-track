const mongoose = require('mongoose');

const ANSWERS = ['yes', 'no'];

const responseSchema = new mongoose.Schema(
  {
    poll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answer: { type: String, enum: ANSWERS, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

responseSchema.index({ poll: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Response', responseSchema);
module.exports.ANSWERS = ANSWERS;
