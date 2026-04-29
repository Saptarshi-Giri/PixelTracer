/**
 * ============================================================
 *  EMAIL ANALYTICS ENGINE WITH TRACKING PIXEL
 *  Google Apps Script — Production Ready
 *  Author: Senior GAS Developer
 *  Version: 1.0.0
 * ============================================================
 *
 *  SHEET STRUCTURE:
 *  ─────────────────────────────────────────────────────────
 *  Sheet "Users"  → id | name | email | status
 *  Sheet "Logs"   → id | email | timestamp | userAgent | ip
 *  ─────────────────────────────────────────────────────────
 *
 *  DEPLOYMENT:
 *  1. Open Apps Script (script.google.com or Extensions → Apps Script)
 *  2. Paste this entire file as Code.gs
 *  3. Run initializeSheets() once to create sheet structure
 *  4. Deploy → New Deployment → Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. Copy the Web App URL → paste into CONFIG.WEB_APP_URL below
 *  6. Run sendBulkEmails() to start the campaign
 * ============================================================
 */


// ============================================================
//  CONFIGURATION  — Edit these values before deploying
// ============================================================

const CONFIG = {
  // Paste your deployed Web App URL here after first deployment
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbwncAJjkg615ddnJ1oXMt8RsE78GsAOYeVGED6_nm7nNSMI1ZSiaANhwWdmboHLkDFpKg/exec",

  // Sheet names
  SHEET_USERS: "Users",
  SHEET_LOGS: "Logs",

  // Email campaign settings
  EMAIL_SUBJECT: "A Special Message For You 🎉",
  EMAIL_FROM_NAME: "Your Company Name",
  CUSTOM_MESSAGE: "We have exciting news to share with you. Thank you for being part of our community!",

  // Batch size per execution (stay under Gmail's daily quota)
  BATCH_SIZE: 50,

  // PropertiesService key for resumable sending
  RESUME_KEY: "LAST_SENT_INDEX",

  // Status flags
  STATUS_PENDING: "PENDING",
  STATUS_SENT: "SENT",
  STATUS_FAILED: "FAILED",

  // Column indices (1-based) for Users sheet
  USERS_COL: {
    ID: 1,
    NAME: 2,
    EMAIL: 3,
    STATUS: 4,
  },

  // Column indices (1-based) for Logs sheet
  LOGS_COL: {
    ID: 1,
    EMAIL: 2,
    TIMESTAMP: 3,
    USER_AGENT: 4,
    IP: 5,
  },
};


// ============================================================
//  SHEET INITIALIZATION
// ============================================================

/**
 * Creates and configures the "Users" and "Logs" sheets.
 * Run this ONCE before anything else.
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  _ensureSheet(ss, CONFIG.SHEET_USERS, [
    "id", "name", "email", "status"
  ]);

  _ensureSheet(ss, CONFIG.SHEET_LOGS, [
    "id", "email", "timestamp", "userAgent", "ip"
  ]);

  Logger.log("✅ Sheets initialized successfully.");
}

/**
 * Helper: creates a sheet with headers if it doesn't exist.
 * If it already exists, skips creation.
 * @param {Spreadsheet} ss
 * @param {string} name - Sheet name
 * @param {string[]} headers - Column header labels
 */
function _ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#4A90D9")
      .setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    Logger.log(`✅ Created sheet: ${name}`);
  } else {
    Logger.log(`ℹ️ Sheet already exists: ${name}`);
  }
}


// ============================================================
//  USER MANAGEMENT
// ============================================================

/**
 * Returns all users from the Users sheet as an array of objects.
 * Skips the header row automatically.
 * @returns {Object[]} Array of user objects
 */
