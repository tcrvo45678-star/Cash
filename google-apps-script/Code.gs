/**
 * Google Apps Script Web App - מקבל סנכרון מאתר "הון" (מעקב השקעות)
 * ומעדכן גיליון Google Sheets עם התמונה העדכנית של כל ההשקעות.
 *
 * האתר שולח את מלוא מצב ההשקעות בכל סנכרון (לא רק שינוי בודד), כך שהקוד
 * כאן מוחק ומחדש את הטבלה בכל קריאה - הגיליון תמיד משקף את המצב הנוכחי,
 * ולא הופך למאגר שורות שמצטבר עם כפילויות.
 */

const SHEET_NAME = "הון - סנכרון";
const HEADERS = ["השקעה", "סוג", "מוסד", "מטבע", "שווי", "הפקדות נטו", "רווח", "מס משוער", "נטו אחרי מס", "תשואה %", "עודכן"];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const rows = payload.rows || [];
    const sheet = getOrCreateSheet();

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

    if (rows.length) {
      const now = new Date();
      const withTimestamp = rows.map((r) => {
        const row = r.slice(0, HEADERS.length - 1);
        while (row.length < HEADERS.length - 1) row.push("");
        row.push(now);
        return row;
      });
      sheet.getRange(2, 1, withTimestamp.length, HEADERS.length).setValues(withTimestamp);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("✓ Web App פעיל ומוכן לקבל סנכרון מהאתר 'הון'.");
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}
