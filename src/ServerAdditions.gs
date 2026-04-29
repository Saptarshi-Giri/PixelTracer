/**
 * ============================================================
 *  SERVER-SIDE ADDITIONS for Email Analytics Dashboard
 *  Add these functions to your existing Code.gs
 *  (or paste into a new file in the same project)
 * ============================================================
 */


// ============================================================
//  UPDATED doGet() — routes between dashboard and pixel
//
//  Routes:
//   /exec               → serves the dashboard HTML
//   /exec?pixel=1       → returns tracking pixel (used in emails)
//   /exec?email=x&id=y  → logs open + returns pixel (same as above)
// ============================================================

function doGet(e) {
  const params = e.parameter || {};

  // ── Tracking pixel route ──
  // Triggered when email client loads the hidden <img> tag
  if (params.email || params.pixel) {
    const email     = params.email     || "";
    const id        = params.id        || "";
    const userAgent = params.userAgent || "";

    if (email) {
      _logOpen(id, email, userAgent, "");
    }

    return _servePixel();
  }

  // ── Dashboard route (default) ──
  return _serveDashboard();
}


/**
 * Serves the dashboard HTML file.
 * Make sure "index.html" is uploaded to your Apps Script project.
 * @returns {HtmlOutput}
 */
function _serveDashboard() {
  return HtmlService
    .createHtmlOutputFromFile("index")   // reads index.html
    .setTitle("Email Analytics — Mission Control")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}


/**
 * Returns a minimal HTTP response with a 1×1 transparent GIF.
 * Used for tracking pixel requests from email clients.
 * @returns {TextOutput}
 */
function _servePixel() {
  // Minimal valid 1×1 transparent GIF (base64)
  const GIF_BASE64 =
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  // Return an HTML page with the pixel embedded as base64 data URI.
  // This is the most compatible approach for GAS (binary output not natively supported).
  const html =
    `<html><head>` +
    `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>` +
    `<meta http-equiv="Pragma" content="no-cache"/>` +
    `<meta http-equiv="Expires" content="0"/>` +
    `</head><body style="margin:0;padding:0;">` +
    `<img src="data:image/gif;base64,${GIF_BASE64}" width="1" height="1" style="display:block;" />` +
    `</body></html>`;

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ============================================================
//  getLogs() — called from the dashboard via google.script.run
//
//  Returns all rows from the Logs sheet as an array of objects.
//  Skips the header row automatically.
//
//  Returns:
//    [{ id, email, timestamp, userAgent, ip }, ...]
// ============================================================

function getLogs() {
  try {
    const sheet = _getSheet(CONFIG.SHEET_LOGS);
    const data  = sheet.getDataRange().getValues();

    if (data.length <= 1) return []; // only header or empty

    const [_header, ...rows] = data;

    return rows.map(row => ({
      id:        String(row[CONFIG.LOGS_COL.ID        - 1] || ""),
      email:     String(row[CONFIG.LOGS_COL.EMAIL     - 1] || ""),
      timestamp: row[CONFIG.LOGS_COL.TIMESTAMP        - 1]
                   ? new Date(row[CONFIG.LOGS_COL.TIMESTAMP - 1]).toISOString()
                   : "",
      userAgent: String(row[CONFIG.LOGS_COL.USER_AGENT - 1] || "N/A"),
      ip:        String(row[CONFIG.LOGS_COL.IP         - 1] || "N/A"),
    }));

  } catch (err) {
    Logger.log("getLogs() error: " + err.message);
    throw new Error("Failed to fetch logs: " + err.message);
  }
}


// ============================================================
//  NOTE: getAnalytics() is already defined in Code.gs
//  It returns:
//  {
//    totalEmailsSent: number,
//    totalOpens:      number,
//    openRate:        string,  // "42.50%"
//    uniqueOpeners:   number,
//    opensByDay:      [{ date, count }],
//    opensByHour:     [{ hour, count }]
//  }
//
//  Both getAnalytics() and getLogs() are safe to call via
//  google.script.run from the HTML dashboard.
// ============================================================


/*
 * ============================================================
 *  HOW TO ADD index.html TO YOUR PROJECT
 * ============================================================
 *
 *  IN THE APPS SCRIPT EDITOR (browser):
 *  1. Open your project at script.google.com
 *  2. Click the "+" next to Files → select "HTML"
 *  3. Name it exactly: index  (GAS adds .html automatically)
 *  4. Paste the full content of index.html into this file
 *  5. Save
 *
 *  VIA CLASP (local dev):
 *  1. Place index.html in your src/ directory
 *  2. Run: clasp push
 *  3. GAS automatically recognizes .html files
 *
 * ============================================================
 *  DEPLOYMENT NOTES
 * ============================================================
 *
 *  After adding these files:
 *  1. Deploy → New Deployment (or update existing)
 *  2. Type: Web App
 *  3. Execute as: Me
 *  4. Who has access: Anyone (for pixel to work from email clients)
 *  5. Copy the /exec URL
 *
 *  Dashboard URL:     https://script.google.com/macros/s/ID/exec
 *  Tracking Pixel:    https://script.google.com/macros/s/ID/exec?email=X&id=Y
 *
 * ============================================================
 */