function getAllUsers() {
  const sheet = _getSheet(CONFIG.SHEET_USERS);
  const data = sheet.getDataRange().getValues();

  // Remove header row
  const [_header, ...rows] = data;

  return rows.map(row => ({
    id: row[CONFIG.USERS_COL.ID - 1],
    name: row[CONFIG.USERS_COL.NAME - 1],
    email: row[CONFIG.USERS_COL.EMAIL - 1],
    status: row[CONFIG.USERS_COL.STATUS - 1],
    rowIndex: rows.indexOf(row) + 2, // 1-based, accounting for header
  }));
}

/**
 * Updates the status of a user in the Users sheet.
 * @param {number} rowIndex - 1-based row index in the sheet
 * @param {string} status - New status value
 */
function updateUserStatus(rowIndex, status) {
  const sheet = _getSheet(CONFIG.SHEET_USERS);
  sheet.getRange(rowIndex, CONFIG.USERS_COL.STATUS).setValue(status);
}


// ============================================================
//  EMAIL SENDING — BULK + RESUMABLE
// ============================================================

/**
 * Main entry point: sends emails to all PENDING users in batches.
 * Uses PropertiesService to resume from last position across executions.
 * Automatically marks each user as SENT or FAILED.
 */
function sendBulkEmails() {
  const users = getAllUsers();
  const props = PropertiesService.getScriptProperties();

  // Retrieve last processed index (default: 0)
  let startIndex = parseInt(props.getProperty(CONFIG.RESUME_KEY) || "0", 10);
  let sentCount = 0;
  let failCount = 0;

  Logger.log(`📧 Starting bulk send from index ${startIndex} of ${users.length} users.`);

  for (let i = startIndex; i < users.length; i++) {
    const user = users[i];

    // Skip already processed users
    if (user.status === CONFIG.STATUS_SENT) {
      Logger.log(`⏭️ Skipping already-sent user: ${user.email}`);
      continue;
    }

    // Stop if batch limit reached; save progress
    if (sentCount >= CONFIG.BATCH_SIZE) {
      Logger.log(`⏸️ Batch limit (${CONFIG.BATCH_SIZE}) reached. Saving progress at index ${i}.`);
      props.setProperty(CONFIG.RESUME_KEY, i.toString());
      return;
    }

    try {
      _sendTrackedEmail(user);
      updateUserStatus(user.rowIndex, CONFIG.STATUS_SENT);
      sentCount++;
      Logger.log(`✅ Email sent to: ${user.email}`);
    } catch (err) {
      updateUserStatus(user.rowIndex, CONFIG.STATUS_FAILED);
      failCount++;
      Logger.log(`❌ Failed to send to ${user.email}: ${err.message}`);
    }

    // Throttle: brief pause between sends to avoid rate limits
    Utilities.sleep(300);
  }

  // All users processed — clear resume pointer
  props.deleteProperty(CONFIG.RESUME_KEY);
  Logger.log(`🏁 Bulk send complete. Sent: ${sentCount}, Failed: ${failCount}`);
}

/**
 * Resets the resume pointer so the next run starts from the beginning.
 * Use this to restart a campaign.
 */
function resetResumePointer() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.RESUME_KEY);
  Logger.log("🔄 Resume pointer cleared. Next run will start from index 0.");
}

/**
 * Sends a single tracked HTML email to a user.
 * @param {Object} user - User object with id, name, email
 */
function _sendTrackedEmail(user) {
  const pixelUrl = `${CONFIG.WEB_APP_URL}?email=${encodeURIComponent(user.email)}&id=${encodeURIComponent(user.id)}`;

  const htmlBody = _buildEmailHtml(user.name, CONFIG.CUSTOM_MESSAGE, pixelUrl);
  const plainBody = `Hello ${user.name},\n\n${CONFIG.CUSTOM_MESSAGE}\n\nBest regards,\n${CONFIG.EMAIL_FROM_NAME}`;

  GmailApp.sendEmail(user.email, CONFIG.EMAIL_SUBJECT, plainBody, {
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_FROM_NAME,
    noReply: false,
  });
}

