const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const NAVY = '0B1F33';
const GOLD = 'C9A227';
const TEAL = '0F766E';
const GREEN = '15803D';
const RED = 'B91C1C';
const AMBER = 'B45309';
const CREAM = 'F7F3EA';
const WHITE = 'FFFFFF';

const formatDt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const statusLabel = (status) => {
  if (status === 'coming') return 'Coming';
  if (status === 'not_coming') return 'Not Coming';
  return 'No Response';
};

const fillHeader = (row, color) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
    cell.font = { bold: true, color: { argb: `FF${WHITE}` }, name: 'Calibri', size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD6C7A1' } },
      left: { style: 'thin', color: { argb: 'FFD6C7A1' } },
      bottom: { style: 'thin', color: { argb: 'FFD6C7A1' } },
      right: { style: 'thin', color: { argb: 'FFD6C7A1' } },
    };
  });
};

const styleBody = (cell, opts = {}) => {
  cell.font = { name: 'Calibri', size: 10, color: { argb: `FF${opts.color || '1F2937'}` }, bold: !!opts.bold };
  cell.alignment = { vertical: 'middle', horizontal: opts.align || 'left' };
  cell.border = {
    top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
  };
};

async function buildPollWorkbook(poll, summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexiTrack HR';
  workbook.created = new Date();
  workbook.company = 'TPI';

  const cover = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  cover.mergeCells('B2:G2');
  cover.getCell('B2').value = 'TPI  ·  FLEXITRACK HR';
  cover.getCell('B2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: `FF${GOLD}` } };

  cover.mergeCells('B3:G3');
  cover.getCell('B3').value = 'Shift Attendance Report';
  cover.getCell('B3').font = { name: 'Calibri', size: 22, bold: true, color: { argb: `FF${NAVY}` } };

  cover.mergeCells('B4:G4');
  cover.getCell('B4').value = poll.title;
  cover.getCell('B4').font = { name: 'Calibri', size: 14, color: { argb: 'FF334155' } };

  const meta = [
    ['Department', poll.department?.name || '—', 'Code', poll.department?.code || '—'],
    ['Shift', `${poll.shiftStart || ''}–${poll.shiftEnd || poll.shift}`, 'Poll date', formatDate(poll.date)],
    ['Opens', formatDt(poll.opensAt), 'Closes', formatDt(poll.closesAt)],
    ['Status', (poll.status || '').toUpperCase(), 'Generated', formatDt(new Date())],
  ];
  meta.forEach((row, i) => {
    const r = 6 + i;
    cover.getCell(`B${r}`).value = row[0];
    cover.getCell(`C${r}`).value = row[1];
    cover.getCell(`E${r}`).value = row[2];
    cover.getCell(`F${r}`).value = row[3];
    ['B', 'E'].forEach((col) => {
      cover.getCell(`${col}${r}`).font = { bold: true, color: { argb: 'FF64748B' }, size: 10 };
    });
    ['C', 'F'].forEach((col) => {
      cover.getCell(`${col}${r}`).font = { bold: true, color: { argb: `FF${NAVY}` }, size: 11 };
    });
  });

  const kpis = [
    { label: 'Workforce', value: summary.totalWorkers, color: NAVY },
    { label: 'Coming', value: summary.coming, color: GREEN },
    { label: 'Not coming', value: summary.notComing, color: RED },
    { label: 'No response', value: summary.pending, color: AMBER },
    { label: 'Response %', value: `${summary.responseRate}%`, color: TEAL },
    { label: 'Attendance %', value: `${summary.attendanceRate}%`, color: TEAL },
  ];
  kpis.forEach((kpi, i) => {
    const col = 2 + i;
    const labelCell = cover.getCell(12, col);
    const valueCell = cover.getCell(13, col);
    labelCell.value = kpi.label;
    valueCell.value = kpi.value;
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CREAM}` } };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CREAM}` } };
    labelCell.font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    valueCell.font = { bold: true, size: 18, color: { argb: `FF${kpi.color}` } };
    labelCell.alignment = { horizontal: 'center' };
    valueCell.alignment = { horizontal: 'center' };
  });

  cover.getCell('B15').value = 'Staffing note';
  cover.getCell('B15').font = { bold: true, color: { argb: `FF${NAVY}` } };
  cover.mergeCells('B16:G17');
  const gap = summary.notComing + summary.pending;
  cover.getCell('B16').value =
    gap > 0
      ? `${gap} worker(s) are unavailable or silent for this shift. Plan replacements before the next shift starts.`
      : 'Full expected coverage from this shift group. No immediate replacement action required.';
  cover.getCell('B16').alignment = { wrapText: true, vertical: 'top' };

  cover.getColumn(2).width = 16;
  cover.getColumn(3).width = 28;
  cover.getColumn(4).width = 16;
  cover.getColumn(5).width = 16;
  cover.getColumn(6).width = 22;
  cover.getColumn(7).width = 16;

  const roster = workbook.addWorksheet('Attendance Roster', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const headers = [
    '#',
    'Employee ID',
    'Name',
    'Phone',
    'Shift',
    'Status',
    'Answer',
    'Responded at',
  ];
  roster.addRow(headers);
  fillHeader(roster.getRow(1), NAVY);
  roster.getRow(1).height = 22;

  (summary.teamRoster || []).forEach((member, index) => {
    const row = roster.addRow([
      index + 1,
      member.employeeId,
      member.name,
      member.phone || '',
      member.shiftStart && member.shiftEnd ? `${member.shiftStart}–${member.shiftEnd}` : poll.shift,
      statusLabel(member.status),
      member.answer === 'yes' ? 'Yes' : member.answer === 'no' ? 'No' : '',
      member.answeredAt ? formatDt(member.answeredAt) : '',
    ]);
    row.height = 20;
    row.eachCell((cell, col) => styleBody(cell, { align: col === 1 || col === 6 ? 'center' : 'left' }));
    const statusCell = row.getCell(6);
    if (member.status === 'coming') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      statusCell.font = { ...statusCell.font, color: { argb: `FF${GREEN}` }, bold: true };
    } else if (member.status === 'not_coming') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      statusCell.font = { ...statusCell.font, color: { argb: `FF${RED}` }, bold: true };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      statusCell.font = { ...statusCell.font, color: { argb: `FF${AMBER}` }, bold: true };
    }
  });

  roster.columns = [
    { width: 6 },
    { width: 16 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 22 },
  ];
  roster.autoFilter = { from: 'A1', to: 'H1' };

  const coming = workbook.addWorksheet('Coming');
  const notComing = workbook.addWorksheet('Not Coming');
  const pending = workbook.addWorksheet('No Response');
  const groups = [
    [coming, (summary.teamRoster || []).filter((m) => m.status === 'coming'), GREEN],
    [notComing, (summary.teamRoster || []).filter((m) => m.status === 'not_coming'), RED],
    [pending, (summary.teamRoster || []).filter((m) => m.status === 'pending'), AMBER],
  ];
  groups.forEach(([sheet, rows, color]) => {
    sheet.addRow(['Employee ID', 'Name', 'Phone', 'Status']);
    fillHeader(sheet.getRow(1), color);
    rows.forEach((m) => sheet.addRow([m.employeeId, m.name, m.phone || '', statusLabel(m.status)]));
    sheet.columns = [{ width: 16 }, { width: 24 }, { width: 16 }, { width: 16 }];
  });

  return workbook;
}

