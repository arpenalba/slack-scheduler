# Slack Status Scheduler — v2 Known Issues

## Bug tracker for Phase 5 (Presence, DND & Default Status)

### Preview simulator should use a date selector instead of week buttons

**Status:** Resolved  
**Severity:** Low  
**Component:** Editor simulator (`editor/index.html`)

**Description:**  
The preview simulator displays 7 day-of-week pills (L M X J V S D) that select which day to simulate. This design assumes the user wants to test rules for a specific weekday in the future, but it doesn't let them test rules for a specific date (needed for `once` entries).

**Expected behavior:**  
The simulator should have a date picker (e.g., `<input type="date">`) so users can test any specific date, not just "next Monday" or "this Thursday". For the selected date, the simulator evaluates both `once` entries (exact date match) and `weekly` entries (day-of-week match).

**Current behavior:**  
Users can only test `once` entries if they happen to have a date equal to `todayStr()`. They cannot preview a `once` entry scheduled for next week.

**Impact:**  
Limited ability to validate one-off rules in the preview before saving.

**Suggested fix:**  
Replace the day-of-week pills with a `<input type="date">`. Store the selected date and pass both the date and the derived day-of-week to `simulate()`.

---

### File config path only shows filename, not absolute path

**Status:** Resolved  
**Severity:** Low  
**Component:** Editor file path display (`editor/index.html`, `scheduler/index.js`)

**Description:**  
The config file path displayed in the **Config** section (input with id `config-path`) shows only the filename (e.g., `config.json`), not the full absolute path. Users cannot easily see where the file is located on disk, making it unclear which workspace or project the editor is bound to.

**Expected behavior:**  
The path display should show the full absolute path to the loaded file, e.g., `C:\Users\username\Projects\slack-scheduler\config.json`.

**Solution:**  
Browsers do not expose the absolute file path for security reasons — the File System Access API only provides `file.name`. Worked around this by passing the path from the service side, where Node.js has full filesystem access:

- `scheduler/index.js` now appends `?configPath=<encoded absolute path>` to the editor URL when opening it from the console menu (option 1).
- `editor/index.html` reads the `configPath` query parameter from `window.location.search` on init and displays it in the path bar. The value is also persisted to `localStorage` so it survives page refreshes.

**Limitation:** The path is only known when the editor is opened via the service console menu. If the user opens `editor/index.html` directly in the browser (e.g., double-click), the path shown is the last stored value from `localStorage`, or just the filename if a file is loaded via Browse.

---

### Invert section order: Config, Preview, Once, Weekly, Default, Raw

**Status:** Resolved  
**Severity:** Low  
**Component:** Editor layout (`editor/index.html`)

**Description:**  
The current section order is: Config, Weekly, Once, Preview Simulator, Raw View. This places the most detailed rule sections (Weekly and Once) before the Preview Simulator, making it harder for users to test their rules before reviewing them in detail.

**Expected behavior:**  
The sections should be reordered to: Config, Preview Simulator, Once, Weekly, Default Status, Raw View. This flows from high-level overview → simulation/testing → rule details → raw JSON, matching a more intuitive user workflow.

**Current behavior:**  
Users must scroll past Weekly and Once sections before reaching the Preview Simulator, which should ideally come first to help them validate the configuration.

**Impact:**  
Suboptimal UX for rule testing and validation.

**Suggested fix:**  
Reorder the five `<section>` elements in the HTML. Keep Config first and Raw last. Place Preview Simulator second, then Once, Weekly, and Default Status.

### Force open editor with Microsoft Edge instead of default browser

**Status:** Resolved  
**Severity:** Low  
**Component:** Service console menu (`scheduler/index.js`)

**Description:**  
When the user selects option "1) Open editor" from the console menu, the `open()` function (from the `open` npm package) opens `editor/index.html` in the system's default browser. On some systems this may be Firefox, Chrome, or another browser. The service works best with browsers that support the File System Access API (FSAA), which enables direct `config.json` save-to-disk without downloads.

**Expected behavior:**  
Force the editor to open specifically in Microsoft Edge (which has full FSAA support), regardless of the system default browser.

**Solution:**  
Modified `scheduler/index.js` to use platform-aware app selection. The code now:
- Detects the platform (`win32`, `darwin`, `linux`)
- Constructs the appropriate Edge app argument for each platform
- Attempts to open in Edge first, with a graceful fallback to default browser if Edge isn't found

Windows users get `msedge`, macOS gets `Microsoft Edge`, and Linux gets `microsoft-edge`. Failures are caught and logged, then the default browser is used as a fallback.

**Status:** Resolved  
**Severity:** Low  
**Component:** Editor (`editor/index.html`)

**Description:**  
When the user reloads a config file via the **Reload** button in the editor, `runValidation()` is called but it only checks for invalid states that are currently rendered on screen or matched by their `data-id` attribute. If a loaded config contains rules that were never rendered or have stale references, their validation state may not update correctly.

**Expected behavior:**  
All rules in `config.weekly`, `config.once`, and `config.default_status` should be validated after a file load, regardless of whether they are visibly matched to a card in the DOM.

**Current behavior:**  
The validation loop skips rules whose cards are not found (`if (!card) continue`), leaving invalid entries undetected.

**Impact:**  
Users can accidentally export a config with invalid rules if they load a file, don't visually inspect all cards, and hit Save without scrolling through the list.

**Suggested fix:**  
Refactor `runValidation()` to validate the in-memory config model directly, not by DOM lookup. Build a separate `allValid` check that doesn't depend on `document.querySelector`.

---

### Simulation only simulates weekly & default but not once entries

**Status:** Resolved  
**Severity:** Low  
**Component:** Editor simulator (`editor/index.html`)

**Description:**  
The `simulate()` function only checks `config.weekly` rules. It does not consider `config.once` entries when determining which status is active at a given day/time in the preview simulator.

**Expected behavior:**  
The simulator should respect the full priority order: once (with/without time range), then weekly (with/without time range), then default_status.

**Current behavior:**  
If the user has a `once` entry for the selected day, it is ignored in the simulator preview. The preview shows either a weekly rule or default, never a once entry.

**Impact:**  
The simulator preview is inaccurate when `once` entries are in play. Users cannot visually validate their one-off rules before saving.

**Suggested fix:**  
Extend `simulate()` to loop through `config.once` entries with the selected date and add them to the priority evaluation. Match the same priority order as the service's `evaluator.js`.

---