/**
 * Builds the HTML email body with embedded tracking pixel.
 * @param {string} name - Recipient's name
 * @param {string} message - Custom message body
 * @param {string} pixelUrl - Fully qualified tracking pixel URL
 * @returns {string} HTML string
 */
function _buildEmailHtml(name, message, pixelUrl) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.EMAIL_SUBJECT}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 8px;
                 overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #4A90D9; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { padding: 32px; color: #333333; line-height: 1.6; }
    .body p { margin: 0 0 16px; }
    .footer { padding: 16px 32px; background: #f4f4f4; font-size: 12px; color: #999999;
              text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${CONFIG.EMAIL_FROM_NAME}</h1>
    </div>
    <div class="body">
      <p>Hello <strong>${name}</strong>,</p>
      <p>${message}</p>
      <p>Best regards,<br><strong>${CONFIG.EMAIL_FROM_NAME}</strong></p>
    </div>
    <div class="footer">
      You are receiving this email because you are part of our community.
    </div>
  </div>

  <!-- Tracking Pixel: 1x1 transparent image, hidden from user -->
  <img src="${pixelUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" alt="" />
</body>
</html>`;
}


// ============================================================
//  TRACKING PIXEL HANDLER — doGet(e)
// ============================================================

/**
 * Web App entry point. Called when the tracking pixel URL is loaded.
 * Logs the open event and returns a 1x1 transparent GIF.
 *
 * URL format: ?email=user@example.com&id=123
 *
 * @param {Object} e - Event object from the GET request
 * @returns {ContentService.TextOutput} 1x1 transparent pixel
 */
function doGet(e) {
  try {
    const params = e.parameter || {};
    const email = params.email || "";
    const id = params.id || "";
    const userAgent = e.parameter["user-agent"] || ""; // May not be available in all clients
    const ip = ""; // GAS does not expose client IP for privacy reasons

    if (email) {
      _logOpen(id, email, userAgent, ip);
    }
  } catch (err) {
    Logger.log("⚠️ doGet error: " + err.message);
  }

  // Return a 1×1 transparent GIF as base64-decoded binary
  return _transparentPixelResponse();
}

/**
 * Logs an email open event to the Logs sheet.
 * @param {string} id - User ID from tracking URL
 * @param {string} email - User email from tracking URL
 * @param {string} userAgent - Browser/client user agent string
 * @param {string} ip - Client IP address (if available)
 */
function _logOpen(id, email, userAgent, ip) {
  const sheet = _getSheet(CONFIG.SHEET_LOGS);
  const timestamp = new Date();

  sheet.appendRow([
    id,
    email,
    timestamp,
    userAgent || "N/A",
    ip || "N/A",
  ]);
}

/**
 * Returns a minimal 1×1 transparent GIF response.
 * Base64 of a standard 1x1 pixel transparent GIF.
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function _transparentPixelResponse() {
  // 1x1 transparent GIF (base64 decoded to bytes)
  const GIF_BASE64 =
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const decoded = Utilities.base64Decode(GIF_BASE64);
  const blob = Utilities.newBlob(decoded, "image/gif", "pixel.gif");

  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);

  // NOTE: GAS ContentService doesn't support binary output natively.
  // For clients that require binary GIF, use HtmlService as a workaround:
  // return HtmlService.createHtmlOutput('<img src="data:image/gif;base64,' + GIF_BASE64 + '" />');
}

/**
 * Alternative doGet response using HtmlService to serve
 * an embedded base64 pixel — better for strict email clients.
 * Swap this with _transparentPixelResponse() if needed.
 */
function _htmlPixelResponse() {
  const GIF_BASE64 =
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const html = `<html><head><meta http-equiv="Cache-Control" content="no-cache"/></head>` +
    `<body><img src="data:image/gif;base64,${GIF_BASE64}" width="1" height="1" /></body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(
    HtmlService.XFrameOptionsMode.ALLOWALL
  );
}


