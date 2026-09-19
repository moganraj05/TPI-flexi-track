// Wipes all FlexiTrack data and reseeds it with the exact plants/incharges/workers
// from the Claude Design canvas (FlexiTrack.dc.html), plus real Poll/Response
// records sized to that roster so the HR web console isn't empty on first login.
require('dotenv').config();
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');
const { getStartOfDay } = require('../utils/date');
const { addDays } = require('../utils/shift');

const PASSWORD = 'password123';

const PLANTS = [
  { code: 'TCD', name: 'TCD Plant' },
  { code: 'CRSS', name: 'CRSS Plant' },
  { code: 'EXPORTS', name: 'Exports Plant' },
];

const INCHARGES = [
  { key: 'i1', employeeId: 'INC001', name: 'Suresh Kumar', plant: 'TCD', shiftName: 'Shift A', shiftStart: '06:00', shiftEnd: '14:00', phone: '+91 98450 11021', email: 'suresh.kumar@flexitrack.com' },
  { key: 'i2', employeeId: 'INC002', name: 'Ramesh Iyer', plant: 'TCD', shiftName: 'Shift B', shiftStart: '14:00', shiftEnd: '22:00', phone: '+91 98450 11022', email: 'ramesh.iyer@flexitrack.com' },
  { key: 'i3', employeeId: 'INC003', name: 'Priya Nair', plant: 'CRSS', shiftName: 'Shift A', shiftStart: '06:30', shiftEnd: '14:30', phone: '+91 98450 11023', email: 'priya.nair@flexitrack.com' },
  { key: 'i4', employeeId: 'INC004', name: 'Arjun Menon', plant: 'CRSS', shiftName: 'Shift B', shiftStart: '14:30', shiftEnd: '22:30', phone: '+91 98450 11024', email: 'arjun.menon@flexitrack.com' },
  { key: 'i5', employeeId: 'INC005', name: 'Vikram Das', plant: 'EXPORTS', shiftName: 'Shift A', shiftStart: '07:00', shiftEnd: '15:00', phone: '+91 98450 11025', email: 'vikram.das@flexitrack.com' },
  { key: 'i6', employeeId: 'INC006', name: 'Lakshmi Rao', plant: 'EXPORTS', shiftName: 'Shift B', shiftStart: '15:00', shiftEnd: '23:00', phone: '+91 98450 11026', email: 'lakshmi.rao@flexitrack.com' },
];

const WORKERS = [
  { employeeId: 'EMP1042', name: 'Manoj Pillai', plant: 'TCD', inchargeKey: 'i2', equipment: 'CNC Lathe 3', process: 'Turning', push: true, phone: '+91 90001 10001', email: 'manoj.pillai@flexitrack.com' },
  { employeeId: 'EMP1043', name: 'Deepak Yadav', plant: 'TCD', inchargeKey: 'i2', equipment: 'CNC Lathe 3', process: 'Turning', push: true, phone: '+91 90001 10002', email: 'deepak.yadav@flexitrack.com' },
  { employeeId: 'EMP1044', name: 'Anil Kumar', plant: 'TCD', inchargeKey: 'i1', equipment: 'Hydraulic Press 2', process: 'Stamping', push: false, phone: '+91 90001 10003', email: 'anil.kumar@flexitrack.com' },
  { employeeId: 'EMP1045', name: 'Ravi Shankar', plant: 'TCD', inchargeKey: 'i2', equipment: 'Hydraulic Press 2', process: 'Stamping', push: true, phone: '+91 90001 10004', email: 'ravi.shankar@flexitrack.com' },
  { employeeId: 'EMP1046', name: 'Sunil Verma', plant: 'TCD', inchargeKey: 'i2', equipment: 'Welding Bay 1', process: 'Welding', push: true, phone: '+91 90001 10005', email: 'sunil.verma@flexitrack.com' },
  { employeeId: 'EMP1047', name: 'Ajay Singh', plant: 'TCD', inchargeKey: 'i1', equipment: 'Welding Bay 1', process: 'Welding', push: true, phone: '+91 90001 10006', email: 'ajay.singh@flexitrack.com' },
  { employeeId: 'EMP2011', name: 'Kavita Joshi', plant: 'CRSS', inchargeKey: 'i3', equipment: 'Assembly Line 4', process: 'Assembly', push: true, phone: '+91 90002 20001', email: 'kavita.joshi@flexitrack.com' },
  { employeeId: 'EMP2012', name: 'Neha Sharma', plant: 'CRSS', inchargeKey: 'i3', equipment: 'Assembly Line 4', process: 'Assembly', push: true, phone: '+91 90002 20002', email: 'neha.sharma@flexitrack.com' },
  { employeeId: 'EMP2013', name: 'Rahul Gupta', plant: 'CRSS', inchargeKey: 'i3', equipment: 'Paint Booth 1', process: 'Painting', push: false, phone: '+91 90002 20003', email: 'rahul.gupta@flexitrack.com' },
  { employeeId: 'EMP2014', name: 'Sanjay Patil', plant: 'CRSS', inchargeKey: 'i4', equipment: 'Paint Booth 1', process: 'Painting', push: true, phone: '+91 90002 20004', email: 'sanjay.patil@flexitrack.com' },
  { employeeId: 'EMP2015', name: 'Meena Krishnan', plant: 'CRSS', inchargeKey: 'i4', equipment: 'Assembly Line 2', process: 'Assembly', push: true, phone: '+91 90002 20005', email: 'meena.krishnan@flexitrack.com' },
  { employeeId: 'EMP2016', name: 'Vishal Reddy', plant: 'CRSS', inchargeKey: 'i3', equipment: 'CNC Mill 1', process: 'Milling', push: true, phone: '+91 90002 20006', email: 'vishal.reddy@flexitrack.com' },
  { employeeId: 'EMP3001', name: 'Farhan Ali', plant: 'EXPORTS', inchargeKey: 'i5', equipment: 'Packing Line 2', process: 'Packing', push: true, phone: '+91 90003 30001', email: 'farhan.ali@flexitrack.com' },
  { employeeId: 'EMP3002', name: 'Imran Sheikh', plant: 'EXPORTS', inchargeKey: 'i5', equipment: 'Packing Line 2', process: 'Packing', push: true, phone: '+91 90003 30002', email: 'imran.sheikh@flexitrack.com' },
  { employeeId: 'EMP3003', name: 'George Mathew', plant: 'EXPORTS', inchargeKey: 'i6', equipment: 'QC Station 1', process: 'Quality Check', push: false, phone: '+91 90003 30003', email: 'george.mathew@flexitrack.com' },
  { employeeId: 'EMP3004', name: 'Thomas Abraham', plant: 'EXPORTS', inchargeKey: 'i5', equipment: 'QC Station 1', process: 'Quality Check', push: true, phone: '+91 90003 30004', email: 'thomas.abraham@flexitrack.com' },
  { employeeId: 'EMP3005', name: 'Nithya Balan', plant: 'EXPORTS', inchargeKey: 'i6', equipment: 'Labeling Unit 1', process: 'Labeling', push: true, phone: '+91 90003 30005', email: 'nithya.balan@flexitrack.com' },
  { employeeId: 'EMP3006', name: 'Suresh Babu', plant: 'EXPORTS', inchargeKey: 'i6', equipment: 'Packing Line 1', process: 'Packing', push: true, phone: '+91 90003 30006', email: 'suresh.babu@flexitrack.com' },
];

