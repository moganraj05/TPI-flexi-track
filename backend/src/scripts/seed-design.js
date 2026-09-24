// Wipes all FlexiTrack data and reseeds it with the exact plants/incharges/workers
// from the Claude Design canvas (FlexiTrack.dc.html), plus real Poll/Response
// records sized to that roster so the HR web console isn't empty on first login.
require('dotenv').config();
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');
const { getStartOfDay } = require('../utils/date');
const { addDays, getPollWindow } = require('../utils/shift');

const PASSWORD = 'password123';

// Same 30-min-after-shift-ends / 1-hour-before-next-shift-starts window
// poll-automation.service.js uses for real, live-created polls (its
// openDelayMinutes/closeBeforeHours default to these same numbers) — so the
// seed's demo polls line up exactly with what the automatic scheduler would
// itself produce for these shifts, not an arbitrary approximation.
const POLL_WINDOW_OPTS = { openDelayMinutes: 30, closeBeforeHours: 1 };

const PLANTS = [
  { code: 'TCD', name: 'TCD Plant' },
];

// TCD only runs the catalog's two general day/evening shifts (src/config/
// shiftCatalog.js: Shift A 08:00–16:00, Shift B 16:00–00:00) — not the
// arbitrary 06:00–14:00/14:00–22:00 pair this seed used before, which didn't
// match any real shift the app's shift picker actually offers.
const INCHARGES = [
  { key: 'i1', employeeId: 'INC001', name: 'Suresh Kumar', plant: 'TCD', shiftName: 'Shift A', shiftStart: '08:00', shiftEnd: '16:00', phone: '+91 98450 11021', email: 'suresh.kumar@flexitrack.com' },
  { key: 'i2', employeeId: 'INC002', name: 'Ramesh Iyer', plant: 'TCD', shiftName: 'Shift B', shiftStart: '16:00', shiftEnd: '00:00', phone: '+91 98450 11022', email: 'ramesh.iyer@flexitrack.com' },
];

const WORKERS = [
  { employeeId: 'EMP1042', name: 'Manoj Pillai', plant: 'TCD', inchargeKey: 'i2', equipment: 'CNC Lathe 3', process: 'Turning', push: true, phone: '+91 90001 10001', email: 'manoj.pillai@flexitrack.com' },
  { employeeId: 'EMP1043', name: 'Deepak Yadav', plant: 'TCD', inchargeKey: 'i2', equipment: 'CNC Lathe 3', process: 'Turning', push: true, phone: '+91 90001 10002', email: 'deepak.yadav@flexitrack.com' },
  { employeeId: 'EMP1044', name: 'Anil Kumar', plant: 'TCD', inchargeKey: 'i1', equipment: 'Hydraulic Press 2', process: 'Stamping', push: false, phone: '+91 90001 10003', email: 'anil.kumar@flexitrack.com' },
  { employeeId: 'EMP1045', name: 'Ravi Shankar', plant: 'TCD', inchargeKey: 'i2', equipment: 'Hydraulic Press 2', process: 'Stamping', push: true, phone: '+91 90001 10004', email: 'ravi.shankar@flexitrack.com' },
  { employeeId: 'EMP1046', name: 'Sunil Verma', plant: 'TCD', inchargeKey: 'i2', equipment: 'Welding Bay 1', process: 'Welding', push: true, phone: '+91 90001 10005', email: 'sunil.verma@flexitrack.com' },
  { employeeId: 'EMP1047', name: 'Ajay Singh', plant: 'TCD', inchargeKey: 'i1', equipment: 'Welding Bay 1', process: 'Welding', push: true, phone: '+91 90001 10006', email: 'ajay.singh@flexitrack.com' },
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
  const SHIFT_A = { shiftStart: '08:00', shiftEnd: '16:00' };
  const SHIFT_B = { shiftStart: '16:00', shiftEnd: '00:00' };

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

  // Feeds a reference instant into getPollWindow — the exact function
  // poll-automation.service.js itself uses — so every seeded poll's
  // opensAt/closesAt/date is the real 30-min-after / 1-hour-before window
  // for that shift, not a hand-picked approximation. A past `at` naturally
  // yields that same shift's most recently completed cycle, which is what
  // makes the two history polls below land on "yesterday" and "two days ago".
  const seedPollFor = async (shift, at, answers) => {
    const window = getPollWindow(at, shift.shiftStart, shift.shiftEnd, POLL_WINDOW_OPTS);
    const isLive = window.valid && now >= window.opensAt && now < window.closesAt;
    return createPoll({
      plant: 'TCD',
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      date: getStartOfDay(window.nextStart),
      status: isLive ? 'open' : 'closed',
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      answers,
    });
  };

  console.log('Seeding today\'s poll for each shift (live if its window currently contains now)...');
  await seedPollFor(SHIFT_A, now, { EMP1044: 'yes', EMP1047: 'no' }); // Suresh's team
  await seedPollFor(SHIFT_B, now, { EMP1042: 'yes', EMP1043: 'yes', EMP1045: 'no' }); // EMP1046 left pending

  console.log('Seeding poll history for the last two days...');
  await seedPollFor(SHIFT_A, addDays(now, -1), { EMP1044: 'yes', EMP1047: 'yes' });
  await seedPollFor(SHIFT_B, addDays(now, -1), { EMP1042: 'yes', EMP1043: 'no', EMP1045: 'yes', EMP1046: 'yes' });
  await seedPollFor(SHIFT_A, addDays(now, -2), { EMP1044: 'yes', EMP1047: 'yes' });
  await seedPollFor(SHIFT_B, addDays(now, -2), { EMP1042: 'yes', EMP1043: 'yes', EMP1045: 'yes', EMP1046: 'no' });

  console.log('\nDone. Seeded:');
  console.log(`  ${PLANTS.length} plant, ${INCHARGES.length} incharges, ${WORKERS.length} workers`);
  console.log('  1 live poll (today) + 2 poll history records (last 2 days)');
  console.log('\nHR login: hr.admin@flexitrack.com / password123');
  console.log('Incharge/worker logins: any employeeId above / password123');

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
