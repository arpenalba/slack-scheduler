'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'status.log');
const MAX_LINES = 500;

fs.mkdirSync(LOG_DIR, { recursive: true });

function trimLog() {
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  if (lines.length > MAX_LINES) {
    fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LINES).join('\n') + '\n');
  }
}

function formatSuffix(entry) {
  const { action, emoji, text, httpStatus, error, presence, minutes, reason } = entry;
  switch (action) {
    case 'SET':
    case 'CLEAR':
      return error
        ? `emoji=${emoji ?? ''} text=${text ?? ''} httpStatus=${httpStatus ?? ''} error=${error}`
        : `emoji=${emoji} text=${text} httpStatus=${httpStatus}`;
    case 'PRESENCE':
      return error
        ? `presence=${presence ?? ''} httpStatus=${httpStatus ?? ''} error=${error}`
        : `presence=${presence} httpStatus=${httpStatus}`;
    case 'DND_START':
      return error
        ? `minutes=${minutes ?? ''} httpStatus=${httpStatus ?? ''} error=${error}`
        : `minutes=${minutes} httpStatus=${httpStatus}`;
    case 'DND_END':
      return error
        ? `httpStatus=${httpStatus ?? ''} error=${error}`
        : `httpStatus=${httpStatus}`;
    case 'DND_SKIP':
      return `minutes=${minutes} reason=${reason}`;
    case 'RELOAD_ERROR':
      return `error=${error}`;
    default:
      return error ? `error=${error}` : '';
  }
}

function log(entry) {
  const line = `${entry.timestamp} ${entry.action} ${formatSuffix(entry)}`.trimEnd();
  fs.appendFileSync(LOG_FILE, line + '\n');
  trimLog();
}

module.exports = { log };
