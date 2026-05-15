'use strict';

require('dotenv').config();

const path            = require('path');
const readline        = require('readline');
const { pathToFileURL } = require('url');
const cron            = require('node-cron');
const dayjs           = require('dayjs');
const utc             = require('dayjs/plugin/utc');
const tz              = require('dayjs/plugin/timezone');
const open            = require('open');

const { evaluate }               = require('./evaluator');
const { setStatus, clearStatus } = require('./slack');
const { log }                    = require('./logger');

dayjs.extend(utc);
dayjs.extend(tz);

// ── startup validation ────────────────────────────────────────────────────────

if (!process.env.SLACK_USER_TOKEN) {
  console.error('Error: SLACK_USER_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

let config;
try {
  config = require('../config.json');
} catch {
  console.error('Error: config.json is missing or contains invalid JSON.');
  process.exit(1);
}

// ── state ─────────────────────────────────────────────────────────────────────

let activeRule = undefined; // undefined = not yet evaluated, null = cleared

function resolveRule(evaluated, config) {
  if (evaluated) return evaluated;
  if (config.default_status) {
    return { ...config.default_status, id: '__default__', status_expiration: 0 };
  }
  return null;
}

async function applyRule(rule) {
  const timestamp = new Date().toISOString();
  const action    = rule ? 'SET' : 'CLEAR';
  const emoji     = rule ? rule.emoji : '';
  const text      = rule ? rule.text  : '';
  const prevRule  = activeRule ?? null;
  try {
    const response = rule
      ? await setStatus(rule, config, prevRule)
      : await clearStatus(prevRule);
    log({ timestamp, action, emoji, text, httpStatus: response.status });
    activeRule = rule;
  } catch (err) {
    console.error('Slack API error:', err.message);
    log({ timestamp, action, emoji, text, error: err.message });
  }
}

// ── config reload ─────────────────────────────────────────────────────────────

async function reloadConfig() {
  try {
    const configPath = require.resolve('../config.json');
    delete require.cache[configPath];
    config = require(configPath);
    activeRule = undefined;
    const now = dayjs().tz(config.timezone);
    await applyRule(resolveRule(evaluate(now, config), config));
    console.log('Config reloaded.');
  } catch (err) {
    console.error('Failed to reload config:', err.message);
    log({ timestamp: new Date().toISOString(), action: 'RELOAD_ERROR', error: err.message });
  }
}

// ── console menu ──────────────────────────────────────────────────────────────

function showMenu(rl) {
  const editorPath = path.resolve(__dirname, '../editor/index.html');
  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║  ███████╗██╗      █████╗  ██████╗██╗  ██╗███████╗███████╗   ║
  ║  ██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔════╝   ║
  ║  ███████╗██║     ███████║██║     █████╔╝ ███████╗███████╗   ║
  ║  ╚════██║██║     ██╔══██║██║     ██╔═██╗ ╚════██║╚════██║   ║
  ║  ███████║███████╗██║  ██║╚██████╗██║  ██╗███████║███████║   ║
  ║  ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝   ║
  ║                                                               ║
  ║              ✓ Slack Status Scheduler Running...             ║
  ║                                                               ║
  ║  Config editor found in:                                     ║
  ║  ${editorPath}
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
`);
  console.log('  1) Open editor   2) Reload config   3) Quit\n');
  rl.question('  > ', async (answer) => {
    switch (answer.trim()) {
      case '1': {
        const configAbsPath = path.resolve(__dirname, '../config.json');
        const editorBase    = pathToFileURL(path.join(__dirname, '../editor/index.html')).toString();
        const editorUrl     = `${editorBase}?configPath=${encodeURIComponent(configAbsPath)}`;
        const platform = process.platform;
        const appArgs = platform === 'win32'
          ? { app: { name: 'msedge' } }
          : platform === 'darwin'
          ? { app: { name: 'Microsoft Edge' } }
          : { app: { name: 'microsoft-edge' } };
        open(editorUrl, appArgs).catch(() => {
          console.warn('Could not open editor in Edge. Trying default browser...');
          open(editorUrl);
        });
        break;
      }
      case '2':
        await reloadConfig();
        break;
      case '3':
        process.exit(0);
    }
    showMenu(rl);
  });
}

// ── immediate first evaluation ────────────────────────────────────────────────

(async () => {
  const now = dayjs().tz(config.timezone);
  await applyRule(resolveRule(evaluate(now, config), config));

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    showMenu(rl);
  }
})();

// ── cron: every 15 min at :00 :15 :30 :45 ────────────────────────────────────

cron.schedule('0,15,30,45 * * * *', async () => {
  const now      = dayjs().tz(config.timezone);
  const resolved = resolveRule(evaluate(now, config), config);
  const prevId   = activeRule?.id ?? null;
  const nextId   = resolved?.id ?? null;
  if (prevId !== nextId) {
    await applyRule(resolved);
  }
});