// ============================================================
//  ANALYTICS FUNCTIONS
// ============================================================

/**
 * Returns a full analytics summary object:
 *   - totalEmailsSent
 *   - totalOpens
 *   - openRate (%)
 *   - opensByHour (array of { hour, count })
 *   - opensByDay (array of { date, count })
 *   - uniqueOpeners (count of unique emails)
 */
function getAnalytics() {
  const users = getAllUsers();
  const logs = _getAllLogs();

  const totalEmailsSent = users.filter(u => u.status === CONFIG.STATUS_SENT).length;
  const totalOpens = logs.length;
  const openRate = totalEmailsSent > 0
    ? ((totalOpens / totalEmailsSent) * 100).toFixed(2)
    : "0.00";

  // Unique openers (by email)
  const uniqueEmails = new Set(logs.map(l => l.email));
  const uniqueOpeners = uniqueEmails.size;

  // Group by hour of day
  const hourMap = {};
  logs.forEach(log => {
    const hour = new Date(log.timestamp).getHours();
    hourMap[hour] = (hourMap[hour] || 0) + 1;
  });
  const opensByHour = Object.entries(hourMap)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
    .sort((a, b) => a.hour - b.hour);

  // Group by calendar date
  const dayMap = {};
  logs.forEach(log => {
    const date = Utilities.formatDate(
      new Date(log.timestamp),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
    dayMap[date] = (dayMap[date] || 0) + 1;
  });
  const opensByDay = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const report = {
    totalEmailsSent,
    totalOpens,
    openRate: `${openRate}%`,
    uniqueOpeners,
    opensByHour,
    opensByDay,
  };

  Logger.log("📊 Analytics Report:\n" + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Logs the analytics report to the console.
 * Useful for manual runs from the Apps Script editor.
 */
function printAnalytics() {
  const report = getAnalytics();
  Logger.log("=== EMAIL ANALYTICS REPORT ===");
  Logger.log(`Total Sent:       ${report.totalEmailsSent}`);
  Logger.log(`Total Opens:      ${report.totalOpens}`);
  Logger.log(`Open Rate:        ${report.openRate}`);
  Logger.log(`Unique Openers:   ${report.uniqueOpeners}`);
  Logger.log("Opens by Hour:    " + JSON.stringify(report.opensByHour));
  Logger.log("Opens by Day:     " + JSON.stringify(report.opensByDay));
}

/**
 * Returns all log entries from the Logs sheet as an array of objects.
 * @returns {Object[]}
 */
function _getAllLogs() {
  const sheet = _getSheet(CONFIG.SHEET_LOGS);
  const data = sheet.getDataRange().getValues();
  const [_header, ...rows] = data;

  return rows.map(row => ({
    id: row[CONFIG.LOGS_COL.ID - 1],
    email: row[CONFIG.LOGS_COL.EMAIL - 1],
    timestamp: row[CONFIG.LOGS_COL.TIMESTAMP - 1],
    userAgent: row[CONFIG.LOGS_COL.USER_AGENT - 1],
    ip: row[CONFIG.LOGS_COL.IP - 1],
  }));
}


// ============================================================
//  TIME-BASED TRIGGER SETUP (for automatic resume)
// ============================================================

/**
 * Creates a time-based trigger to run sendBulkEmails() every 5 minutes.
 * This allows automatic resumption across the 6-minute Apps Script limit.
 *
 * Run this ONCE to enable automatic batch processing.
 */
function createBatchTrigger() {
  // Delete any existing trigger to avoid duplicates
  deleteBatchTrigger();

  ScriptApp.newTrigger("sendBulkEmails")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("⏰ Batch trigger created: sendBulkEmails() will run every 5 minutes.");
}

/**
 * Removes all triggers for sendBulkEmails().
 * Call this after the campaign completes to stop the trigger.
 */
function deleteBatchTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "sendBulkEmails") {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("🗑️ Deleted existing sendBulkEmails trigger.");
    }
  });
}


