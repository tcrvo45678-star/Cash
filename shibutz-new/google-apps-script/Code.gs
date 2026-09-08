// Google Apps Script backend for the shibutz backup feature.
// See README.md in this folder for deployment instructions.
//
// The site (a static GitHub Pages page with no server of its own) sends
// a full snapshot here every time someone saves a change, a few seconds
// after the last edit. Each backup completely replaces the contents of
// the 4 tabs below - it's a mirror of "what the app currently holds",
// not an append-only log, so there's nothing to deduplicate.

var SHEET_NAMES = {
  trainees: 'חניכים',
  leaders: 'אנשי צוות',
  farmers: 'חקלאים',
  taskLog: 'היסטוריית שיבוצים'
};

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_NAMES).forEach(function (key) {
    var rows = payload[key];
    if (!rows) return;
    var sheet = ss.getSheetByName(SHEET_NAMES[key]) || ss.insertSheet(SHEET_NAMES[key]);
    sheet.clearContents();
    if (rows.length) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    }
  });
  return ContentService.createTextOutput('ok');
}

function doGet(e) {
  if (e.parameter && e.parameter.test) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('shibutz backup endpoint is running');
}
