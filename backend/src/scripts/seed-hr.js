require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

const seedHr = async () => {
  await connectDB();

  const email = 'hr@tpi.local';
  const existing = await User.findOne({ $or: [{ email }, { employeeId: 'HR001' }] });
  if (existing) {
    existing.email = email;
    existing.role = 'hr';
    existing.name = existing.name || 'Priya Sharma';
    existing.isActive = true;
    existing.password = 'password123';
    await existing.save();
    console.log(`Updated HR login: ${email} / password123`);
  } else {
    await User.create({
      employeeId: 'HR001',
      name: 'Priya Sharma',
      email,
      phone: '9876500099',
      password: 'password123',
      role: 'hr',
    });
    console.log(`Created HR login: ${email} / password123`);
  }
  process.exit(0);
};

seedHr().catch((err) => {
  console.error(err);
  process.exit(1);
});
