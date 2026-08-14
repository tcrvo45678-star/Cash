const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
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
const { boolToHe } = require('./utils');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

function configError() {
  const missing = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!process.env.GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
  if (!process.env.GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (!missing.length) return null;
  return `חסרים משתני סביבה להתחברות לגוגל שיטס: ${missing.join(', ')}. ראה README.md לפרטים.`;
}

let docPromise = null;
async function getDoc() {
  const err = configError();
  if (err) throw new Error(err);
  if (!docPromise) {
    docPromise = (async () => {
      const auth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scopes: SCOPES,
      });
      const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
      await doc.loadInfo();
      await ensureSheets(doc);
      return doc;
    })().catch((e) => {
      docPromise = null; // allow retry on next request instead of caching a failure forever
      throw e;
    });
  }
  return docPromise;
}

function defaultChannelRows() {
  return [
    { id: 1, name: 'קופת גמל - כלל', type: 'קופת גמל', feeDepositPct: 0, feeAccumPct: 0.5, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 2, name: 'קופת גמל - אלטשולר שחם', type: 'קופת גמל', feeDepositPct: 0, feeAccumPct: 0.5, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 3, name: 'השקעה ישירה - אקסלנס', type: 'השקעה ישירה', feeDepositPct: 0, feeAccumPct: 0, taxable: boolToHe(true), active: boolToHe(true), notes: '' },
    { id: 4, name: 'פנסיה', type: 'פנסיה', feeDepositPct: 0, feeAccumPct: 0, taxable: boolToHe(true), active: boolToHe(true), notes: 'למלא כאשר תיפתח קרן פנסיה' },
  ];
}

async function ensureSheets(doc) {
  if (!doc.sheetsByTitle[CHANNELS_SHEET]) {
    const sheet = await doc.addSheet({ title: CHANNELS_SHEET, headerValues: CHANNEL_COLUMNS.map((c) => c.header) });
    await sheet.addRows(defaultChannelRows().map((row) => toRowValues(row, CHANNEL_COLUMNS)));
  }
  if (!doc.sheetsByTitle[DEPOSITS_SHEET]) {
    await doc.addSheet({ title: DEPOSITS_SHEET, headerValues: DEPOSIT_COLUMNS.map((c) => c.header) });
  }
  if (!doc.sheetsByTitle[BALANCES_SHEET]) {
    await doc.addSheet({ title: BALANCES_SHEET, headerValues: BALANCE_COLUMNS.map((c) => c.header) });
  }
  if (!doc.sheetsByTitle[SETTINGS_SHEET]) {
    const sheet = await doc.addSheet({ title: SETTINGS_SHEET, headerValues: SETTINGS_COLUMNS.map((c) => c.header) });
    await sheet.addRow(toRowValues({ key: 'taxRate', value: 25 }, SETTINGS_COLUMNS));
  }
}

function toRowValues(obj, columns) {
  const row = {};
  columns.forEach((col) => {
    row[col.header] = obj[col.key];
  });
  return row;
}

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col) => {
    const v = row.get(col.header);
    obj[col.key] = v === undefined || v === null ? '' : v;
  });
  return obj;
}

function nextId(objects) {
  return objects.reduce((max, o) => Math.max(max, Number(o.id) || 0), 0) + 1;
}

async function getSheetRows(sheetName, columns) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[sheetName];
  const rows = await sheet.getRows();
  return rows
    .map((row) => ({ row, obj: rowToObject(row, columns) }))
    .filter((r) => r.obj.id !== '' && r.obj.id !== undefined && r.obj.id !== null);
}

// ---------- אפיקים ----------
async function getChannels() {
  const rows = await getSheetRows(CHANNELS_SHEET, CHANNEL_COLUMNS);
  return rows.map((r) => r.obj);
}

async function addChannel(data) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[CHANNELS_SHEET];
  const existing = await getChannels();
  const newChannel = {
    id: nextId(existing),
    name: String(data.name).trim(),
    type: data.type || 'אחר',
    feeDepositPct: Number(data.feeDepositPct) || 0,
    feeAccumPct: Number(data.feeAccumPct) || 0,
    taxable: boolToHe(data.taxable !== false),
    active: boolToHe(true),
    notes: data.notes || '',
  };
  await sheet.addRow(toRowValues(newChannel, CHANNEL_COLUMNS));
  return newChannel;
}

