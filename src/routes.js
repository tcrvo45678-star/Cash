const express = require('express');
const {
  CHANNELS_SHEET,
  DEPOSITS_SHEET,
  BALANCES_SHEET,
  SETTINGS_SHEET,
  CHANNEL_COLUMNS,
  DEPOSIT_COLUMNS,
  BALANCE_COLUMNS,
  SETTINGS_COLUMNS,
  CHANNEL_TYPES,
} = require('./columns');
const { readSheet, writeSheet, nextId, withWorkbook, boolToHe, FILE_PATH } = require('./excelStore');
const { computeDashboard, computeCompleteness, monthsWithBalances } = require('./calc');

const router = express.Router();

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function getSettings(workbook) {
  const rows = readSheet(workbook, SETTINGS_SHEET, SETTINGS_COLUMNS);
  const map = {};
  rows.forEach((r) => {
    map[r.key] = r.value;
  });
  if (map.taxRate === undefined) map.taxRate = 25;
  return map;
}

// ---------- כללי: מטא-דאטה ----------
router.get('/meta', async (req, res) => {
  const data = await withWorkbook(async (wb) => {
    const settings = await getSettings(wb);
    return { channelTypes: CHANNEL_TYPES, taxRate: Number(settings.taxRate), currentMonth: currentMonth() };
  });
  res.json(data);
});

// ---------- הגדרות ----------
router.put('/settings', async (req, res) => {
  const { taxRate } = req.body;
  const data = await withWorkbook(async (wb) => {
    const settings = await getSettings(wb);
    if (taxRate !== undefined) settings.taxRate = Number(taxRate);
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
    writeSheet(wb, SETTINGS_SHEET, SETTINGS_COLUMNS, rows);
    return settings;
  });
  res.json(data);
});

// ---------- אפיקים (channels) ----------
router.get('/channels', async (req, res) => {
  const channels = await withWorkbook(async (wb) => readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS));
  res.json(channels);
});

router.post('/channels', async (req, res) => {
  const { name, type, feeDepositPct, feeAccumPct, taxable, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'שם האפיק הוא שדה חובה' });
  const channel = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const newChannel = {
      id: nextId(channels),
      name: String(name).trim(),
      type: type || 'אחר',
      feeDepositPct: Number(feeDepositPct) || 0,
      feeAccumPct: Number(feeAccumPct) || 0,
      taxable: boolToHe(taxable !== false),
      active: boolToHe(true),
      notes: notes || '',
    };
    channels.push(newChannel);
    writeSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS, channels);
    return newChannel;
  });
  res.status(201).json(channel);
});

router.put('/channels/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, type, feeDepositPct, feeAccumPct, taxable, active, notes } = req.body;
  const result = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const idx = channels.findIndex((c) => Number(c.id) === id);
    if (idx === -1) return null;
    const c = channels[idx];
    if (name !== undefined) c.name = String(name).trim();
    if (type !== undefined) c.type = type;
    if (feeDepositPct !== undefined) c.feeDepositPct = Number(feeDepositPct) || 0;
    if (feeAccumPct !== undefined) c.feeAccumPct = Number(feeAccumPct) || 0;
    if (taxable !== undefined) c.taxable = boolToHe(taxable);
    if (active !== undefined) c.active = boolToHe(active);
    if (notes !== undefined) c.notes = notes;
    channels[idx] = c;
    writeSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS, channels);
    return c;
  });
  if (!result) return res.status(404).json({ error: 'אפיק לא נמצא' });
  res.json(result);
});

router.delete('/channels/:id', async (req, res) => {
  const id = Number(req.params.id);
  const result = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const idx = channels.findIndex((c) => Number(c.id) === id);
    if (idx === -1) return null;
    channels[idx].active = boolToHe(false); // מחיקה רכה - כדי לשמר היסטוריה
    writeSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS, channels);
    return channels[idx];
  });
  if (!result) return res.status(404).json({ error: 'אפיק לא נמצא' });
  res.json({ ok: true });
});

// ---------- הפקדות (deposits) ----------
router.get('/deposits', async (req, res) => {
  const deposits = await withWorkbook(async (wb) => readSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS));
  deposits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.json(deposits);
});

