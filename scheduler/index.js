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

async function applyRule(rule) {
  const timestamp = new Date().toISOString();
  const action    = rule ? 'SET' : 'CLEAR';
  const emoji     = rule ? rule.emoji : '';
  const text      = rule ? rule.text  : '';
  try {
    const response = rule
      ? await setStatus(rule, config)
      : await clearStatus();
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
    await applyRule(evaluate(now, config));
    console.log('Config reloaded.');
  } catch (err) {
    console.error('Failed to reload config:', err.message);
    log({ timestamp: new Date().toISOString(), action: 'RELOAD_ERROR', error: err.message });
  }
}

// ── console menu ──────────────────────────────────────────────────────────────

function showMenu(rl) {
  console.log('\n1) Open editor  2) Reload config  3) Quit');
  rl.question('> ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        open(pathToFileURL(path.join(__dirname, '../editor/index.html')).toString());
        break;
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
  await applyRule(evaluate(now, config));

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    showMenu(rl);
  }
})();

// ── cron: every 15 min at :00 :15 :30 :45 ────────────────────────────────────

cron.schedule('0,15,30,45 * * * *', async () => {
  const now    = dayjs().tz(config.timezone);
  const rule   = evaluate(now, config);
  const prevId = activeRule?.id ?? null;
  const nextId = rule?.id ?? null;
  if (prevId !== nextId) {
    await applyRule(rule);
  }
});
