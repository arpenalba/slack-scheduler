# Slack Status Scheduler — Product Backlog
### Scrum User Stories v2.0

> Extends [backlog v1.1](backlog.md). Phases 1–4 are unchanged.
> This file adds **Phase 5 — Presence, DND & Default Status** (US-13 to US-16).

---

## Updated Dependency Map

```
US-01 (Scaffold)
  └── US-02 (Evaluator)
        └── US-03 (Slack API)
              └── US-04 (Console Service)
                    ├── US-05 (Logger)
                    │     └── US-06 (Error handling)
                    ├── US-13 (Presence Control)         ← new
                    │     └── US-14 (DND Snooze)         ← new
                    │           └── US-16 (Default Status) ← new
                    └── US-16 (Default Status)            ← new
  └── US-08 (Editor — Weekly)
        └── US-09 (Editor — Once)
              └── US-10 (Editor — Import/Export)
                    ├── US-11 (Editor — Preview simulator)
                    ├── US-12 (Editor — Input Validation)
                    └── US-15 (Editor — Presence & DND)  ← new
                          └── US-16 (Default Status)      ← new
```

---

## Phase 5 — Presence, DND & Default Status

> Goal: each status entry can optionally control Slack presence and notification snooze, and a configurable default status replaces "clear" when no scheduled rule is active.

---

### US-13 · Presence Control per Rule (service)

**As a user,** I want each scheduled status to optionally set my Slack presence to "away" or "auto" so that my availability indicator matches what I'm doing without me managing it manually.

**Acceptance criteria:**
- [ ] `config.json` rule objects (weekly and once) support an optional `presence` field: `"away"` or `"auto"`
- [ ] `scheduler/slack.js` exports `setPresence(presence)` that calls `POST users.setPresence` with `{ presence }`
- [ ] `setStatus(rule, config, prevRule)` gains an optional `prevRule` parameter (defaults to `null`)
  - If `rule.presence` is defined: call `setPresence(rule.presence)` after the profile call
  - Else if `prevRule?.presence` was defined: call `setPresence("auto")` to restore
- [ ] `clearStatus(prevRule)` gains an optional `prevRule` parameter (defaults to `null`)
  - If `prevRule?.presence` was defined: call `setPresence("auto")`
- [ ] `scheduler/index.js` passes `activeRule` as `prevRule` in `applyRule`
- [ ] A successful or failed presence call is logged with action type `PRESENCE`
- [ ] A failed presence call is caught and logged without crashing or blocking the profile status call
- [ ] `users:write` scope is documented in setup instructions

**Dependencies:** US-05, US-06

---

### US-14 · DND / Notification Snooze per Rule (service)

**As a user,** I want each scheduled status to optionally snooze my Slack notifications for the duration of that status so that I'm not interrupted during focused work or lunch.

**Acceptance criteria:**
- [ ] Rule objects support an optional `dnd: true` field
- [ ] `scheduler/slack.js` exports:
  - `setDnd(minutes)` → `POST dnd.setSnooze` with `{ num_minutes: minutes }`
  - `endDnd()` → `POST dnd.endSnooze`
