const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  CHANNELS_SHEET,
  DEPOSITS_SHEET,
  BALANCES_SHEET,
  SETTINGS_SHEET,
  CHANNEL_COLUMNS,
  DEPOSIT_COLUMNS,
  BALANCE_COLUMNS,
  SETTINGS_COLUMNS,
} = require('./columns');

const FILE_PATH = path.join(__dirname, '..', 'data', 'finance.xlsx');

function boolToHe(v) {
  return v ? 'כן' : 'לא';
}
function heToBool(v) {
  return v === 'כן' || v === true;
}

function addSheet(workbook, sheetName, columns) {
  const ws = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  ws.getRow(1).font = { bold: true };
  return ws;
}

function readSheet(workbook, sheetName, columns) {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const obj = {};
    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      obj[col.key] = cell.value === null || cell.value === undefined ? '' : cell.value;
    });
    if (obj.id === '' || obj.id === undefined || obj.id === null) return; // skip blank rows
    rows.push(obj);
  });
  return rows;
}

function writeSheet(workbook, sheetName, columns, objects) {
  let ws = workbook.getWorksheet(sheetName);
  if (ws) workbook.removeWorksheet(ws.id);
  ws = addSheet(workbook, sheetName, columns);
  objects.forEach((obj) => {
    const row = {};
    columns.forEach((col) => {
      row[col.key] = obj[col.key];
    });
    ws.addRow(row);
  });
  return ws;
}

function nextId(objects) {
  return objects.reduce((max, o) => Math.max(max, Number(o.id) || 0), 0) + 1;
}

function defaultChannels() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { id: 1, name: 'קופת גמל - כלל', type: 'קופת גמל', feeDepositPct: 0, feeAccumPct: 0.5, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 2, name: 'קופת גמל - אלטשולר שחם', type: 'קופת גמל', feeDepositPct: 0, feeAccumPct: 0.5, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 3, name: 'השקעה ישירה - אקסלנס', type: 'השקעה ישירה', feeDepositPct: 0, feeAccumPct: 0, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 4, name: 'פנסיה', type: 'פנסיה', feeDepositPct: 0, feeAccumPct: 0, taxable: boolToHe(true), active: boolToHe(true), notes: 'למלא כאשר תיפתח קרן פנסיה' },
  ];
}

async function createNewWorkbook() {
  const workbook = new ExcelJS.Workbook();
  writeSheet(workbook, CHANNELS_SHEET, CHANNEL_COLUMNS, defaultChannels());
  writeSheet(workbook, DEPOSITS_SHEET, DEPOSIT_COLUMNS, []);
  writeSheet(workbook, BALANCES_SHEET, BALANCE_COLUMNS, []);
  writeSheet(workbook, SETTINGS_SHEET, SETTINGS_COLUMNS, [{ key: 'taxRate', value: 25 }]);
  await workbook.xlsx.writeFile(FILE_PATH);
}

async function ensureFile() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) {
    await createNewWorkbook();
  }
}

async function withWorkbook(fn) {
  await ensureFile();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const result = await fn(workbook);
  await workbook.xlsx.writeFile(FILE_PATH);
  return result;
}

module.exports = {
  FILE_PATH,
  boolToHe,
  heToBool,
  readSheet,
  writeSheet,
  nextId,
  withWorkbook,
  ensureFile,
};
