const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['worker', 'incharge', 'supervisor', 'admin', 'superadmin', 'hr'];

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'worker' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    incharge: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    shiftStart: { type: String, trim: true, default: '08:00' },
    shiftEnd: { type: String, trim: true, default: '20:00' },
    shiftName: { type: String, trim: true, default: '' },
    equipment: { type: String, trim: true, default: '' },
    process: { type: String, trim: true, default: '' },
    pushToken: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
