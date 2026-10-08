// Optional: saves each WorldMirror session log as a row in a Google Sheet.
// 1. Create a Google Sheet. Extensions > Apps Script. Paste this file in.
// 2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
// 3. Copy the web app URL into Vercel as LOG_WEBHOOK_URL.
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["received_at", "session_id", "participant_id", "event", "initial_statement", "current_statement", "full_log_json"]);
  }
  const log = JSON.parse(e.postData.contents);
  sheet.appendRow([log.received_at, log.session_id, log.participant_id, log.event, log.initial_statement, log.current_statement, JSON.stringify(log)]);
  return ContentService.createTextOutput("ok");
}