// ============================================================
//  UTILITY HELPERS
// ============================================================

/**
 * Returns a named sheet, throwing a clear error if not found.
 * @param {string} name - Sheet name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function _getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found. Run initializeSheets() first.`);
  }
  return sheet;
}

/**
 * Generates a simple unique ID string (timestamp + random).
 * Useful for seeding test data.
 * @returns {string}
 */
function _generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}


// ============================================================
//  SAMPLE DATA SEEDER (for testing)
// ============================================================

/**
 * Adds sample users to the Users sheet for testing.
 * Run this once to populate test data.
 */
function seedSampleUsers() {
  const sheet = _getSheet(CONFIG.SHEET_USERS);

  const sampleUsers = [
    ["U001", "Alice Johnson",  "alice@example.com",  CONFIG.STATUS_PENDING],
    ["U002", "Bob Smith",      "bob@example.com",    CONFIG.STATUS_PENDING],
    ["U003", "Carol Williams", "carol@example.com",  CONFIG.STATUS_PENDING],
    ["U004", "David Brown",    "david@example.com",  CONFIG.STATUS_PENDING],
    ["U005", "Eve Davis",      "eve@example.com",    CONFIG.STATUS_PENDING],
  ];

  sampleUsers.forEach(row => sheet.appendRow(row));
  Logger.log(`✅ Seeded ${sampleUsers.length} sample users.`);
}


/*
 * ============================================================
 *  DEPLOYMENT INSTRUCTIONS
 * ============================================================
 *
 *  STEP 1 — Setup
 *  ──────────────
 *  1. Open Google Sheets → Extensions → Apps Script
 *  2. Delete any existing code and paste this entire file
 *  3. Save (Ctrl+S / Cmd+S)
 *
 *  STEP 2 — Initialize Sheets
 *  ──────────────────────────
 *  1. Select function: initializeSheets
 *  2. Click ▶ Run
 *  3. Grant permissions when prompted
 *  4. (Optional) Run seedSampleUsers() to add test data
 *
 *  STEP 3 — Deploy as Web App
 *  ──────────────────────────
 *  1. Click Deploy → New Deployment
 *  2. Select type: Web App
 *  3. Configure:
 *       Description:      Email Tracker v1
 *       Execute as:       Me (your account)
 *       Who has access:   Anyone
 *  4. Click Deploy → Copy the Web App URL
 *
 *  STEP 4 — Configure Web App URL
 *  ───────────────────────────────
 *  1. Paste the copied URL into CONFIG.WEB_APP_URL at the top
 *  2. Save the script
 *  3. Re-deploy: Deploy → Manage Deployments → Edit → Deploy
 *
 *  STEP 5 — Run Campaign
 *  ──────────────────────
 *  OPTION A — Manual single run:
 *    Select sendBulkEmails → Click ▶ Run
 *
 *  OPTION B — Automatic batching (recommended for large lists):
 *    Select createBatchTrigger → Click ▶ Run
 *    This auto-runs every 5 minutes until all users are processed.
 *    When done, run deleteBatchTrigger() to stop the automation.
 *
 *  STEP 6 — View Analytics
 *  ────────────────────────
 *  Select printAnalytics → Click ▶ Run
 *  Check the Logs panel for the full report.
 *
 *  ============================================================
 *  PERMISSIONS REQUIRED (granted during first run):
 *  - Google Sheets (read/write)
 *  - Gmail (send emails on your behalf)
 *  - Script Properties (store resume state)
 *  - Script Triggers (for auto-batching)
 *  ============================================================
 *
 *  QUOTA LIMITS (Gmail):
 *  - Free accounts:    100 emails/day
 *  - Workspace:      1,500 emails/day
 *  - Adjust BATCH_SIZE accordingly
 *  ============================================================
 */
