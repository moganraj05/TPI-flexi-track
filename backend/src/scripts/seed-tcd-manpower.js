// Seeds FlexiTrack with the REAL TCD plant manpower roster extracted from
// data-templates/TCD_MANPOWER_DETAILS_clean.xlsx (217 workers, 5 shift
// incharges, 2 overall incharges) instead of the small illustrative demo
// dataset seed-design.js uses.
//
// NOT wired into any npm script — this only wipes and reseeds TCD data when
// you explicitly run `node src/scripts/seed-tcd-manpower.js`. Review it
// first; it is destructive (wipes Department/User/Poll/Response/FollowUp,
// same as seed-design.js).
//
// What's real vs. filled in:
//   - Names, employee IDs, equipment, process, and shift/incharge
//     assignments are exactly what's in the spreadsheet (names are
//     title-cased from the sheet's ALL-CAPS style; nothing else changed).
//   - The spreadsheet has no password/phone/email data for anyone, so every
//     account gets the same placeholder password ('password123') and no
//     phone/email — change these before this goes near anything real.
//   - No poll or response history is seeded. Inventing fake Yes/No
//     attendance answers for 217 real, named people isn't something this
//     script does — the existing poll-automation scheduler will create real
//     polls on its own for these shifts once this data is live.
//   - The 5 "Shift Incharge" people (per the sheet) each have workers
//     spread across all 5 shift codes, not one fixed shift of their own —
//     so their own shiftStart/shiftEnd is left null here, same as any
//     incharge in this app without a shift set. The 2 "Overall Incharge"
//     people have no workers reporting to them in the source data, so
//     they're seeded as FlexiTrack's 'supervisor' role instead of
//     'incharge'.
//   - The sheet's `contractor` column (which manpower vendor supplies a
//     worker) has no home in the current schema (User has no `contractor`
//     field) — it's kept on each row below for reference but not written to
//     the database. Add a column + migration first if you want it stored.
require('dotenv').config();
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');

const PASSWORD = 'password123';

const PLANTS = [{ code: 'TCD', name: 'TCD Plant' }];

// Matches src/config/shiftCatalog.js exactly (and the spreadsheet's own
// Shift_Master sheet, which lists the identical five codes/timings).
const SHIFTS = {
  A: { shiftStart: '08:00', shiftEnd: '16:00', shiftName: 'Shift A' },
  B: { shiftStart: '16:00', shiftEnd: '00:00', shiftName: 'Shift B' },
  C: { shiftStart: '00:00', shiftEnd: '08:00', shiftName: 'Shift C' },
  D: { shiftStart: '08:00', shiftEnd: '20:00', shiftName: 'Shift D' },
  E: { shiftStart: '20:00', shiftEnd: '08:00', shiftName: 'Shift E' },
};

// From Incharge_Master (7 rows): 5 Shift Incharges + 2 Overall Incharges.
const INCHARGES = [
  { key: "INC-01", employeeId: "INC-01", name: "Antony Navis", role: "incharge" },
  { key: "INC-02", employeeId: "INC-02", name: "Dilli Rajan", role: "incharge" },
  { key: "INC-03", employeeId: "INC-03", name: "Chitravel", role: "incharge" },
  { key: "INC-04", employeeId: "INC-04", name: "Sathish", role: "incharge" },
  { key: "INC-05", employeeId: "INC-05", name: "Sheik Abdullah", role: "incharge" },
  { key: "INC-06", employeeId: "INC-06", name: "Arun", role: "supervisor" },
  { key: "INC-07", employeeId: "INC-07", name: "Patturaj", role: "supervisor" },
];