async function buildPollExcelBuffer(poll, summary) {
  const workbook = await buildPollWorkbook(poll, summary);
  return workbook.xlsx.writeBuffer();
}

async function buildRangeExcelBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexiTrack HR';
  const sheet = workbook.addWorksheet('Manpower Plan', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });
  sheet.addRow([
    'Date',
    'Department',
    'Shift',
    'Status',
    'Coming',
    'Not coming',
    'No response',
    'Workforce',
    'Attendance %',
    'Poll',
  ]);
  fillHeader(sheet.getRow(1), NAVY);
  rows.forEach((r) => {
    sheet.addRow([
      formatDate(r.date),
      r.department,
      r.shift,
      r.status,
      r.coming,
      r.notComing,
      r.pending,
      r.totalWorkers,
      r.attendanceRate,
      r.title,
    ]);
  });
  sheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 32 },
  ];
  sheet.autoFilter = { from: 'A1', to: 'J1' };
  return workbook.xlsx.writeBuffer();
}

function drawKpiBox(doc, x, y, label, value, color) {
  doc.roundedRect(x, y, 118, 58, 8).fill('#F7F3EA');
  doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x + 10, y + 10, { width: 98 });
  doc.fillColor(color).fontSize(18).font('Helvetica-Bold').text(String(value), x + 10, y + 26, { width: 98 });
}

