require('dotenv').config();
const connectDB = require('../config/db');
const Department = require('../models/Department');
const User = require('../models/User');
const Poll = require('../models/Poll');
const Response = require('../models/Response');

const seed = async () => {
  await connectDB();

  await Promise.all([
    Department.deleteMany({}),
    User.deleteMany({}),
    Poll.deleteMany({}),
    Response.deleteMany({}),
  ]);

  const production = await Department.create({ name: 'Production', code: 'PROD' });
  const packing = await Department.create({ name: 'Packing', code: 'PACK' });

  const inchargeProd = await User.create({
    employeeId: 'INC001',
    name: 'Mohan Incharge',
    phone: '9876500001',
    password: 'password123',
    role: 'incharge',
    department: production._id,
  });

  const inchargePack = await User.create({
    employeeId: 'INC002',
    name: 'Lakshmi Incharge',
    phone: '9876500002',
    password: 'password123',
    role: 'incharge',
    department: packing._id,
  });

  const hr = await User.create({
    employeeId: 'HR001',
    name: 'Priya Sharma',
    email: 'hr@tpi.local',
    phone: '9876500099',
    password: 'password123',
    role: 'hr',
  });

  const workers = await User.create([
    {
      employeeId: 'EMP001',
      name: 'Ravi Kumar',
      phone: '9876543210',
      password: 'password123',
      role: 'worker',
      department: production._id,
      shiftStart: '08:00',
      shiftEnd: '20:00',
    },
    {
      employeeId: 'EMP002',
      name: 'Suresh Patel',
      phone: '9876543211',
      password: 'password123',
      role: 'worker',
      department: production._id,
      shiftStart: '08:00',
      shiftEnd: '20:00',
    },
    {
      employeeId: 'EMP003',
      name: 'Anitha Devi',
      phone: '9876543212',
      password: 'password123',
      role: 'worker',
      department: packing._id,
      shiftStart: '08:00',
      shiftEnd: '20:00',
    },
  ]);

  console.log('Seed completed successfully (polls are created automatically from shift timing)');
  console.log('\nHR portal (password: password123):');
  console.log(`  ${hr.email} - ${hr.name}`);
  console.log('\nIncharge accounts (password: password123):');
  console.log(`  INC001 - ${inchargeProd.name} (Production)`);
  console.log(`  INC002 - ${inchargePack.name} (Packing)`);
  console.log('\nWorker accounts (password: password123):');
  workers.forEach((w) =>
    console.log(`  ${w.employeeId} - ${w.name} (${w.shiftStart}–${w.shiftEnd})`)
  );
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
