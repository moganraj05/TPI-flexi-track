// One-time data cleanup: PERMANENTLY deletes every plant/department except
// TCD (currently CRSS and EXPORTS) — their workers, incharges, polls,
// responses and follow-ups. This is a hard delete, not the soft-delete
// (isActive=false) that deactivate-other-plants.js does; there is no undo.
//
// Deletion order respects the schema's FK constraints (Poll/Response/
// FollowUp have no onDelete on their required relations, so children must
// go before parents):
//   FollowUp (by pollId or workerId) -> Response (by pollId or userId)
//   -> Poll (by departmentId) -> User (by departmentId) -> Department
//
// Dry-run by default: prints exactly what would be deleted and writes
// nothing. Run with --apply to actually delete.
//
//   node src/scripts/delete-other-plants.js            # dry run
//   node src/scripts/delete-other-plants.js --apply    # permanently deletes
require('dotenv').config();
const prisma = require('../config/prisma');

const KEEP_CODE = 'TCD';
const APPLY = process.argv.includes('--apply');

async function run() {
  const otherDepartments = await prisma.department.findMany({
    where: { code: { not: KEEP_CODE } },
  });

  if (otherDepartments.length === 0) {
    console.log(`No departments other than ${KEEP_CODE} found — nothing to do.`);
    process.exit(0);
    return;
  }

  const deptIds = otherDepartments.map((d) => d.id);

  const users = await prisma.user.findMany({
    where: { departmentId: { in: deptIds }, role: { in: ['worker', 'incharge'] } },
    select: { id: true, employeeId: true, name: true, role: true, departmentId: true },
  });
  const userIds = users.map((u) => u.id);

  const polls = await prisma.poll.findMany({
    where: { departmentId: { in: deptIds } },
    select: { id: true, title: true, date: true, departmentId: true },
  });
  const pollIds = polls.map((p) => p.id);

  const [responseCount, followUpCount] = await Promise.all([
    prisma.response.count({ where: { OR: [{ pollId: { in: pollIds } }, { userId: { in: userIds } }] } }),
    prisma.followUp.count({ where: { OR: [{ pollId: { in: pollIds } }, { workerId: { in: userIds } }] } }),
  ]);

  console.log(`${APPLY ? 'PERMANENTLY DELETING' : 'DRY RUN'} — plants other than ${KEEP_CODE}\n`);
  otherDepartments.forEach((dept) => {
    const deptUsers = users.filter((u) => u.departmentId === dept.id);
    const deptPolls = polls.filter((p) => p.departmentId === dept.id);
    console.log(`Plant ${dept.code} (${dept.name}): ${deptUsers.length} worker(s)/incharge(s), ${deptPolls.length} poll(s)`);
    deptUsers.forEach((u) => console.log(`  ${u.employeeId} | ${u.name} | ${u.role}`));
  });
  console.log(`\nTotal: ${userIds.length} user(s), ${pollIds.length} poll(s), ${responseCount} response(s), ${followUpCount} follow-up(s), ${otherDepartments.length} department(s).`);

  if (!APPLY) {
    console.log('\nDry run only — nothing deleted. Re-run with --apply to permanently delete all of the above.');
    process.exit(0);
    return;
  }

  await prisma.$transaction([
    prisma.followUp.deleteMany({ where: { OR: [{ pollId: { in: pollIds } }, { workerId: { in: userIds } }] } }),
    prisma.response.deleteMany({ where: { OR: [{ pollId: { in: pollIds } }, { userId: { in: userIds } }] } }),
    prisma.poll.deleteMany({ where: { departmentId: { in: deptIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    prisma.department.deleteMany({ where: { id: { in: deptIds } } }),
  ]);

  console.log('\nPermanently deleted.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