async function updateChannel(id, data) {
  const rows = await getSheetRows(CHANNELS_SHEET, CHANNEL_COLUMNS);
  const found = rows.find((r) => Number(r.obj.id) === Number(id));
  if (!found) return null;
  const c = found.obj;
  if (data.name !== undefined) c.name = String(data.name).trim();
  if (data.type !== undefined) c.type = data.type;
  if (data.feeDepositPct !== undefined) c.feeDepositPct = Number(data.feeDepositPct) || 0;
  if (data.feeAccumPct !== undefined) c.feeAccumPct = Number(data.feeAccumPct) || 0;
  if (data.taxable !== undefined) c.taxable = boolToHe(data.taxable);
  if (data.active !== undefined) c.active = boolToHe(data.active);
  if (data.notes !== undefined) c.notes = data.notes;
  found.row.assign(toRowValues(c, CHANNEL_COLUMNS));
  await found.row.save();
  return c;
}

async function deactivateChannel(id) {
  return updateChannel(id, { active: false });
}

// ---------- הפקדות ----------
async function getDeposits() {
  const rows = await getSheetRows(DEPOSITS_SHEET, DEPOSIT_COLUMNS);
  return rows.map((r) => r.obj);
}

async function addDeposit(data) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[DEPOSITS_SHEET];
  const existing = await getDeposits();
  const newDeposit = {
    id: nextId(existing),
    channelId: Number(data.channelId),
    date: String(data.date).slice(0, 10),
    amount: Number(data.amount),
    notes: data.notes || '',
  };
  await sheet.addRow(toRowValues(newDeposit, DEPOSIT_COLUMNS));
  return newDeposit;
}

async function deleteDeposit(id) {
  const rows = await getSheetRows(DEPOSITS_SHEET, DEPOSIT_COLUMNS);
  const found = rows.find((r) => Number(r.obj.id) === Number(id));
  if (!found) return false;
  await found.row.delete();
  return true;
}

// ---------- יתרות חודשיות ----------
async function getBalances() {
  const rows = await getSheetRows(BALANCES_SHEET, BALANCE_COLUMNS);
  return rows.map((r) => r.obj);
}

async function upsertBalancesBulk(month, entries) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[BALANCES_SHEET];
  const rows = await getSheetRows(BALANCES_SHEET, BALANCE_COLUMNS);
  const today = new Date().toISOString().slice(0, 10);
  const rowsToAdd = [];
  for (const { channelId, balance } of entries) {
    if (balance === '' || balance === null || balance === undefined) continue;
    const found = rows.find((r) => String(r.obj.channelId) === String(channelId) && String(r.obj.month) === String(month));
    if (found) {
      found.obj.balance = Number(balance);
      found.obj.updatedAt = today;
      found.row.assign(toRowValues(found.obj, BALANCE_COLUMNS));
      await found.row.save();
    } else {
      const newBalance = {
        id: nextId([...rows.map((r) => r.obj), ...rowsToAdd]),
        channelId: Number(channelId),
        month,
        balance: Number(balance),
        updatedAt: today,
      };
      rowsToAdd.push(newBalance);
    }
  }
  if (rowsToAdd.length) {
    await sheet.addRows(rowsToAdd.map((b) => toRowValues(b, BALANCE_COLUMNS)));
  }
  return getBalances();
}

async function deleteBalance(id) {
  const rows = await getSheetRows(BALANCES_SHEET, BALANCE_COLUMNS);
  const found = rows.find((r) => Number(r.obj.id) === Number(id));
  if (!found) return false;
  await found.row.delete();
  return true;
}

// ---------- הגדרות ----------
async function getSettings() {
  const rows = await getSheetRows(SETTINGS_SHEET, SETTINGS_COLUMNS);
  const map = {};
  rows.forEach((r) => {
    map[r.obj.key] = r.obj.value;
  });
  if (map.taxRate === undefined) map.taxRate = 25;
  return map;
}

async function updateSettings(data) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[SETTINGS_SHEET];
  const rows = await getSheetRows(SETTINGS_SHEET, SETTINGS_COLUMNS);
  for (const [key, value] of Object.entries(data)) {
    const found = rows.find((r) => r.obj.key === key);
    if (found) {
      found.row.assign(toRowValues({ key, value }, SETTINGS_COLUMNS));
      await found.row.save();
    } else {
      await sheet.addRow(toRowValues({ key, value }, SETTINGS_COLUMNS));
    }
  }
  return getSettings();
}

// ---------- ייצוא ----------
async function downloadXlsxBuffer() {
  const doc = await getDoc();
  const arrayBuffer = await doc.downloadAsXLSX();
  return Buffer.from(arrayBuffer);
}

async function getSheetUrl() {
  const doc = await getDoc();
  return `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit`;
}

module.exports = {
  getChannels,
  addChannel,
  updateChannel,
  deactivateChannel,
  getDeposits,
  addDeposit,
  deleteDeposit,
  getBalances,
  upsertBalancesBulk,
  deleteBalance,
  getSettings,
  updateSettings,
  downloadXlsxBuffer,
  getSheetUrl,
  configError,
};
