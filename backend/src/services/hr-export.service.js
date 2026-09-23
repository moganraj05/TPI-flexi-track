const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const NAVY = '0B1F33';
const GREEN = '15803D';
const RED = 'B91C1C';
const AMBER = 'B45309';
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

// Renders one roster worksheet into an already-created workbook — shared by
// the single-poll export and the daily multi-shift export below, so the two
// can never drift in styling. `poll`/`summary` are null when no poll exists
// for that shift/date (the daily export's "no poll" tab): rather than
// silently omitting the shift, the sheet still appears with a plain
// explanatory row.
function addRosterSheet(workbook, sheetName, poll, summary) {
  const roster = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  if (!poll || !summary) {
    roster.addRow(['No poll exists for this shift on this date.']);
    roster.getCell('A1').font = { italic: true, color: { argb: 'FF64748B' }, name: 'Calibri', size: 11 };
    roster.getColumn(1).width = 48;
    return roster;
  }

  const headers = [
    '#',
    'Employee ID',
    'Name',
    'Phone',
    'Equipment',
    'Process',
    'Incharge',
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
      member.equipment || '',
      member.process || '',
      member.incharge?.name || '',
      member.shiftStart && member.shiftEnd ? `${member.shiftStart}–${member.shiftEnd}` : poll.shift,
      statusLabel(member.status),
      member.answer === 'yes' ? 'Yes' : member.answer === 'no' ? 'No' : '',
      member.answeredAt ? formatDt(member.answeredAt) : '',
    ]);
    row.height = 20;
    row.eachCell((cell, col) => styleBody(cell, { align: col === 1 || col === 9 ? 'center' : 'left' }));
    const statusCell = row.getCell(9);
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
    { width: 20 },
    { width: 18 },
    { width: 20 },
    { width: 16 },
    { width: 14 },
    { width: 10 },
    { width: 22 },
  ];
  roster.autoFilter = { from: 'A1', to: 'K1' };

  return roster;
}

async function buildPollWorkbook(poll, summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexiTrack HR';
  workbook.created = new Date();
  workbook.company = 'TPI';
  addRosterSheet(workbook, 'Attendance', poll, summary);
  return workbook;
}

async function buildPollExcelBuffer(poll, summary) {
  const workbook = await buildPollWorkbook(poll, summary);
  return workbook.xlsx.writeBuffer();
}

// One workbook, one sheet per catalog shift, for a single plant+date — the
// "download all 5 shifts for today" report. `shiftEntries` is
// [{ catalogEntry, poll, summary }], poll/summary null where that shift
// didn't run/wasn't created for the date. Sheet names carry the shift code
// and open/closed/no-poll status (Excel tab names are plain text, capped at
// 31 chars, hence putting status there rather than only in the roster body).
async function buildDailyShiftsWorkbook(shiftEntries) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexiTrack HR';
  workbook.created = new Date();
  workbook.company = 'TPI';

  shiftEntries.forEach(({ catalogEntry, poll, summary }) => {
    const status = !poll ? 'No poll' : poll.status === 'open' ? 'Open' : 'Closed';
    const sheetName = `${catalogEntry.code} - ${status}`.slice(0, 31);
    addRosterSheet(workbook, sheetName, poll, summary);
  });

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

    // --- Team breakdown by incharge: a management summary, not a raw roster ---
    const roster = summary.teamRoster || [];
    const byIncharge = new Map();
    roster.forEach((m) => {
      const key = m.incharge?.name || 'Unassigned';
      if (!byIncharge.has(key)) byIncharge.set(key, { coming: 0, notComing: 0, pending: 0 });
      const entry = byIncharge.get(key);
      if (m.status === 'coming') entry.coming += 1;
      else if (m.status === 'not_coming') entry.notComing += 1;
      else entry.pending += 1;
    });

    let y = 280;
    doc.fillColor('#0B1F33').fontSize(11).font('Helvetica-Bold').text('Team breakdown by incharge', 42, y);
    y += 18;

    const bCols = [42, 262, 342, 422, 502];
    const bWidths = [220, 80, 80, 80, 52];
    const bHeaders = ['Incharge', 'Coming', 'Not coming', 'Pending', 'Total'];
    doc.rect(42, y, 512, 20).fill('#0B1F33');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    bHeaders.forEach((h, i) => doc.text(h, bCols[i] + 4, y + 6, { width: bWidths[i] - 8 }));
    y += 20;

    [...byIncharge.entries()].forEach(([name, counts], index) => {
      const bg = index % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(42, y, 512, 18).fill(bg);
      const total = counts.coming + counts.notComing + counts.pending;
      const values = [name, String(counts.coming), String(counts.notComing), String(counts.pending), String(total)];
      const colors = ['#0F172A', '#15803D', '#B91C1C', '#B45309', '#0B1F33'];
      doc.font('Helvetica').fontSize(8);
      values.forEach((val, i) => {
        doc.fillColor(colors[i]).text(val, bCols[i] + 4, y + 5, { width: bWidths[i] - 8, ellipsis: true });
      });
      y += 18;
    });

    // --- Needs follow-up: only the actionable subset, not everyone ---
    y += 20;
    const followUp = roster.filter((m) => m.status !== 'coming');
    doc.fillColor('#0B1F33').fontSize(11).font('Helvetica-Bold').text(
      `Needs follow-up (${followUp.length})`,
      42,
      y
    );
    y += 18;

    if (followUp.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#334155').text('Everyone on this shift has confirmed they are coming.', 42, y);
    } else {
      followUp.forEach((member) => {
        if (y > 740) {
          doc.addPage();
          y = 48;
        }
        const statusColor = member.status === 'not_coming' ? '#B91C1C' : '#B45309';
        const statusBg = member.status === 'not_coming' ? '#FEE2E2' : '#FEF3C7';

        doc.roundedRect(42, y, 512, 30, 4).fill('#F8FAFC');
        doc.fillColor('#0B1F33').font('Helvetica-Bold').fontSize(9.5).text(member.name, 52, y + 5, { width: 200 });
        doc.font('Helvetica').fontSize(8).fillColor('#64748B').text(
          `${member.employeeId}  ·  ${member.phone || 'no phone'}  ·  ${member.incharge?.name || 'Unassigned'}`,
          52,
          y + 17,
          { width: 280 }
        );
        if (member.equipment || member.process) {
          doc.fillColor('#94A3B8').fontSize(7.5).text(
            [member.equipment, member.process].filter(Boolean).join(' · '),
            340,
            y + 6,
            { width: 130 }
          );
        }
        doc.roundedRect(470, y + 8, 74, 15, 7).fill(statusBg);
        doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(7.5).text(statusLabel(member.status), 470, y + 12, {
          width: 74,
          align: 'center',
        });
        y += 36;
      });
    }
    // Pin doc.y to where we're about to draw before calling .text() — PDFKit's
    // own page-break check uses its internal cursor, not just the x/y we pass,
    // so leaving it stale (from the last explicitly-positioned box above) can
    // trigger a spurious blank extra page even though this clearly still fits.
    const footerY = Math.min(y + 30, doc.page.height - 36);
    doc.y = footerY;
    doc.fontSize(8).fillColor('#94A3B8').text(
      'Confidential · For internal HR and operations use only · FlexiTrack',
      42,
      footerY,
      { width: 512, align: 'center' }
    );

    doc.end();
  });
}

module.exports = { buildPollExcelBuffer, buildPollPdfBuffer, buildRangeExcelBuffer, buildDailyShiftsWorkbook };
