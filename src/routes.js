const express = require('express');
const { CHANNEL_TYPES } = require('./columns');
const store = require('./sheetsStore');
const { computeDashboard, computeCompleteness, monthsWithBalances } = require('./calc');

const router = express.Router();

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// עוטף כל handler כדי להחזיר שגיאת תצורה ברורה אם גוגל שיטס לא מוגדר
function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || 'שגיאה לא צפויה' });
    }
  };
}

// ---------- כללי: מטא-דאטה ----------
router.get(
  '/meta',
  wrap(async (req, res) => {
    const configErr = store.configError();
    if (configErr) return res.status(503).json({ error: configErr, configured: false });
    const settings = await store.getSettings();
    const sheetUrl = await store.getSheetUrl();
    res.json({ channelTypes: CHANNEL_TYPES, taxRate: Number(settings.taxRate), currentMonth: currentMonth(), sheetUrl, configured: true });
  })
);

// ---------- הגדרות ----------
router.put(
  '/settings',
  wrap(async (req, res) => {
    const { taxRate } = req.body;
    const update = {};
    if (taxRate !== undefined) update.taxRate = Number(taxRate);
    const settings = await store.updateSettings(update);
    res.json(settings);
  })
);

// ---------- אפיקים ----------
router.get(
  '/channels',
  wrap(async (req, res) => {
    res.json(await store.getChannels());
  })
);

router.post(
  '/channels',
  wrap(async (req, res) => {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'שם האפיק הוא שדה חובה' });
    const channel = await store.addChannel(req.body);
    res.status(201).json(channel);
  })
);

router.put(
  '/channels/:id',
  wrap(async (req, res) => {
    const result = await store.updateChannel(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'אפיק לא נמצא' });
    res.json(result);
  })
);

router.delete(
  '/channels/:id',
  wrap(async (req, res) => {
    const result = await store.deactivateChannel(req.params.id);
    if (!result) return res.status(404).json({ error: 'אפיק לא נמצא' });
    res.json({ ok: true });
  })
);

// ---------- הפקדות ----------
router.get(
  '/deposits',
  wrap(async (req, res) => {
    const deposits = await store.getDeposits();
    deposits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(deposits);
  })
);

router.post(
  '/deposits',
  wrap(async (req, res) => {
    const { channelId, date, amount } = req.body;
    if (!channelId || !date || !amount) {
      return res.status(400).json({ error: 'יש למלא אפיק, תאריך וסכום' });
    }
    const deposit = await store.addDeposit(req.body);
    res.status(201).json(deposit);
  })
);

router.delete(
  '/deposits/:id',
  wrap(async (req, res) => {
    const found = await store.deleteDeposit(req.params.id);
    if (!found) return res.status(404).json({ error: 'הפקדה לא נמצאה' });
    res.json({ ok: true });
  })
);

// ---------- יתרות חודשיות ----------
router.get(
  '/balances',
  wrap(async (req, res) => {
    const balances = await store.getBalances();
    balances.sort((a, b) => String(b.month).localeCompare(String(a.month)));
    res.json(balances);
  })
);

router.post(
  '/balances/bulk',
  wrap(async (req, res) => {
    const { month, entries } = req.body;
    if (!month || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'יש לשלוח חודש ורשימת יתרות' });
    }
    const result = await store.upsertBalancesBulk(month, entries);
    res.json(result.filter((b) => String(b.month) === String(month)));
  })
);

router.delete(
  '/balances/:id',
  wrap(async (req, res) => {
    const found = await store.deleteBalance(req.params.id);
    if (!found) return res.status(404).json({ error: 'רשומת יתרה לא נמצאה' });
    res.json({ ok: true });
  })
);

// ---------- לוח בקרה מחושב ----------
router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const month = req.query.month || currentMonth();
    const [channels, deposits, balances, settings] = await Promise.all([
      store.getChannels(),
      store.getDeposits(),
      store.getBalances(),
      store.getSettings(),
    ]);
    const dashboard = computeDashboard(channels, deposits, balances, month, settings.taxRate);
    const completeness = computeCompleteness(channels, balances, month);
    const months = monthsWithBalances(balances);
    res.json({ ...dashboard, completeness, availableMonths: months });
  })
);

router.get(
  '/completeness',
  wrap(async (req, res) => {
    const month = req.query.month || currentMonth();
    const [channels, balances] = await Promise.all([store.getChannels(), store.getBalances()]);
    res.json(computeCompleteness(channels, balances, month));
  })
);

// היסטוריה חודשית לכל אפיק - לצורך גרף
router.get(
  '/history',
  wrap(async (req, res) => {
    const [channels, deposits, balances, settings] = await Promise.all([
      store.getChannels(),
      store.getDeposits(),
      store.getBalances(),
      store.getSettings(),
    ]);
    const months = monthsWithBalances(balances);
    res.json(months.map((month) => computeDashboard(channels, deposits, balances, month, settings.taxRate)));
  })
);

// ---------- ייצוא הקובץ ----------
router.get(
  '/export',
  wrap(async (req, res) => {
    const buffer = await store.downloadXlsxBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="הכספים-שלי.xlsx"');
    res.send(buffer);
  })
);

module.exports = router;
