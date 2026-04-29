# PixelTracer — Email Analytics Engine

PixelTracer is a serverless email analytics system built on Google Apps Script. It enables tracking of email opens and link clicks, logging user activity, and visualizing engagement through a web-based dashboard.

---

## Overview

The system embeds a tracking pixel and instrumented links into outgoing emails. When a recipient opens an email or clicks a link, a request is sent to the Apps Script Web App, which records the event in Google Sheets. The same deployment serves an analytics dashboard.

The design avoids external infrastructure: execution, storage, and UI are all handled within the Google ecosystem.

---

## Architecture

| Layer    | Technology             | Responsibility                        |
| -------- | ---------------------- | ------------------------------------- |
| Backend  | Google Apps Script     | Email dispatch, routing, logging      |
| Storage  | Google Sheets          | Users and event logs                  |
| Frontend | HTML Service, Chart.js | Analytics dashboard                   |
| Email    | GmailApp               | Sending personalized emails           |
| Routing  | doGet(e)               | Pixel, click, and dashboard endpoints |

---

## System Diagram

```
+---------------------+
|   Email Recipient   |
| (Gmail / Outlook)   |
+----------+----------+
           |
           | Opens email / clicks link
           v
+-----------------------------+
|  Apps Script Web App        |
|  (doGet(e) Router)          |
+-------------+---------------+
              | 
   +----------+-----------+
   |                      |
   v                      v
[ Pixel Route ]      [ Click Route ]
   |                      |
   |                      |
   v                      v
Log "open" event     Log "click" event
to Google Sheets     to Google Sheets
   |                      |
   |                      |
   v                      v
Return 1x1 pixel     Redirect to URL

              |
              v
+-----------------------------+
|   Google Sheets (Database)  |
|   - Users Sheet             |
|   - Logs Sheet              |
+-------------+---------------+
              |
              v
+-----------------------------+
|  Analytics Dashboard        |
|  (HTML + Chart.js)          |
|  served via /exec           |
+-----------------------------+
```

---

## Routing Logic (`doGet(e)`)

The Web App acts as a single entry point and routes requests based on query parameters.

### Route 1 — Dashboard

```
GET /exec
```

* No query parameters
* Returns HTML dashboard
* Frontend fetches analytics via `google.script.run`

---

### Route 2 — Open Tracking

```
GET /exec?email=<email>&id=<id>
```

* Triggered when email is opened
* Logs event:

  * id
  * email
  * timestamp
  * userAgent
  * ip
  * type = "open"
* Returns a 1×1 transparent pixel

---

### Route 3 — Click Tracking

```
GET /exec?click=1&email=<email>&id=<id>&url=<destination>
```

* Triggered when link is clicked
* Logs event:

  * id
  * email
  * timestamp
  * type = "click"
* Responds with redirect to destination URL

---

### Routing Summary

| Condition            | Action                  |
| -------------------- | ----------------------- |
| no params            | Serve dashboard         |
| `click=1`            | Log click + redirect    |
| `email & id present` | Log open + return pixel |

---

## Sequence Flow — Open Tracking

```
User opens email
        |
        v
Email client loads tracking pixel
        |
        v
GET /exec?email=X&id=Y
        |
        v
doGet(e) receives request
        |
        v
Extract parameters (email, id)
        |
        v
Append row to Logs sheet
(type = "open", timestamp)
        |
        v
Return 1x1 transparent image
        |
        v
Email renders successfully
```

---

## Sequence Flow — Click Tracking

```
User clicks link
        |
        v
GET /exec?click=1&email=X&id=Y&url=Z
        |
        v
doGet(e) detects click=1
        |
        v
Append row to Logs sheet
(type = "click", timestamp)
        |
        v
Return redirect response
        |
        v
User lands on destination URL
```

---

## Tracking Mechanism

### Open Tracking

Each email contains a 1×1 pixel:

```html
<img src="/exec?email=user@example.com&id=123" width="1" height="1" />
```

When the email client loads the image:

* The request hits `doGet(e)`
* A log entry is appended to the `Logs` sheet
* A transparent response is returned

---

### Click Tracking

Links are routed through the Web App:

```html
<a href="/exec?click=1&email=user@example.com&id=123&url=https://example.com">
  Visit
</a>
```

On click:

* The event is logged (`type = click`)
* The user is redirected to the destination

---

## Data Model

### Users Sheet

| Field  | Description             |
| ------ | ----------------------- |
| id     | Unique identifier       |
| name   | Recipient name          |
| email  | Email address           |
| status | PENDING / SENT / FAILED |

---

### Logs Sheet

| Field     | Description      |
| --------- | ---------------- |
| id        | User identifier  |
| email     | Email address    |
| timestamp | Event time (IST) |
| userAgent | Request metadata |
| ip        | Request origin   |
| type      | open / click     |

---

## Features

* Bulk email sending using GmailApp
* Open tracking via embedded pixel
* Click tracking via redirect mechanism
* Real-time analytics dashboard
* Open rate and click-through rate computation
* Unique opener and clicker metrics
* Filtering by date, recipient, and event type
* Timezone normalization (Asia/Kolkata)
* Batch execution with resumable progress

---

## Execution Model

Google Apps Script enforces a 6-minute execution limit. To handle larger campaigns:

* Emails are processed in batches
* Progress is stored using PropertiesService
* Time-based triggers resume execution automatically
* Sent rows are skipped to ensure idempotency

---

## Scalability Considerations

For higher volumes:

* Introduce a queue sheet with processing states
* Use multiple triggers for parallel execution
* Implement retry logic for failed sends
* Maintain append-only logging for performance

---

## Setup

```bash
npm install -g @google/clasp
clasp login
clasp push
```

Deploy as a Web App with:

* Execute as: Me
* Access: Anyone

---

## Deployment

* Web App: https://script.google.com/macros/s/AKfycbwncAJjkg615ddnJ1oXMt8RsE78GsAOYeVGED6_nm7nNSMI1ZSiaANhwWdmboHLkDFpKg/exec
* Apps Script: https://script.google.com/d/1Y6gYErNRfJ67_wLlUwxZBXGEuXwBss8YV0FkO3vqpQDq848fMwBDciKg/edit
* Data Store: https://drive.google.com/open?id=1BgchjNNZdlJZhNwvoNFa-KSU2IuhBQe5GpvDICE3o1s

---

## Limitations

* Email clients may cache images, inflating open counts
* User agent and IP data may be restricted by proxies
* Gmail quotas limit daily sending volume

---

## License

MIT License
