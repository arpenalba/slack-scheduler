# Slack Status Scheduler — Product Backlog
### Scrum User Stories v1.1

---

## Dependency Map

```
US-01 (Scaffold)
  └── US-02 (Evaluator)
        └── US-03 (Slack API)
              └── US-04 (Console Service)
                    ├── US-05 (Logger)
                    └── US-06 (Error handling)
  └── US-08 (Editor — Weekly)
        └── US-09 (Editor — Once)
              └── US-10 (Editor — Import/Export)
                    ├── US-11 (Editor — Preview simulator)
                    └── US-12 (Editor — Expired indicator)
```

---

## Phase 1 — MVP: Service Functional

> Goal: a running Node.js console service that correctly changes the Slack status on schedule, with an interactive console menu for control. No editor yet. Config is edited manually.

---

### US-01 · Project Scaffold

**As a developer,** I want the project skeleton set up with all configuration files and folder structure so that I can start implementing without environment friction.

**Acceptance criteria:**
- [ ] `package.json` created with all dependencies from design doc §2.3 (`node-cron`, `axios`, `dotenv`, `dayjs` + plugins `utc`/`timezone`, `open`)
- [ ] `.gitignore` excludes `.env`, `node_modules/`, `logs/`
- [ ] `.env.example` created with placeholder `SLACK_USER_TOKEN=xoxp-...`
- [ ] Folder structure created: `scheduler/`, `editor/`, `logs/`
- [ ] `config.json` created with a sample entry (one weekly rule, one once rule) matching the schema in design doc §2.2
- [ ] `npm install` runs without errors

**Dependencies:** none

---

### US-02 · Status Evaluator

**As a user,** I want the system to determine which status rule applies at any given moment, respecting the priority hierarchy, so that the correct status is always selected.

**Acceptance criteria:**
- [ ] `scheduler/evaluator.js` exports a single function `evaluate(now, config)` that returns the matching rule object or `null`
- [ ] `floorTo15(HH:MM)` helper floors any time to the nearest 15-minute multiple before comparison (e.g. `14:03` → `14:00`, `15:47` → `15:45`)
- [ ] Priority is respected in order: once+time > once all-day > weekly+time > weekly all-day > null
- [ ] `from` boundary is inclusive, `to` boundary is exclusive
- [ ] Within the same priority level, first rule in the array wins (first-match)
- [ ] A once rule only matches if its `date` equals today in the configured timezone
- [ ] A weekly rule only matches if today's day name (`"monday"` … `"sunday"`) is in its `days` array
- [ ] Returns `null` when no rule matches

**Dependencies:** US-01

---

### US-03 · Slack API Wrapper

**As a user,** I want the service to call the Slack API to set or clear my status so that changes are reflected in my Slack profile.

**Acceptance criteria:**
- [ ] `scheduler/slack.js` exports two functions: `setStatus(rule, config)` and `clearStatus()`
- [ ] `setStatus` sends a `POST` to `users.profile.set` with `status_emoji`, `status_text`, and `status_expiration`
- [ ] When the rule has a `to` field, `status_expiration` is the Unix timestamp (UTC) of that time on the current day in `config.timezone`
- [ ] When the rule has no `to` field, `status_expiration` is `0`
- [ ] `clearStatus` sends the same endpoint with empty `status_emoji`, empty `status_text`, and `status_expiration: 0`
- [ ] Token is read from `process.env.SLACK_USER_TOKEN` (loaded via `dotenv`)
- [ ] Both functions return a resolved/rejected Promise; the caller handles errors

**Dependencies:** US-01

---

### US-04 · Console Service

**As a user,** I want the scheduler to run as a console process with an interactive menu so that I can control it from the terminal without any native OS integrations.

**Acceptance criteria:**
- [ ] `scheduler/index.js` loads `.env` and reads `config.json` into memory at startup; exits with a clear error message if either is missing or invalid
- [ ] On startup, calls `evaluate(now, config)` immediately and applies the result via `setStatus` or `clearStatus`
- [ ] A `node-cron` job runs on schedule `"0,15,30,45 * * * *"` (every 15 minutes on the exact marks)
- [ ] Each cron tick evaluates the current status using the in-memory config
- [ ] If the result is the same rule as the current active state (compared by `id`, or both null), no API call is made
- [ ] If the result differs, the API is called and the in-memory active state is updated
- [ ] When `process.stdin.isTTY` is true (interactive mode), a console menu is displayed: `1) Open editor  2) Reload config  3) Quit`
- [ ] Option `1` opens `editor/index.html` in the default system browser
- [ ] Option `2` re-reads `config.json` from disk, resets active state, and immediately applies the current rule
- [ ] Option `3` exits the process cleanly
- [ ] When `process.stdin.isTTY` is false (PM2 / headless), no menu is shown; the service runs silently
- [ ] `config.json` is **not** re-read automatically on each tick; explicit reload (option 2 or restart) is the reload mechanism

**Dependencies:** US-02, US-03

---

### US-05 · File Logger

**As a user,** I want every status change to be written to a log file so that I can review the history and debug unexpected behavior.

**Acceptance criteria:**
- [ ] `scheduler/logger.js` exports a `log(entry)` function that appends a line to `logs/status.log`
- [ ] Each log line contains: ISO timestamp, action (`SET` or `CLEAR`), emoji, text, and the HTTP response status from Slack
- [ ] The `logs/` directory is created automatically if it does not exist
- [ ] Errors from the Slack API are also logged (with the error message)
- [ ] No log rotation is required at this stage

