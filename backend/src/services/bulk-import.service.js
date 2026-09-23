const ExcelJS = require('exceljs');
const { getShiftCatalog } = require('../config/shiftCatalog');

const NAVY = '0B1F33';
const WHITE = 'FFFFFF';

const HEADERS = [
  'Employee ID',
  'Name',
  'Password',
  'Phone',
  'Email',
  'Shift Code',
  'Equipment',
  'Process',
  'Incharge ID',
  'Incharge Name',
];

const fillHeader = (row) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
    cell.font = { bold: true, color: { argb: `FF${WHITE}` }, name: 'Calibri', size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
};

// The template a plant's HR downloads to bulk-add workers: one sheet to fill
// in (with a real example row, using an actual incharge from this plant so
// the example is directly usable as a reference, not a placeholder), plus
// two read-only lookup sheets (existing incharges, fixed shift codes) so
// whoever fills the main sheet doesn't have to go find that information
// elsewhere. "Incharge ID" throughout means the incharge's employeeId (e.g.
// "INC001"), not the internal database id — that's what a human filling a
// spreadsheet can actually recognize and type correctly.
async function buildTeamBulkTemplate(department, incharges) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexiTrack HR';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Workers', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow(HEADERS);
  fillHeader(sheet.getRow(1));
  sheet.getRow(1).height = 26;

  const exampleIncharge = incharges[0] || null;
  const example = sheet.addRow([
    'EMP9001',
    'Example Worker',
    'password123',
    '9000000000',
    'example.worker@flexitrack.com',
    'A',
    'CNC Lathe 1',
    'Turning',
    exampleIncharge ? exampleIncharge.employeeId : '',
    exampleIncharge ? exampleIncharge.name : '',
  ]);
  example.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF64748B' }, name: 'Calibri', size: 10 };
  });

  sheet.columns = [
    { width: 16 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
    { width: 12 },
    { width: 20 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
  ];
  sheet.autoFilter = { from: 'A1', to: 'J1' };

  sheet.getCell('L1').value = 'Required: Employee ID, Name, Password, Shift Code.';
  sheet.getCell('L2').value = 'Shift Code must be one of A, B, C, D, E — see the "Shift codes" sheet.';
  sheet.getCell('L3').value = 'Fill either Incharge ID or Incharge Name (ID is safer — names can repeat).';
  sheet.getCell('L4').value = 'Delete the example row before uploading, or leave it — it will be skipped if the Employee ID already exists.';
  ['L1', 'L2', 'L3', 'L4'].forEach((ref) => {
    sheet.getCell(ref).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
  });
  sheet.getColumn(12).width = 60;

  const inchargeSheet = workbook.addWorksheet('Incharges reference');
  inchargeSheet.addRow(['Incharge ID', 'Incharge Name']);
  fillHeader(inchargeSheet.getRow(1));
  incharges.forEach((i) => inchargeSheet.addRow([i.employeeId, i.name]));
  inchargeSheet.columns = [{ width: 16 }, { width: 28 }];
  if (incharges.length === 0) {
    inchargeSheet.addRow([`No incharges found in ${department.name} yet — add one first, or leave Incharge blank.`]);
  }

  const shiftSheet = workbook.addWorksheet('Shift codes');
  shiftSheet.addRow(['Shift Code', 'Shift Name', 'Start', 'End']);
  fillHeader(shiftSheet.getRow(1));
  getShiftCatalog().forEach((s) => shiftSheet.addRow([s.code, s.name, s.shiftStart, s.shiftEnd]));
  shiftSheet.columns = [{ width: 12 }, { width: 14 }, { width: 10 }, { width: 10 }];

  return workbook.xlsx.writeBuffer();
}

// Reads the "Workers" sheet (falls back to the first sheet, in case a caller
// renamed or reordered them) of an uploaded workbook into plain row objects.
// Column matching is by header text, not position, so a HR user re-ordering
// or hiding columns in Excel doesn't silently corrupt the import.
async function parseTeamBulkFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Workers') || workbook.worksheets[0];
  if (!sheet) return { rows: [], error: 'No worksheet found in the uploaded file' };

  const headerRow = sheet.getRow(1);
  const headerMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value || '').trim().toLowerCase();
    if (text) headerMap[text] = colNumber;
  });

  const required = ['employee id', 'name', 'password', 'shift code'];
  const missing = required.filter((h) => !headerMap[h]);
  if (missing.length > 0) {
    return { rows: [], error: `Missing required column(s): ${missing.join(', ')}` };
  }

  const cellText = (row, label) => {
    const col = headerMap[label];
    if (!col) return '';
    const value = row.getCell(col).value;
    if (value == null) return '';
    if (typeof value === 'object' && value.text) return String(value.text).trim();
    return String(value).trim();
  };

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employeeId = cellText(row, 'employee id');
    const name = cellText(row, 'name');
    if (!employeeId && !name) return; // fully blank row — skip silently

    rows.push({
      rowNumber,
      employeeId,
      name,
      password: cellText(row, 'password'),
      phone: cellText(row, 'phone'),
      email: cellText(row, 'email'),
      shiftCode: cellText(row, 'shift code'),
      equipment: cellText(row, 'equipment'),
      process: cellText(row, 'process'),
      inchargeId: cellText(row, 'incharge id'),
      inchargeName: cellText(row, 'incharge name'),
    });
  });

  return { rows };
}

module.exports = { buildTeamBulkTemplate, parseTeamBulkFile };
