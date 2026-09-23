// One-time data cleanup: deactivates every plant/department except TCD
// (currently CRSS and EXPORTS), plus every worker/incharge still assigned to
// them — a soft-delete (isActive=false), never a hard delete. TCD itself and
// its people are never touched.
//
// Order matters: hr.controller.js's deactivateDepartment already refuses to
// deactivate a department while active workers/incharges are still assigned
// to it, so this script deactivates the people first, then the department.
//
// Dry-run by default: prints who/what would be deactivated and writes
// nothing. Run with --apply to actually write the changes.
//
//   node src/scripts/deactivate-other-plants.js            # dry run
//   node src/scripts/deactivate-other-plants.js --apply    # writes
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

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — deactivate all plants except ${KEEP_CODE}\n`);

  for (const dept of otherDepartments) {
    const people = await prisma.user.findMany({
      where: { departmentId: dept.id, isActive: true, role: { in: ['worker', 'incharge'] } },
      select: { id: true, employeeId: true, name: true, role: true },
    });

    console.log(`Plant ${dept.code} (${dept.name}) — ${people.length} active worker(s)/incharge(s):`);
    people.forEach((p) => console.log(`  ${p.employeeId} | ${p.name} | ${p.role}`));

    if (!APPLY) continue;

    for (const p of people) {
      await prisma.user.update({ where: { id: p.id }, data: { isActive: false, pushToken: null } });
    }

    const stillActive = await prisma.user.count({
      where: { departmentId: dept.id, isActive: true, role: { in: ['worker', 'incharge'] } },
    });
    if (stillActive > 0) {
      throw new Error(`Plant ${dept.code} still has ${stillActive} active people after deactivation — aborting.`);
    }

    await prisma.department.update({ where: { id: dept.id }, data: { isActive: false } });
    console.log(`  -> deactivated ${people.length} people and the ${dept.code} plant.\n`);
  }

  if (!APPLY) {
    console.log('Dry run only — no changes written. Re-run with --apply to write these changes.');
  } else {
    console.log('Applied.');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
