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

function log(entry) {
  const { timestamp, action, emoji, text, httpStatus, error } = entry;
  const line = error
    ? `${timestamp} ${action} emoji=${emoji ?? ''} text=${text ?? ''} httpStatus=${httpStatus ?? ''} error=${error}`
    : `${timestamp} ${action} emoji=${emoji} text=${text} httpStatus=${httpStatus}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  trimLog();
}

module.exports = { log };