async function seed() {
  console.log('Clearing all existing data (Department, User, Poll, Response, FollowUp)...');
  await prisma.followUp.deleteMany({});
  await prisma.response.deleteMany({});
  await prisma.poll.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});

  const hashedPassword = await hashPassword(PASSWORD);

  const deptByCode = {};
  for (const p of PLANTS) {
    deptByCode[p.code] = await prisma.department.create({ data: p });
  }

  await prisma.user.create({
    data: {
      employeeId: 'HR001',
      name: 'HR Admin',
      email: 'hr.admin@flexitrack.com',
      phone: '+91 90000 00001',
      password: hashedPassword,
      role: 'admin', // can manage other HR/admin logins — see hr.controller.js createHrAdmin
    },
  });

  const inchargeByKey = {};
  for (const inc of INCHARGES) {
    inchargeByKey[inc.key] = await prisma.user.create({
      data: {
        employeeId: inc.employeeId,
        name: inc.name,
        email: inc.email,
        phone: inc.phone,
        password: hashedPassword,
        role: 'incharge',
        departmentId: deptByCode[inc.plant].id,
        shiftStart: inc.shiftStart,
        shiftEnd: inc.shiftEnd,
        shiftName: inc.shiftName,
      },
    });
  }

  const workerByEmpId = {};
  for (const w of WORKERS) {
    const incDoc = inchargeByKey[w.inchargeKey];
    workerByEmpId[w.employeeId] = await prisma.user.create({
      data: {
        employeeId: w.employeeId,
        name: w.name,
        email: w.email,
        phone: w.phone,
        password: hashedPassword,
        role: 'worker',
        departmentId: deptByCode[w.plant].id,
        inchargeId: incDoc.id,
        equipment: w.equipment,
        process: w.process,
        shiftStart: incDoc.shiftStart,
        shiftEnd: incDoc.shiftEnd,
        shiftName: incDoc.shiftName,
        pushToken: w.push ? `ExponentPushToken[seed-${w.employeeId}]` : null,
      },
    });
  }

  const now = new Date();
  const today = getStartOfDay(now);
  const yesterday = getStartOfDay(addDays(now, -1));
  const twoDaysAgo = getStartOfDay(addDays(now, -2));

  const createPoll = async ({ plant, shiftStart, shiftEnd, date, status, opensAt, closesAt, answers }) => {
    const poll = await prisma.poll.create({
      data: {
        title: `Next shift attendance (${shiftStart}–${shiftEnd})`,
        description: 'Confirm if you are coming for your next shift.',
        departmentId: deptByCode[plant].id,
        date,
        shift: `${shiftStart}–${shiftEnd}`,
        shiftStart,
        shiftEnd,
        status,
        opensAt,
        closesAt,
        autoCreated: true,
      },
    });
    for (const [empId, answer] of Object.entries(answers)) {
      if (!answer) continue;
      await prisma.response.create({
        data: {
          pollId: poll.id,
          userId: workerByEmpId[empId].id,
          answer,
          answeredAt: status === 'closed' ? closesAt : new Date(),
        },
      });
    }
    return poll;
  };

  console.log('Seeding live (open) polls for today...');
  await createPoll({
    plant: 'TCD', shiftStart: '14:00', shiftEnd: '22:00', date: today, status: 'open',
    opensAt: new Date(now.getTime() - 60 * 60 * 1000),
    closesAt: new Date(now.getTime() + (1 * 60 + 42) * 60 * 1000),
    answers: { EMP1042: 'yes', EMP1043: 'yes', EMP1045: 'no' }, // EMP1046 left pending
  });
  await createPoll({
    plant: 'CRSS', shiftStart: '06:30', shiftEnd: '14:30', date: today, status: 'open',
    opensAt: new Date(now.getTime() - 60 * 60 * 1000),
    closesAt: new Date(now.getTime() + (3 * 60 + 10) * 60 * 1000),
    answers: { EMP2011: 'yes', EMP2012: 'yes', EMP2016: 'yes' }, // EMP2013 left pending
  });
  await createPoll({
    plant: 'EXPORTS', shiftStart: '07:00', shiftEnd: '15:00', date: today, status: 'open',
    opensAt: new Date(now.getTime() - 60 * 60 * 1000),
    closesAt: new Date(now.getTime() + 45 * 60 * 1000),
    answers: { EMP3001: 'yes', EMP3004: 'yes' }, // EMP3002 left pending
  });

  console.log('Seeding poll history for the last two days...');
  await createPoll({
    plant: 'TCD', shiftStart: '06:00', shiftEnd: '14:00', date: yesterday, status: 'closed',
    opensAt: new Date(yesterday.getTime() + 14.5 * 3600 * 1000), closesAt: new Date(yesterday.getTime() + 20 * 3600 * 1000),
    answers: { EMP1044: 'yes', EMP1047: 'yes' },
  });
  await createPoll({
    plant: 'CRSS', shiftStart: '14:30', shiftEnd: '22:30', date: yesterday, status: 'closed',
    opensAt: new Date(yesterday.getTime() + 23 * 3600 * 1000), closesAt: new Date(yesterday.getTime() + 28.5 * 3600 * 1000),
    answers: { EMP2014: 'yes', EMP2015: 'no' },
  });
  await createPoll({
    plant: 'EXPORTS', shiftStart: '15:00', shiftEnd: '23:00', date: yesterday, status: 'closed',
    opensAt: new Date(yesterday.getTime() + 23.5 * 3600 * 1000), closesAt: new Date(yesterday.getTime() + 29 * 3600 * 1000),
    answers: { EMP3003: 'yes', EMP3005: 'yes', EMP3006: 'no' },
  });
  await createPoll({
    plant: 'TCD', shiftStart: '14:00', shiftEnd: '22:00', date: twoDaysAgo, status: 'closed',
    opensAt: new Date(twoDaysAgo.getTime() + 22.5 * 3600 * 1000), closesAt: new Date(twoDaysAgo.getTime() + 28 * 3600 * 1000),
    answers: { EMP1042: 'yes', EMP1043: 'yes', EMP1045: 'yes', EMP1046: 'no' },
  });
  await createPoll({
    plant: 'CRSS', shiftStart: '06:30', shiftEnd: '14:30', date: twoDaysAgo, status: 'closed',
    opensAt: new Date(twoDaysAgo.getTime() + 15 * 3600 * 1000), closesAt: new Date(twoDaysAgo.getTime() + 20.5 * 3600 * 1000),
    answers: { EMP2011: 'yes', EMP2012: 'yes', EMP2013: 'yes', EMP2016: 'no' },
  });
  await createPoll({
    plant: 'EXPORTS', shiftStart: '07:00', shiftEnd: '15:00', date: twoDaysAgo, status: 'closed',
    opensAt: new Date(twoDaysAgo.getTime() + 15.5 * 3600 * 1000), closesAt: new Date(twoDaysAgo.getTime() + 21 * 3600 * 1000),
    answers: { EMP3001: 'yes', EMP3002: 'yes', EMP3004: 'yes' },
  });

  console.log('\nDone. Seeded:');
  console.log(`  ${PLANTS.length} plants, ${INCHARGES.length} incharges, ${WORKERS.length} workers`);
  console.log('  3 live polls (today) + 6 poll history records (last 2 days)');
  console.log('\nHR login: hr.admin@flexitrack.com / password123');
  console.log('Incharge/worker logins: any employeeId above / password123');

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
