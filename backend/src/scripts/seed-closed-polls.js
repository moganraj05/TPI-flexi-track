// Quick one-off: adds 3 CLOSED demo polls dated 23 Sept 2026 (Shift A/B/C)
// with randomized worker responses, so the webfrontend's Attendance/Reports
// pages have something to show. Additive only — does not touch the existing
// live/open polls or any other data.
require('dotenv').config();
const prisma = require('../config/prisma');

const SHIFTS = [
  { code: 'A', shiftStart: '08:00', shiftEnd: '16:00', label: 'Shift A · 8:00 AM – 4:00 PM' },
  { code: 'B', shiftStart: '16:00', shiftEnd: '00:00', label: 'Shift B · 4:00 PM – 12:00 AM' },
  { code: 'C', shiftStart: '00:00', shiftEnd: '08:00', label: 'Shift C · 12:00 AM – 8:00 AM' },
];

const day = (d, h = 0, m = 0) => new Date(Date.UTC(2026, 8, d, h - 5, m - 30)); // IST -> UTC (IST = UTC+5:30)

async function main() {
  const dept = await prisma.department.findFirst({ where: { code: 'TCD' } });
  if (!dept) throw new Error('TCD department not found');

  for (const shift of SHIFTS) {
    const workers = await prisma.user.findMany({
      where: { departmentId: dept.id, role: 'worker', isActive: true, shiftStart: shift.shiftStart, shiftEnd: shift.shiftEnd },
      select: { id: true },
    });
    if (workers.length === 0) {
      console.log(`No workers on ${shift.label}, skipping`);
      continue;
    }

    const opensAt = shift.code === 'A' ? day(22, 16, 30) : shift.code === 'B' ? day(23, 0, 30) : day(23, 8, 30);
    const closesAt = shift.code === 'A' ? day(23, 7, 0) : shift.code === 'B' ? day(23, 15, 0) : day(23, 23, 0);

    const poll = await prisma.poll.create({
      data: {
        title: `Next shift attendance (${shift.shiftStart}–${shift.shiftEnd})`,
        description: 'Confirm if you are coming for your next shift.',
        departmentId: dept.id,
        date: new Date(Date.UTC(2026, 8, 23)),
        shift: shift.label,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        status: 'closed',
        opensAt,
        closesAt,
        autoCreated: true,
      },
    });

    let yes = 0, no = 0, silent = 0;
    for (const w of workers) {
      const r = Math.random();
      if (r < 0.55) {
        await prisma.response.create({
          data: { pollId: poll.id, userId: w.id, answer: 'yes', answeredAt: new Date(opensAt.getTime() + Math.random() * (closesAt.getTime() - opensAt.getTime())) },
        });
        yes++;
      } else if (r < 0.8) {
        await prisma.response.create({
          data: { pollId: poll.id, userId: w.id, answer: 'no', answeredAt: new Date(opensAt.getTime() + Math.random() * (closesAt.getTime() - opensAt.getTime())) },
        });
        no++;
      } else {
        silent++;
      }
    }
    console.log(`${shift.label}: ${workers.length} workers -> ${yes} yes, ${no} no, ${silent} silent`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
