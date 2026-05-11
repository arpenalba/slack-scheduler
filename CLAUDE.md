# Slack Status Scheduler

Personal tool that automatically changes a Slack status on a schedule. Two independent pieces: a Node.js background service and a static HTML editor.

## Commands

```bash
npm install                                        # install dependencies
node scheduler/index.js                            # run manually (dev)
pm2 start scheduler/index.js --name slack-scheduler  # run with PM2
pm2 restart slack-scheduler                        # apply config changes when running via PM2
# When running interactively, press 2 in the console menu to reload config without restarting
```

## Architecture in one paragraph

The service reads `config.json` **once at startup** into memory and never touches the file again until restarted. A `node-cron` job fires at `:00`, `:15`, `:30`, `:45` every hour. Each tick calls `evaluator.js` with the in-memory config, compares the result to the currently active rule (by `id`), and only calls the Slack API when the state changes. The HTML editor is a browser-only static file — it talks to the service exclusively through the filesystem: the user downloads a new `config.json` and restarts the service.

## Non-obvious decisions

**Config reload is explicit, not automatic.** Don't add file-watching or periodic disk reads. In interactive mode (direct `node` run), the console menu "Reload config" option re-reads the file on demand. In PM2/headless mode, `pm2 restart` is the reload mechanism. Both paths avoid partial reads during a file download.

**All times are floored to 15-minute multiples.** `14:03` → `14:00`, `15:47` → `15:45`. The `floorTo15()` helper in `evaluator.js` must be applied to the current time before any comparison. Valid minutes are only `00`, `15`, `30`, `45`.

**`from` is inclusive, `to` is exclusive.** At `13:00` the status activates; at `14:00` it is already gone. This mirrors standard interval convention.

**No midnight-crossing ranges.** A range like `22:00–02:00` is invalid and must be rejected. Don't implement wrap-around logic.

**Priority order (highest to lowest):**
1. `once` rule with time range
2. `once` rule all-day (no `from`/`to`)
3. `weekly` rule with time range
4. `weekly` rule all-day
5. `null` → clear Slack status

Within the same priority level, **first rule in the array wins** (first-match). No further tie-breaking exists yet.

**`status_expiration` logic:**
- Rule has `to` → convert `to` time on today's date in `config.timezone` to a UTC Unix timestamp.
- Rule has no `to` → send `0` (Slack never auto-clears; the service handles the next transition).

**Emoji are stored as Slack codes.** Always `:house:`, never `🏠`. The Slack API expects colon-format and so does `config.json`.

**IDs are GUIDs.** Every rule entry has a unique `id` (UUID v4). The editor generates them with `crypto.randomUUID()`. The service uses `id` only for deduplication (comparing active state between ticks).

## File map

```
scheduler/
  index.js      entry point — loads .env, reads config, starts cron
  evaluator.js  pure function: evaluate(now, config) → rule | null
  slack.js      setStatus(rule, config) and clearStatus() — Slack API calls
  logger.js     appends lines to logs/status.log

editor/
  index.html    self-contained static file, no server needed

config.json     user schedule (schema in docs/design_doc.md §2.2)
.env            SLACK_USER_TOKEN=xoxp-...  (never commit)
logs/status.log auto-created by logger.js
```

## Dependencies

| Package | Why |
|---|---|
| `node-cron` | fires every 15 min at exact marks |
| `axios` | Slack API calls |
| `dotenv` | loads token from `.env` |
| `dayjs` + plugins `utc`, `timezone` | timezone-aware date/time math |
| `open` | opens `editor/index.html` in the default browser from the console menu |

The editor uses only browser-native APIs — no npm packages.

## Slack API

Single endpoint: `POST https://slack.com/api/users.profile.set`

Token type: **User Token** (`xoxp-...`) with scope `users.profile:write`. Set via `SLACK_USER_TOKEN` in `.env`. Never goes in `config.json` or the editor.

## Reference docs

- `docs/design_doc.md` — full specification and design decisions
- `docs/backlog.md` — ordered user stories from MVP to completion