router.post('/deposits', async (req, res) => {
  const { channelId, date, amount, notes } = req.body;
  if (!channelId || !date || !amount) {
    return res.status(400).json({ error: 'יש למלא אפיק, תאריך וסכום' });
  }
  const deposit = await withWorkbook(async (wb) => {
    const deposits = readSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS);
    const newDeposit = {
      id: nextId(deposits),
      channelId: Number(channelId),
      date: String(date).slice(0, 10),
      amount: Number(amount),
      notes: notes || '',
    };
    deposits.push(newDeposit);
    writeSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS, deposits);
    return newDeposit;
  });
  res.status(201).json(deposit);
});

router.delete('/deposits/:id', async (req, res) => {
  const id = Number(req.params.id);
  const found = await withWorkbook(async (wb) => {
    const deposits = readSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS);
    const filtered = deposits.filter((d) => Number(d.id) !== id);
    if (filtered.length === deposits.length) return false;
    writeSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS, filtered);
    return true;
  });
  if (!found) return res.status(404).json({ error: 'הפקדה לא נמצאה' });
  res.json({ ok: true });
});

// ---------- יתרות חודשיות (monthly balances) ----------
router.get('/balances', async (req, res) => {
  const balances = await withWorkbook(async (wb) => readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS));
  balances.sort((a, b) => String(b.month).localeCompare(String(a.month)));
  res.json(balances);
});

// עדכון/יצירה של יתרות לחודש נתון עבור כמה אפיקים בבת אחת
router.post('/balances/bulk', async (req, res) => {
  const { month, entries } = req.body; // entries: [{channelId, balance}]
  if (!month || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'יש לשלוח חודש ורשימת יתרות' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const result = await withWorkbook(async (wb) => {
    const balances = readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS);
    entries.forEach(({ channelId, balance }) => {
      if (balance === '' || balance === null || balance === undefined) return;
      const idx = balances.findIndex((b) => String(b.channelId) === String(channelId) && String(b.month) === String(month));
      if (idx !== -1) {
        balances[idx].balance = Number(balance);
        balances[idx].updatedAt = today;
      } else {
        balances.push({
          id: nextId(balances),
          channelId: Number(channelId),
          month,
          balance: Number(balance),
          updatedAt: today,
        });
      }
    });
    writeSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS, balances);
    return balances.filter((b) => String(b.month) === String(month));
  });
  res.json(result);
});

router.delete('/balances/:id', async (req, res) => {
  const id = Number(req.params.id);
  const found = await withWorkbook(async (wb) => {
    const balances = readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS);
    const filtered = balances.filter((b) => Number(b.id) !== id);
    if (filtered.length === balances.length) return false;
    writeSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS, filtered);
    return true;
  });
  if (!found) return res.status(404).json({ error: 'רשומת יתרה לא נמצאה' });
  res.json({ ok: true });
});

// ---------- לוח בקרה מחושב ----------
router.get('/dashboard', async (req, res) => {
  const month = req.query.month || currentMonth();
  const data = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const deposits = readSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS);
    const balances = readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS);
    const settings = await getSettings(wb);
    const dashboard = computeDashboard(channels, deposits, balances, month, settings.taxRate);
    const completeness = computeCompleteness(channels, balances, month);
    const months = monthsWithBalances(balances);
    return { ...dashboard, completeness, availableMonths: months };
  });
  res.json(data);
});

router.get('/completeness', async (req, res) => {
  const month = req.query.month || currentMonth();
  const data = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const balances = readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS);
    return computeCompleteness(channels, balances, month);
  });
  res.json(data);
});

// היסטוריה חודשית לכל אפיק - לצורך גרף
router.get('/history', async (req, res) => {
  const data = await withWorkbook(async (wb) => {
    const channels = readSheet(wb, CHANNELS_SHEET, CHANNEL_COLUMNS);
    const deposits = readSheet(wb, DEPOSITS_SHEET, DEPOSIT_COLUMNS);
    const balances = readSheet(wb, BALANCES_SHEET, BALANCE_COLUMNS);
    const settings = await getSettings(wb);
    const months = monthsWithBalances(balances);
    return months.map((month) => computeDashboard(channels, deposits, balances, month, settings.taxRate));
  });
  res.json(data);
});

// ---------- ייצוא הקובץ ----------
router.get('/export', async (req, res) => {
  await withWorkbook(async () => {}); // מוודא שהקובץ קיים
  res.download(FILE_PATH, 'הכספים-שלי.xlsx');
});

module.exports = router;