- [ ] `setStatus` (with `prevRule`):
  - If `rule.dnd` is true: calculate `minutes` using `minutesUntilTo(rule, config)` (see design doc §2.12)
    - If `minutes >= 20`: call `setDnd(minutes)`; log `DND_START`
    - If `minutes < 20`: log `DND_SKIP` (don't call the API)
  - Else if `prevRule?.dnd` was true: call `endDnd()`; log `DND_END`
- [ ] `clearStatus` (with `prevRule`):
  - If `prevRule?.dnd` was true: call `endDnd()`; log `DND_END`
- [ ] `minutesUntilTo(rule, config)` helper: if `rule.to` exists, returns minutes from now to `rule.to` in `config.timezone`; otherwise returns minutes until midnight in `config.timezone`
- [ ] If the calculated duration is negative (rule's `to` already passed — late startup), log `DND_SKIP`
- [ ] A failed DND call is caught and logged without crashing or blocking other calls
- [ ] `dnd:write` scope is documented in setup instructions

**Dependencies:** US-13

---

### US-15 · Editor — Presence & DND Controls

**As a user,** I want to configure presence and DND settings for each rule in the editor so that I don't have to write those fields manually in the JSON.

**Acceptance criteria:**
- [ ] Each rule card (weekly and once) gains a **presence selector**: options `— (no change)`, `Away`, `Auto`
  - Selecting "— (no change)" omits `presence` from the JSON
  - Selecting "Away" stores `"away"`, "Auto" stores `"auto"`
- [ ] Each rule card gains a **DND toggle** (checkbox labeled "Snooze notifications")
  - Checked: stores `dnd: true`; unchecked: omits `dnd` from the JSON
- [ ] Controls are placed compactly in or below the existing fields row (no new card section needed)
- [ ] JSON preview updates in real time when either control changes
- [ ] If the DND toggle is checked and the rule has a time range shorter than 20 minutes, a non-blocking warning icon appears on the card
- [ ] Validation (US-12) is not blocked by presence/DND choices — they are always optional

**Dependencies:** US-10, US-13, US-14

---

### US-16 · Default Status

**As a user,** I want to define a "default status" that is applied automatically when no scheduled rule is active, so that my Slack status is never left in whatever state the last rule put it in.

**Acceptance criteria:**

**Service side (`scheduler/index.js`, `scheduler/slack.js`):**
- [ ] `config.json` supports a top-level optional `default_status` object with fields `emoji`, `text`, and optionally `presence` and `dnd`
- [ ] `index.js` introduces a `resolveRule(evaluatedRule, config)` helper:
  - If `evaluatedRule` is non-null: return it unchanged
  - Else if `config.default_status` exists: return `{ ...config.default_status, id: "__default__", status_expiration: 0 }`
  - Else: return `null` (behavior unchanged from v1)
- [ ] `applyRule` calls `resolveRule` after `evaluate()` to get the effective rule
- [ ] The deduplication comparison works correctly for `"__default__"` — the service does not re-apply the default status on every tick
- [ ] `default_status` with `presence`/`dnd` fields follows the same side-effect logic as regular rules (US-13, US-14)

**Editor side (`editor/index.html`):**
- [ ] A "Default status" section appears above the "Weekly Rules" section
- [ ] The section has a toggle to enable/disable the default status
  - Disabled: `default_status` is omitted from the JSON output
  - Enabled: `default_status` appears in the JSON with the values from the fields below
- [ ] When enabled: emoji field, text field, presence selector, DND toggle (same controls as rule cards)
- [ ] Validation: if the section is enabled, emoji and text are required
- [ ] JSON preview and all export actions reflect the default status correctly

**Dependencies:** US-14, US-15

---

### US-17 · Update README — Token Setup for New Scopes

**As a developer setting up the project,** I want the README token setup instructions to list all required scopes so that I don't get cryptic API errors after installing the Slack app with an incomplete token.

**Acceptance criteria:**
- [ ] The README token setup section lists all three required scopes: `users.profile:write`, `users:write`, `dnd:write`
- [ ] A note explains which features each new scope unlocks (`users:write` → presence control, `dnd:write` → notification snooze)
- [ ] The instructions mention that adding new scopes requires reinstalling the Slack app in the workspace to obtain an updated token

**Dependencies:** US-13, US-14

---

## Updated Story Summary

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
| **US-13** | **Presence Control (service)** | **5 — Presence & DND** | **US-05, US-06** |
| **US-14** | **DND Snooze (service)** | **5 — Presence & DND** | **US-13** |
| **US-15** | **Editor — Presence & DND Controls** | **5 — Presence & DND** | **US-10, US-13, US-14** |
| **US-16** | **Default Status** | **5 — Presence & DND** | **US-14, US-15** |
| **US-17** | **README — Token Scopes Update** | **5 — Presence & DND** | **US-13, US-14** |