// From Workers (217 rows).
const WORKERS = [
  { employeeId: "TCD-EMP-0001", name: "Divya Priya", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CUTTING", contractor: "KAVI", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0002", name: "Sami Kumar", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CUTTING", contractor: "KAVI", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0003", name: "Vulu Ravi Das", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CHAMFERING OPERATOR", contractor: "KAVI", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0004", name: "Rakesh", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CHAMFERING OPERATOR", contractor: "KAVI", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0005", name: "Raushan", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CHAMFERING LOADING", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0006", name: "Aman", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CHAMFERING LOADING", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0007", name: "Sandev", equipment: "JET 1 CUTTING & CHAMBARING M/C", process: "CHAMFERING LOADING", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0008", name: "Ranjith Kumar", equipment: "HEAT TREATMENT - 1", process: "OPERATOR", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0009", name: "Shrill", equipment: "HEAT TREATMENT - 1", process: "OPERATOR", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0010", name: "Laxminarayan", equipment: "HEAT TREATMENT - 1", process: "OPERATOR", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0011", name: "Viajy Kumar", equipment: "HEAT TREATMENT - 1", process: "LOADING", contractor: "NAPS", shiftCode: "D", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0012", name: "Viajay", equipment: "HEAT TREATMENT - 1", process: "LOADING", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0013", name: "Baidhnath", equipment: "HEAT TREATMENT - 1", process: "LOADING", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0014", name: "Mohan Kumar", equipment: "STRAITENING M/C - 2", process: "OPERATOR", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0015", name: "Mani", equipment: "STRAITENING M/C - 2", process: "OPERATOR", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0016", name: "Kundan", equipment: "STRAITENING M/C - 2", process: "OPERATOR", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0017", name: "Mahalakshmi", equipment: "STRAITENING- 2 MANUAL BEND", process: "MANUAL BEND REMOVAL", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0018", name: "Gopinath", equipment: "STRAITENING- 2 MANUAL BEND", process: "MANUAL BEND REMOVAL", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0019", name: "Mansih Kumar", equipment: "STRAITENING- 2 MANUAL BEND", process: "MANUAL BEND REMOVAL", contractor: "KRISHNAN", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0020", name: "Mansih Kumar", equipment: "STRAITENING- 2 MANUAL BEND", process: "MANUAL BEND REMOVAL", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0021", name: "Sima", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0022", name: "Sagar", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0023", name: "Savithri", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "D", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0024", name: "Sabita", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0025", name: "Sranti", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "D", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0026", name: "Sandeep", equipment: "STRAITENING - 2  INSPECTION TABLE - 1", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0027", name: "Roshni", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0028", name: "Anitha", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0029", name: "Kavita", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0030", name: "Nandhini", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "D", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0031", name: "Nomita", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0032", name: "Nahaki", equipment: "STRAITENING - 2  INSPECTION TABLE - 2", process: "TROLLY INSPECTION", contractor: "S.K. SOLUTION", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0033", name: "Jessie", equipment: "SOCO - 1", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0034", name: "Parithosh", equipment: "SOCO - 1", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "B", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0035", name: "Mutharasan", equipment: "SOCO - 5", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0036", name: "Natai", equipment: "SOCO - 5", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0037", name: "Pushparaj", equipment: "SOCO - 5", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0038", name: "Megala", equipment: "SOCO - 2", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "D", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0039", name: "Mohidul", equipment: "SOCO - 2", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0040", name: "Saravanan", equipment: "SOCO - 2", process: "CUTTING", contractor: "THENNARASU ENTERPRISES", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0041", name: "Dinesh", equipment: "HEAT TREATMENT - 3", process: "OPERATOR", contractor: "THENNARASU ENTERPRISES", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0042", name: "Muthu Kutti", equipment: "HEAT TREATMENT - 3", process: "OPERATOR", contractor: "THENNARASU ENTERPRISES", shiftCode: "E", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0043", name: "Kiran", equipment: "HEAT TREATMENT - 3", process: "OPERATOR", contractor: "THENNARASU ENTERPRISES", shiftCode: "C", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0044", name: "Chandra Kala", equipment: "HEAT TREATMENT - 3", process: "LOADING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-01" },
  { employeeId: "TCD-EMP-0045", name: "Resham", equipment: "HEAT TREATMENT - 3", process: "LOADING", contractor: "THENNARASU ENTERPRISES", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0046", name: "Nageshwari", equipment: "STRAITENING -3 INPECTION TEBLE -3", process: "INSPECTION & PACKING", contractor: "THENNARASU ENTERPRISES", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0047", name: "Subodh", equipment: "STRAITENING -3 INPECTION TEBLE -3", process: "INSPECTION & PACKING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0048", name: "Srinivasan", equipment: "STRAITENING -3 INPECTION TEBLE -3", process: "INSPECTION & PACKING", contractor: "THENNARASU ENTERPRISES", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0049", name: "Amala", equipment: "STRAITENING -3 INPECTION TEBLE -3", process: "INSPECTION & PACKING", contractor: "THENNARASU ENTERPRISES", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0050", name: "Niraj", equipment: "STRAITENING -3 INPECTION TEBLE -3", process: "INSPECTION & PACKING", contractor: "THENNARASU ENTERPRISES", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0051", name: "Sanjay", equipment: "LINE - 4 CUTTING", process: "OPERATOR", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0052", name: "Vishal", equipment: "LINE - 4 CUTTING", process: "OPERATOR", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0053", name: "Vetrivel", equipment: "HEAT TREATMENT - 4", process: "OPERATOR", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0054", name: "Kabilan", equipment: "HEAT TREATMENT - 4", process: "OPERATOR", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0055", name: "Jai Ganesh", equipment: "HEAT TREATMENT - 4", process: "OPERATOR", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0056", name: "Dhuryandhan", equipment: "HEAT TREATMENT - 4", process: "DEBURING  LOADING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0057", name: "Manoj Murmu", equipment: "HEAT TREATMENT - 4", process: "DEBURING  LOADING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0058", name: "Mansih Kumar", equipment: "HEAT TREATMENT - 4", process: "UNLOADING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0059", name: "Ajit Paswan", equipment: "HEAT TREATMENT - 4", process: "UNLOADING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0060", name: "Ajay", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0061", name: "Anil Kumar", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0062", name: "Saran", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0063", name: "Amerjit", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0064", name: "Shibdhan", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0065", name: "Ajith", equipment: "HEATTREATMENT - 4 MANUAL", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0066", name: "Jayashree", equipment: "HEATTREATMENT - 4 INSPECTION", process: "SIB INSPECTION", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0067", name: "Guddu Kumar.n", equipment: "HEATTREATMENT - 4 INSPECTION", process: "SIB INSPECTION", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0068", name: "Vikash Kumar", equipment: "HEATTREATMENT - 4 INSPECTION", process: "SIB INSPECTION", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0069", name: "Guddukumar.p", equipment: "HEATTREATMENT - 4 INSPECTION", process: "SIB INSPECTION", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0070", name: "Kapil Dev", equipment: "HEATTREATMENT - 4 INSPECTION", process: "OILING   & PACKING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0071", name: "Rakesh", equipment: "HEATTREATMENT - 4 INSPECTION", process: "OILING   & PACKING", contractor: "ARUL ENTERPRISES ( AJITH)", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0072", name: "Rohit", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OPERATOR", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0073", name: "Michael", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OPERATOR", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0074", name: "Dipak", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OPERATOR", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0075", name: "Sakthivel", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OPERATOR", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0076", name: "Sridhar", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OPERATOR", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0077", name: "Sathya", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0078", name: "Elias", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0079", name: "Siva Kuamr", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "MANUAL BEND REMOVAL", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0080", name: "Rajesh", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "INSPECTION", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0081", name: "Thamamari", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "INSPECTION", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "E", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0082", name: "Akash", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "INSPECTION", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0083", name: "Ashok", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "INSPECTION", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0084", name: "Chakana", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OILING & PACKING", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0085", name: "Nabin", equipment: "VERTICAL HEAT TREATMENT - 2 & 3", process: "OILING & PACKING", contractor: "ARUL ENTERPRISES (SIVA )", shiftCode: "B", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0086", name: "Monu Kumar", equipment: "VERTICAL  - 1 (TFF)", process: "HEAT TREATMENT OPERATOR", contractor: "ELDUCTION SYSTEMS", shiftCode: "A", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0087", name: "Parvendra", equipment: "VERTICAL  - 1 (TFF)", process: "HEAT TREATMENT OPERATOR", contractor: "ELDUCTION SYSTEMS", shiftCode: "C", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0088", name: "Ravindra Paswan", equipment: "VERTICAL  - 1 (TFF)", process: "GROOVING OPERATOR", contractor: "ELDUCTION SYSTEMS", shiftCode: "D", inchargeKey: "INC-02" },
  { employeeId: "TCD-EMP-0089", name: "Pawan Paswan", equipment: "VERTICAL  - 1 (TFF)", process: "GROOVING OPERATOR", contractor: "ELDUCTION SYSTEMS", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0090", name: "Sourav Kumar", equipment: "VERTICAL  - 1 (TFF)", process: "MANUAL BEND REMOVAL", contractor: "ELDUCTION SYSTEMS", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0091", name: "Sandeep", equipment: "VERTICAL  - 1 (TFF)", process: "MANUAL BEND REMOVAL", contractor: "ELDUCTION SYSTEMS", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0092", name: "Abi", equipment: "VERTICAL  - 1 (TFF)", process: "MPI CHECKING", contractor: "ELDUCTION SYSTEMS", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0093", name: "Sivagami", equipment: "VERTICAL  - 1 (TFF)", process: "INSPECTION", contractor: "ELDUCTION SYSTEMS", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0094", name: "Abinesh", equipment: "VERTICAL  - 1 (TFF)", process: "INSPECTION", contractor: "ELDUCTION SYSTEMS", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0095", name: "Rohit", equipment: "VERTICAL  - 1 (TFF)", process: "PACKING", contractor: "ELDUCTION SYSTEMS", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0096", name: "Dinesh", equipment: "VERTICAL  - 1 (TFF)", process: "PACKING", contractor: "ELDUCTION SYSTEMS", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0097", name: "Manish Kumar", equipment: "SOCO- 3 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0098", name: "Pawan", equipment: "SOCO- 3 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0099", name: "Raju", equipment: "SOCO- 7 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0100", name: "Aadhik", equipment: "SOCO- 7 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0101", name: "Sanjit", equipment: "SOCO- 9 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0102", name: "Sharwan", equipment: "SOCO- 9 CUTTING", process: "CUTTING", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0103", name: "Jitentra", equipment: "BLADE GRAINDING M/C", process: "Sharpening", contractor: "ARUL ENTERPRISES ( JITHU )", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0104", name: "Ramesh", equipment: "TIEROD PUSHPOINTER", process: "30PUSH POINT", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0105", name: "Jitentra", equipment: "TIEROD PUSHPOINTER", process: "30PUSH POINT", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0106", name: "Muthuraman", equipment: "TIEROD PUSHPOINTER", process: "30PUSH POINT BEND REMOVAL", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0107", name: "Srinivasan", equipment: "TIEROD PUSHPOINTER", process: "30PUSH POINT BEND REMOVAL", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0108", name: "Aryan", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTING", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0109", name: "Suraj", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTING", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0110", name: "Ranjith", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTING", contractor: "ARUL ENTERPRISES", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0111", name: "Shivmangal", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTING", contractor: "ARUL ENTERPRISES", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0112", name: "Aadhikesavan", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTER BEND REMOVAL", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0113", name: "Raushan", equipment: "TIEROD PUSHPOINTER", process: "60 PUSH POINTER BEND REMOVAL", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0114", name: "Sudhagar", equipment: "ROBO LINE", process: "R- LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0115", name: "Sourav Kumar", equipment: "ROBO LINE", process: "R- LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0116", name: "Subrata", equipment: "ROBO LINE", process: null, contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0117", name: "Suman", equipment: "ROBO LINE", process: "R- LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0118", name: "Sujit", equipment: "ROBO LINE", process: "R- LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "B", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0119", name: "Yuvaraj", equipment: "ROBO LINE", process: "K- LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0120", name: "Sudip", equipment: "ROBO LINE", process: "K- LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0121", name: "Ravi", equipment: "ROBO LINE", process: "K- LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0122", name: "Shyam", equipment: "ROBO LINE", process: "K- LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0123", name: "Sunil", equipment: "ROBO LINE", process: "K- LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0124", name: "Pradeep", equipment: "ROBO LINE", process: "G - LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0125", name: "Balaganesh", equipment: "ROBO LINE", process: "G - LINE OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0126", name: "Bikash", equipment: "ROBO LINE", process: "G - LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0127", name: "Nitesh", equipment: "ROBO LINE", process: "G - LINE INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0128", name: "Maheswari", equipment: "ROBO LINE", process: "SUBCONTRACT INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0129", name: "Neelesh", equipment: "ROBO LINE", process: "SUBCONTRACT INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0130", name: "Rommannas", equipment: "ROBO LINE", process: "SUBCONTRACT INSPECTION", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0131", name: "Sonu", equipment: "YLM - 65", process: "OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0132", name: "Bhishum", equipment: "YLM - 65", process: "OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-03" },
  { employeeId: "TCD-EMP-0133", name: "Dilli Babu", equipment: "YLM - 130", process: "OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0134", name: "Jaisankar", equipment: "YLM - 130", process: "OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0135", name: "Nitish", equipment: "YLM - 130", process: "OPERATOR", contractor: "ARUL ENTERPRISES", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0136", name: "Parimal", equipment: "YLM - 130", process: "DRESSING & PACKING", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0137", name: "Sudhir", equipment: "YLM - 130", process: "DRESSING & PACKING", contractor: "ARUL ENTERPRISES", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0138", name: "Sachin", equipment: "YLM - 130", process: "DRESSING & PACKING", contractor: "ARUL ENTERPRISES", shiftCode: "D", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0139", name: "Sonu", equipment: "YLM - 130", process: "DRESSING & PACKING", contractor: "ARUL ENTERPRISES", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0140", name: "Muksidul", equipment: "T -KAP", process: "CUTTING", contractor: "KAVI ( RAJESH )", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0141", name: "Govind Raj", equipment: "T -KAP", process: "CUTTING", contractor: "KAVI ( RAJESH )", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0142", name: "Anil Kumar", equipment: "T -KAP", process: "CUTTING", contractor: "KAVI ( RAJESH )", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0143", name: "Mahalakshmi", equipment: "T -KAP", process: "MILLING", contractor: "KAVI ( RAJESH )", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0144", name: "Vijay", equipment: "T -KAP", process: "MILLING", contractor: "KAVI ( RAJESH )", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0145", name: "Rajesh", equipment: "T -KAP", process: "INSPECTION & PACKING", contractor: "KAVI ( RAJESH )", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0146", name: "Anitha", equipment: "T -KAP", process: "INSPECTION & PACKING", contractor: "KAVI ( RAJESH )", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0147", name: "Shalini", equipment: "T -KAP", process: "INSPECTION & PACKING", contractor: "KAVI ( RAJESH )", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0148", name: "Jayanthi", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) INSPECTION", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0149", name: "Shanthi", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) INSPECTION", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0150", name: "Ammu", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) INSPECTION", contractor: "GOWTHAM", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0151", name: "Jayalakshmi", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0152", name: "Sheeba", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0153", name: "Parimala", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0154", name: "Mahi", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0155", name: "Maahendren", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0156", name: "Elumalai", equipment: "OFF LINE ACTIVITY", process: "90.1 mm (RATB) OILING & PACKING", contractor: "GOWTHAM", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0157", name: "Jayalakshmi", equipment: "OFF LINE ACTIVITY", process: "FRONT AXLE INSPECTION", contractor: "GOWTHAM", shiftCode: "D", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0158", name: "Malathi", equipment: "OFF LINE ACTIVITY", process: "FRONT AXLE INSPECTION", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0159", name: "Rahul", equipment: "OFF LINE ACTIVITY", process: "FRONT AXLE INSPECTION", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0160", name: "Ranjan", equipment: "OFF LINE ACTIVITY", process: "FRONT AXLE INSPECTION", contractor: "NAPS", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0161", name: "Jitentra", equipment: "OFF LINE ACTIVITY", process: "FRONT AXLE INSPECTION", contractor: "NAPS", shiftCode: "C", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0162", name: "Sheeba", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0163", name: "Rekha", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0164", name: "Soni Devi", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0165", name: "Paramamant", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0166", name: "Sundarajan", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0167", name: "Choote", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0168", name: "Giridharan", equipment: "OFF LINE ACTIVITY", process: "TWIST BEEM INSPECTION", contractor: "GOWTHAM", shiftCode: "D", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0169", name: "Priya", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0170", name: "Sheela", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0171", name: "Logeswari", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0172", name: "Viji", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "KRISHNAN", shiftCode: "B", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0173", name: "Pavithra", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "KRISHNAN", shiftCode: "D", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0174", name: "Deepa", equipment: "OFF LINE ACTIVITY", process: "PHA TROLLY INSPECTION", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-04" },
  { employeeId: "TCD-EMP-0175", name: "Adil Raini", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0176", name: "Nitish Kumar", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0177", name: "Baidhnath", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0178", name: "Manuvel", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0179", name: "Chandradev", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "D", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0180", name: "Raushan", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0181", name: "Golu", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0182", name: "Prince", equipment: "OFF LINE ACTIVITY", process: "OFF LINE INSPECTION & PACKING", contractor: "SK. SOLLUTION", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0183", name: "Subramani", equipment: "OFFLINE MANUAL BEND", process: "BEND REMOVAL", contractor: "GOWTHAM", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0184", name: "Ranjan", equipment: "OFFLINE MANUAL BEND", process: "BEND REMOVAL", contractor: "GOWTHAM", shiftCode: "D", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0185", name: "Aadhilakshmi", equipment: "OFFLINE MANUAL BEND", process: "BEND REMOVAL", contractor: "KRISHNAN", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0186", name: "Sriram", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "D", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0187", name: "Dinesh", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0188", name: "Karuppaiah", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "D", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0189", name: "Chinna Karuppu", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0190", name: "Mervin", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0191", name: "Hariram", equipment: "QUALITY", process: "QUALITY", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0192", name: "Rinku Varma", equipment: "CRANE OPERATORS", process: "INTERMOVEMENT OPERATORS", contractor: "NAPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0193", name: "Vijaya Sarathi", equipment: "CRANE OPERATORS", process: "INTERMOVEMENT OPERATORS", contractor: "KRISHNAN", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0194", name: "Neduncyzan", equipment: "CRANE OPERATORS", process: "INTERMOVEMENT OPERATORS", contractor: "GOWTHAM", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0195", name: "Sathish", equipment: "CRANE OPERATORS", process: "INTERMOVEMENT OPERATORS", contractor: "ARUL ENTERPRISES", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0196", name: "Raji", equipment: "FORK LIFT", process: "FORK LIFT OPERATORS", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0197", name: "Jayavel", equipment: "FORK LIFT", process: "FORK LIFT OPERATORS", contractor: "KRISHNAN", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0198", name: "Purusothaman", equipment: "FORK LIFT", process: "FORK LIFT OPERATORS", contractor: "KRISHNAN", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0199", name: "Gowtham", equipment: "DESPATCH", process: "DESPATCH", contractor: "KVPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0200", name: "Selvam", equipment: "DESPATCH", process: "DESPATCH", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0201", name: "Deva", equipment: "DESPATCH", process: "LOAD MOVEMENT", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0202", name: "Samuvel", equipment: "DESPATCH", process: "LOAD MOVEMENT", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0203", name: "Babu", equipment: "DESPATCH", process: "LOAD MOVEMENT", contractor: "KVPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0204", name: "Jancy Rani", equipment: "SOCO - 6 CUTTING M/C", process: "CUTTING", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0205", name: "Kamesh", equipment: "SOCO - 6 CUTTING M/C", process: "CUTTING", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0206", name: "Sudhir", equipment: "SOCO - 8 CUTTING M/C", process: "CUTTING", contractor: "KVPS", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0207", name: "Rajesh", equipment: "SOCO - 8 CUTTING M/C", process: "CUTTING", contractor: "KVPS", shiftCode: "A", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0208", name: "Mani", equipment: "OSP", process: "CHALLAN PREPARATION", contractor: "NAPS", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0209", name: "Jagadhish", equipment: "OSP", process: "CHALLAN PREPARATION", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0210", name: "Ponperumal", equipment: "DEO", process: "MATERIAL MOVEMENT", contractor: "NAPS", shiftCode: "C", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0211", name: "Sakthivel", equipment: "DEO", process: "MATERIAL MOVEMENT", contractor: "NAPS", shiftCode: "D", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0212", name: "Balamurugan", equipment: "DEO", process: "MATERIAL MOVEMENT", contractor: "NAPS", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0213", name: "Jesudas", equipment: "MAINTENANCE", process: "MAINTENANCE", contractor: "GOLD", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0214", name: "Sekar", equipment: "MAINTENANCE", process: "MATERIAL MOVEMENT & SUPPORT", contractor: "GOWTHAM", shiftCode: "B", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0215", name: "Arunachalam", equipment: "MAINTENANCE", process: "WELDER", contractor: "GOWTHAM", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0216", name: "Amar Kumar", equipment: "MAINTENANCE", process: "WELDER", contractor: "GOLD", shiftCode: "E", inchargeKey: "INC-05" },
  { employeeId: "TCD-EMP-0217", name: "Rajiv Kumar Mishra", equipment: "MAINTENANCE", process: "MAINTENANCE SUPPORT", contractor: "GOLD", shiftCode: "D", inchargeKey: "INC-05" },
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
      role: 'admin',
    },
  });

  const inchargeByKey = {};
  for (const inc of INCHARGES) {
    inchargeByKey[inc.key] = await prisma.user.create({
      data: {
        employeeId: inc.employeeId,
        name: inc.name,
        password: hashedPassword,
        role: inc.role,
        departmentId: deptByCode.TCD.id,
        // No single shift of their own — see the file header note.
        shiftStart: null,
        shiftEnd: null,
      },
    });
  }

  console.log(`Seeding ${WORKERS.length} workers...`);
  for (const w of WORKERS) {
    const shift = SHIFTS[w.shiftCode];
    const incharge = inchargeByKey[w.inchargeKey];
    await prisma.user.create({
      data: {
        employeeId: w.employeeId,
        name: w.name,
        password: hashedPassword,
        role: 'worker',
        departmentId: deptByCode.TCD.id,
        inchargeId: incharge ? incharge.id : null,
        equipment: w.equipment,
        process: w.process,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        shiftName: shift.shiftName,
        pushToken: null,
      },
    });
  }

  console.log('\nDone. Seeded:');
  console.log(`  ${PLANTS.length} plant, ${INCHARGES.length} incharges, ${WORKERS.length} workers`);
  console.log('  No poll/response history seeded (see file header).');
  console.log('\nHR login: hr.admin@flexitrack.com / password123');
  console.log('Incharge/worker logins: any employeeId above / password123');

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
