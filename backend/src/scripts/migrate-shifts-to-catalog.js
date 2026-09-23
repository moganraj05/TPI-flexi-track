// One-time data migration: snaps every active worker/incharge's shift onto
// the nearest of the 5 fixed catalog shifts (see backend/src/config/
// shiftCatalog.js), so shiftStart/shiftEnd/shiftName become exact catalog
// values everywhere going forward (poll-automation groups workers by exact
// (shiftStart, shiftEnd) pairs, so this is what makes every worker's next
// auto-created poll land on a real catalog shift).
//
// Historical Poll rows are deliberately left untouched — they're a record
// of what actually happened, not something to retcon.
//
// Dry-run by default: prints the proposed mapping and writes nothing.
// Run with --apply to actually write the changes.
//
//   node src/scripts/migrate-shifts-to-catalog.js            # dry run
//   node src/scripts/migrate-shifts-to-catalog.js --apply    # writes
require('dotenv').config();
const prisma = require('../config/prisma');
const { getShiftCatalog, getShiftByTimes } = require('../config/shiftCatalog');

const APPLY = process.argv.includes('--apply');

const parseHHMM = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Circular distance on a 24h clock, so 23:50 vs 00:00 is "10 minutes" apart,
// not "1430 minutes".
const circularDistance = (aMinutes, bMinutes) => {
  const diff = Math.abs(aMinutes - bMinutes);
  return Math.min(diff, 1440 - diff);
};

const nearestShift = (shiftStart, shiftEnd, catalog) => {
  const startMin = parseHHMM(shiftStart);
  const endMin = parseHHMM(shiftEnd);

  let best = null;
  let bestStartDelta = Infinity;
  let bestEndDelta = Infinity;

  catalog.forEach((entry) => {
    const startDelta = circularDistance(startMin, parseHHMM(entry.shiftStart));
    const endDelta = circularDistance(endMin, parseHHMM(entry.shiftEnd));
    const better =
      startDelta < bestStartDelta || (startDelta === bestStartDelta && endDelta < bestEndDelta);
    if (better) {
      best = entry;
      bestStartDelta = startDelta;
      bestEndDelta = endDelta;
    }
  });

  return { entry: best, startDelta: bestStartDelta };
};

async function run() {
  const catalog = getShiftCatalog();

  const people = await prisma.user.findMany({
    where: {
      role: { in: ['worker', 'incharge'] },
      isActive: true,
      NOT: [{ shiftStart: null }, { shiftStart: '' }, { shiftEnd: null }, { shiftEnd: '' }],
    },
    select: { id: true, employeeId: true, name: true, role: true, shiftStart: true, shiftEnd: true, shiftName: true },
  });

  const alreadyMatched = [];
  const toMigrate = [];

  people.forEach((person) => {
    const exact = getShiftByTimes(person.shiftStart, person.shiftEnd);
    if (exact) {
      alreadyMatched.push({ person, entry: exact });
      return;
    }
    const { entry, startDelta } = nearestShift(person.shiftStart, person.shiftEnd, catalog);
    toMigrate.push({ person, entry, startDelta });
  });

  toMigrate.sort((a, b) => b.startDelta - a.startDelta);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — shift catalog migration`);
  console.log(`${people.length} active worker(s)/incharge(s) with a shift set.`);
  console.log(`${alreadyMatched.length} already match a catalog shift exactly — no change.`);
  console.log(`${toMigrate.length} will be remapped to the nearest catalog shift:\n`);

  console.log(
    ['Employee ID', 'Name', 'Role', 'Current', '-> Shift', 'New times', 'Start delta (min)'].join(' | ')
  );
  toMigrate.forEach(({ person, entry, startDelta }) => {
    console.log(
      [
        person.employeeId,
        person.name,
        person.role,
        `${person.shiftStart}-${person.shiftEnd}`,
        entry.name,
        `${entry.shiftStart}-${entry.shiftEnd}`,
        startDelta,
      ].join(' | ')
    );
  });

  if (!APPLY) {
    console.log('\nDry run only — no changes written. Re-run with --apply to write these changes.');
    process.exit(0);
    return;
  }

  for (const { person, entry } of toMigrate) {
    await prisma.user.update({
      where: { id: person.id },
      data: { shiftStart: entry.shiftStart, shiftEnd: entry.shiftEnd, shiftName: entry.name },
    });
  }
  // Already-matched people still get shiftName normalized to the catalog's
  // exact name (e.g. a legacy free-typed "shift a" becomes "Shift A").
  for (const { person, entry } of alreadyMatched) {
    if (person.shiftName !== entry.name) {
      await prisma.user.update({ where: { id: person.id }, data: { shiftName: entry.name } });
    }
  }

  console.log(`\nApplied. ${toMigrate.length} remapped, ${alreadyMatched.length} shiftName-normalized.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
