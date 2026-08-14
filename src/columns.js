// הגדרת מבנה הגליונות בקובץ האקסל - משותף בין שכבת האחסון לשאר הקוד

const CHANNELS_SHEET = 'אפיקים';
const DEPOSITS_SHEET = 'הפקדות';
const BALANCES_SHEET = 'יתרות חודשיות';
const SETTINGS_SHEET = 'הגדרות';

const CHANNEL_COLUMNS = [
  { key: 'id', header: 'מזהה' },
  { key: 'name', header: 'שם האפיק' },
  { key: 'type', header: 'סוג' },
  { key: 'feeDepositPct', header: 'דמי ניהול מהפקדה (%)' },
  { key: 'feeAccumPct', header: 'דמי ניהול מצבירה (%)' },
  { key: 'taxable', header: 'חייב במס רווחי הון' },
  { key: 'active', header: 'פעיל' },
  { key: 'notes', header: 'הערות' },
];

const DEPOSIT_COLUMNS = [
  { key: 'id', header: 'מזהה' },
  { key: 'channelId', header: 'מזהה אפיק' },
  { key: 'date', header: 'תאריך' },
  { key: 'amount', header: 'סכום' },
  { key: 'notes', header: 'הערות' },
];

const BALANCE_COLUMNS = [
  { key: 'id', header: 'מזהה' },
  { key: 'channelId', header: 'מזהה אפיק' },
  { key: 'month', header: 'חודש (YYYY-MM)' },
  { key: 'balance', header: 'יתרה' },
  { key: 'updatedAt', header: 'עודכן בתאריך' },
];

const SETTINGS_COLUMNS = [
  { key: 'key', header: 'מפתח' },
  { key: 'value', header: 'ערך' },
];

const CHANNEL_TYPES = ['קופת גמל', 'פנסיה', 'השקעה ישירה', 'אחר'];

module.exports = {
  CHANNELS_SHEET,
  DEPOSITS_SHEET,
  BALANCES_SHEET,
  SETTINGS_SHEET,
  CHANNEL_COLUMNS,
  DEPOSIT_COLUMNS,
  BALANCE_COLUMNS,
  SETTINGS_COLUMNS,
  CHANNEL_TYPES,
};