**Dependencies:** US-04

---

## Phase 2 — Production Ready

> Goal: the tray app survives failures gracefully and keeps a full audit trail of status changes.

---

### US-06 · Error Handling and Resilience

**As a user,** I want the service to keep running and log errors when the Slack API fails so that a transient network issue does not crash the process.

**Acceptance criteria:**
- [ ] A failed API call (network error, non-OK HTTP response, Slack API `ok: false`) is caught and logged without crashing the process
- [ ] The in-memory active state is **not** updated when the API call fails, so the next tick retries

**Dependencies:** US-05

---

## Phase 3 — Visual Editor Core

> Goal: a non-technical user can manage the schedule through a browser UI without touching JSON.

---

### US-08 · Editor — Weekly Rule Management

**As a user,** I want to add, edit, and delete weekly recurrence rules through a visual interface so that I can manage my regular schedule without writing JSON.

**Acceptance criteria:**
- [ ] `editor/index.html` is a single self-contained static file (no external dependencies, no server required)
- [ ] The page has a "Weekly rules" section listing all current weekly entries
- [ ] Each entry shows: day selector (pill buttons L/M/X/J/V/S/D), emoji field (`:code:` format), text field, time-range toggle, and a delete button
- [ ] When the time-range toggle is enabled, `from` and `to` dropdowns appear, limited to `HH:00`, `HH:15`, `HH:30`, `HH:45` options
- [ ] "Add rule" button appends a new blank entry with a GUID generated via `crypto.randomUUID()`
- [ ] All changes update an in-memory representation of the config in real time

**Dependencies:** US-01 (for config schema awareness; can be developed in parallel with Phase 1)

---

### US-09 · Editor — Once Entry Management

**As a user,** I want to add, edit, and delete one-off date entries through the same visual interface so that I can schedule holidays, sick days, and special events.

**Acceptance criteria:**
- [ ] The page has an "Once entries" section listing all one-off entries below the weekly section
- [ ] Each entry shows: date picker, emoji field, text field, time-range toggle (same behavior as US-08), and a delete button
- [ ] "Add entry" button appends a new blank entry with today's date pre-filled and a new GUID
- [ ] Entries whose `date` is in the past are visually marked as expired (e.g. greyed out or with a label)
- [ ] All changes update the same in-memory config representation as US-08

**Dependencies:** US-08

---

### US-10 · Editor — Import / Export

**As a user,** I want to load an existing `config.json` into the editor and download the result so that the editor connects to the actual running service config.

**Acceptance criteria:**
- [ ] A "Load config" button opens a file picker that accepts `.json` files; the loaded data populates the UI
- [ ] A "Download config.json" button triggers a browser download of the current in-memory config as a formatted JSON file
- [ ] A "Copy JSON" button copies the current config JSON to the clipboard
- [ ] A read-only JSON preview panel shows the current config, updated in real time on every change
- [ ] The timezone field is editable (text input with the value from `config.timezone`)
- [ ] Loading a file with unknown or extra fields does not crash the editor (unknown fields are preserved in the output)

**Dependencies:** US-09

---

## Phase 4 — Editor Polish

> Goal: the editor is self-explanatory and catches configuration mistakes before they reach the service.

---

### US-11 · Editor — Day/Time Preview Simulator

**As a user,** I want to select any day and time in the editor and see which status would be active at that moment so that I can verify my schedule is correct before downloading it.

**Acceptance criteria:**
- [ ] A "Preview" panel contains a day-of-week selector and a time picker (15-minute increments)
- [ ] On any change to the day or time selector, the panel immediately shows the result: emoji + status text of the matching rule, or "No active status" if none matches
- [ ] The simulation uses the same priority logic as `evaluator.js` (implemented in browser JS)
- [ ] The simulator reflects the current in-memory config, including unsaved changes

**Dependencies:** US-10

---

### US-12 · Editor — Input Validation Feedback

**As a user,** I want the editor to highlight invalid or incomplete entries so that I catch configuration mistakes before downloading the config.

**Acceptance criteria:**
- [ ] An entry with no days selected (weekly) is visually flagged as invalid
- [ ] An entry with an empty emoji or empty text field is visually flagged
- [ ] A time range where `from >= to` is flagged as invalid
- [ ] The "Download" and "Copy JSON" buttons are disabled (or show a warning) while any invalid entry exists
- [ ] Validation runs in real time as the user types or changes selections

**Dependencies:** US-10

---

## Story Summary

| ID | Title | Phase | Depends on |
|---|---|---|---|
| US-01 | Project Scaffold | 1 — MVP | — |
| US-02 | Status Evaluator | 1 — MVP | US-01 |
| US-03 | Slack API Wrapper | 1 — MVP | US-01 |
| US-04 | Console Service | 1 — MVP | US-02, US-03 |
| US-05 | File Logger | 1 — MVP | US-04 |
| US-06 | Error Handling | 2 — Production | US-05 |
| US-08 | Editor — Weekly Rules | 3 — Editor Core | US-01 |
| US-09 | Editor — Once Entries | 3 — Editor Core | US-08 |
| US-10 | Editor — Import/Export | 3 — Editor Core | US-09 |
| US-11 | Editor — Preview Simulator | 4 — Editor Polish | US-10 |
| US-12 | Editor — Input Validation | 4 — Editor Polish | US-10 |