async function buildPollPdfBuffer(poll, summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: poll.title, Author: 'FlexiTrack HR' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 72).fill('#0B1F33');
    doc.fillColor('#C9A227').fontSize(10).font('Helvetica-Bold').text('TPI  ·  FLEXITRACK HR', 42, 18);
    doc.fillColor('#FFFFFF').fontSize(18).text('Shift Attendance Report', 42, 36);
    doc.fontSize(9).fillColor('#D6C7A1').text(formatDt(new Date()), 42, 56, { align: 'right', width: doc.page.width - 84 });

    doc.fillColor('#0B1F33').fontSize(14).font('Helvetica-Bold').text(poll.title, 42, 92);
    doc.font('Helvetica').fontSize(10).fillColor('#475569').text(
      `${poll.department?.name || ''} (${poll.department?.code || ''})  ·  ${poll.shiftStart || ''}–${poll.shiftEnd || poll.shift}  ·  ${formatDate(poll.date)}`,
      42,
      112
    );

    const kpis = [
      ['Workforce', summary.totalWorkers, '#0B1F33'],
      ['Coming', summary.coming, '#15803D'],
      ['Not coming', summary.notComing, '#B91C1C'],
      ['No response', summary.pending, '#B45309'],
    ];
    kpis.forEach((kpi, i) => drawKpiBox(doc, 42 + i * 128, 138, kpi[0], kpi[1], kpi[2]));

    doc.roundedRect(42, 210, 248, 52, 8).fill('#ECFDF5');
    doc.fillColor('#0F766E').fontSize(9).font('Helvetica-Bold').text('RESPONSE RATE', 54, 220);
    doc.fontSize(16).text(`${summary.responseRate}%`, 54, 236);
    doc.roundedRect(306, 210, 248, 52, 8).fill('#FEF3C7');
    doc.fillColor('#92400E').fontSize(9).text('ATTENDANCE RATE', 318, 220);
    doc.fontSize(16).text(`${summary.attendanceRate}%`, 318, 236);

    const gap = summary.notComing + summary.pending;
    doc.fillColor('#0B1F33').fontSize(11).font('Helvetica-Bold').text('HR action', 42, 280);
    doc.font('Helvetica').fontSize(10).fillColor('#334155').text(
      gap > 0
        ? `${gap} worker(s) need follow-up or replacement before the next shift.`
        : 'Coverage looks complete for this shift group.',
      42,
      296,
      { width: 510 }
    );

    const tableTop = 328;
    const cols = [42, 78, 168, 318, 418];
    const widths = [36, 90, 150, 100, 108];
    const headers = ['#', 'Emp ID', 'Name', 'Phone', 'Status'];
    doc.rect(42, tableTop, 512, 22).fill('#0B1F33');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, i) => doc.text(h, cols[i] + 4, tableTop + 7, { width: widths[i] - 8 }));

    let y = tableTop + 22;
    const roster = summary.teamRoster || [];
    roster.forEach((member, index) => {
      if (y > 760) {
        doc.addPage();
        y = 48;
        doc.rect(42, y, 512, 22).fill('#0B1F33');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
        headers.forEach((h, i) => doc.text(h, cols[i] + 4, y + 7, { width: widths[i] - 8 }));
        y += 22;
      }
      const bg = index % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(42, y, 512, 20).fill(bg);
      const statusColor =
        member.status === 'coming' ? '#15803D' : member.status === 'not_coming' ? '#B91C1C' : '#B45309';
      doc.font('Helvetica').fontSize(8).fillColor('#0F172A');
      const values = [String(index + 1), member.employeeId, member.name, member.phone || '—', statusLabel(member.status)];
      values.forEach((val, i) => {
        doc.fillColor(i === 4 ? statusColor : '#0F172A');
        doc.text(val, cols[i] + 4, y + 6, { width: widths[i] - 8, ellipsis: true });
      });
      y += 20;
    });

    doc.fontSize(8).fillColor('#94A3B8').text(
      'Confidential · For internal HR and operations use only · FlexiTrack',
      42,
      doc.page.height - 36,
      { width: 512, align: 'center' }
    );

    doc.end();
  });
}

module.exports = { buildPollExcelBuffer, buildPollPdfBuffer, buildRangeExcelBuffer };
