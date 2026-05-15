const axios    = require('axios');
const dayjs    = require('dayjs');
const utc      = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

const { log } = require('./logger');

dayjs.extend(utc);
dayjs.extend(timezone);

const SLACK_PROFILE      = 'https://slack.com/api/users.profile.set';
const SLACK_SET_PRESENCE = 'https://slack.com/api/users.setPresence';
const SLACK_DND_SET      = 'https://slack.com/api/dnd.setSnooze';
const SLACK_DND_END      = 'https://slack.com/api/dnd.endSnooze';
const DND_MIN_MINUTES    = 20;

function authHeaders() {
  return { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` };
}

function getExpiration(rule, config) {
  if (!rule.to) return 0;
  const today = dayjs().tz(config.timezone).format('YYYY-MM-DD');
  return dayjs.tz(`${today} ${rule.to}`, config.timezone).unix();
}

function minutesUntilTo(rule, config) {
  const nowSec = Math.floor(Date.now() / 1000);
  const today  = dayjs().tz(config.timezone).format('YYYY-MM-DD');
  const endSec = rule.to
    ? dayjs.tz(`${today} ${rule.to}`, config.timezone).unix()
    : dayjs.tz(`${today} 23:59`, config.timezone).add(1, 'minute').unix();
  return Math.floor((endSec - nowSec) / 60);
}

async function setPresence(presence) {
  const response = await axios.post(SLACK_SET_PRESENCE, { presence }, { headers: authHeaders() });
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);
  return response;
}

async function setDnd(minutes) {
  const response = await axios.post(SLACK_DND_SET, { num_minutes: minutes }, { headers: authHeaders() });
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);
  return response;
}

async function endDnd() {
  const response = await axios.post(SLACK_DND_END, {}, { headers: authHeaders() });
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);
  return response;
}

async function applyPresenceSideEffect(rule, prevRule) {
  const target = rule && rule.presence
    ? rule.presence
    : (prevRule && prevRule.presence ? 'auto' : null);
  if (target === null) return;
  if (target === prevRule?.presence) return;

  const timestamp = new Date().toISOString();
  try {
    const response = await setPresence(target);
    log({ timestamp, action: 'PRESENCE', presence: target, httpStatus: response.status });
  } catch (err) {
    console.error('Slack presence error:', err.message);
    log({ timestamp, action: 'PRESENCE', presence: target, error: err.message });
  }
}

async function applyDndSideEffect(rule, config, prevRule) {
  const wantsDnd = !!(rule && rule.dnd);
  const hadDnd   = !!(prevRule && prevRule.dnd);

  if (wantsDnd && !hadDnd) {
    const timestamp = new Date().toISOString();
    const minutes   = minutesUntilTo(rule, config);
    if (minutes < DND_MIN_MINUTES) {
      const reason = minutes < 0 ? 'past_end' : 'below_minimum';
      log({ timestamp, action: 'DND_SKIP', minutes, reason });
      return;
    }
    try {
      const response = await setDnd(minutes);
      log({ timestamp, action: 'DND_START', minutes, httpStatus: response.status });
    } catch (err) {
      console.error('Slack DND start error:', err.message);
      log({ timestamp, action: 'DND_START', minutes, error: err.message });
    }
  } else if (!wantsDnd && hadDnd) {
    const timestamp = new Date().toISOString();
    try {
      const response = await endDnd();
      log({ timestamp, action: 'DND_END', httpStatus: response.status });
    } catch (err) {
      console.error('Slack DND end error:', err.message);
      log({ timestamp, action: 'DND_END', error: err.message });
    }
  }
}

async function setStatus(rule, config, prevRule = null) {
  const response = await axios.post(
    SLACK_PROFILE,
    { profile: { status_text: rule.text, status_emoji: rule.emoji, status_expiration: getExpiration(rule, config) } },
    { headers: authHeaders() }
  );
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);

  await applyPresenceSideEffect(rule, prevRule);
  await applyDndSideEffect(rule, config, prevRule);

  return response;
}

async function clearStatus(prevRule = null) {
  const response = await axios.post(
    SLACK_PROFILE,
    { profile: { status_text: '', status_emoji: '', status_expiration: 0 } },
    { headers: authHeaders() }
  );
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);

  await applyPresenceSideEffect(null, prevRule);
  await applyDndSideEffect(null, null, prevRule);

  return response;
}

module.exports = { setStatus, clearStatus };
