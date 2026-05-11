const axios    = require('axios');
const dayjs    = require('dayjs');
const utc      = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const SLACK_API = 'https://slack.com/api/users.profile.set';

function getExpiration(rule, config) {
  if (!rule.to) return 0;
  const today = dayjs().tz(config.timezone).format('YYYY-MM-DD');
  return dayjs.tz(`${today} ${rule.to}`, config.timezone).unix();
}

async function setStatus(rule, config) {
  const response = await axios.post(
    SLACK_API,
    { profile: { status_text: rule.text, status_emoji: rule.emoji, status_expiration: getExpiration(rule, config) } },
    { headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` } }
  );
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);
  return response;
}

async function clearStatus() {
  const response = await axios.post(
    SLACK_API,
    { profile: { status_text: '', status_emoji: '', status_expiration: 0 } },
    { headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` } }
  );
  if (!response.data.ok) throw new Error(`Slack error: ${response.data.error}`);
  return response;
}

module.exports = { setStatus, clearStatus };
