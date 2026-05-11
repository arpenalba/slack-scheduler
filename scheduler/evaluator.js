function floorTo15(hhmm) {
  const [h, m] = hhmm.split(':');
  const floored = Math.floor(parseInt(m, 10) / 15) * 15;
  return `${h}:${floored.toString().padStart(2, '0')}`;
}

function inRange(current, from, to) {
  // from inclusive, to exclusive
  return current >= from && current < to;
}

function evaluate(now, config) {
  const dateToday   = now.format('YYYY-MM-DD');
  const dayToday    = now.format('dddd').toLowerCase();
  const currentTime = floorTo15(now.format('HH:mm'));

  for (const rule of config.once) {
    if (rule.date === dateToday && rule.from && inRange(currentTime, rule.from, rule.to))
      return rule;
  }

  for (const rule of config.once) {
    if (rule.date === dateToday && !rule.from)
      return rule;
  }

  for (const rule of config.weekly) {
    if (rule.days.includes(dayToday) && rule.from && inRange(currentTime, rule.from, rule.to))
      return rule;
  }

  for (const rule of config.weekly) {
    if (rule.days.includes(dayToday) && !rule.from)
      return rule;
  }

  return null;
}

module.exports = { evaluate };
