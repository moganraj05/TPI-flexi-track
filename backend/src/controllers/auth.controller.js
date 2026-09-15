const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    // Stay signed in until the user logs out (mobile stores token in SecureStore).
    expiresIn: process.env.JWT_EXPIRES_IN || '365d',
  });

const formatUser = (user) => ({
  id: user._id,
  employeeId: user.employeeId,
  name: user.name,
  phone: user.phone,
  role: user.role,
  department: user.department,
  shiftStart: user.shiftStart || null,
  shiftEnd: user.shiftEnd || null,
  email: user.email || null,
});

exports.login = async (req, res, next) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'Employee ID and password are required' });
    }

    const user = await User.findOne({ employeeId: employeeId.toUpperCase() })
      .select('+password')
      .populate('department', 'name code');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken(user._id);
    user.password = undefined;

    res.json({
      success: true,
      data: { token, user: formatUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: formatUser(req.user) });
};
