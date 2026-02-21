const TIME_24_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const TIME_12_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s(AM|PM)$/u;

const parse24ToMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue).split(":").map(Number);
  return hours * 60 + minutes;
};

const parse12ToMinutes = (timeValue) => {
  const match = String(timeValue).trim().match(TIME_12_REGEX);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3];

  let hours24 = hours;
  if (period === "PM" && hours24 !== 12) hours24 += 12;
  if (period === "AM" && hours24 === 12) hours24 = 0;

  return hours24 * 60 + minutes;
};

const minutesTo12 = (totalMinutes) => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const buildSlotsFromSettings = (settings) => {
  const start = parse24ToMinutes(settings.startTime);
  const end = parse24ToMinutes(settings.endTime);
  const breakStart = settings.breakStartTime ? parse24ToMinutes(settings.breakStartTime) : null;
  const breakEnd = settings.breakEndTime ? parse24ToMinutes(settings.breakEndTime) : null;
  const slots = [];

  for (
    let cursor = start;
    cursor + settings.slotDurationMinutes <= end;
    cursor += settings.slotDurationMinutes
  ) {
    const slotEnd = cursor + settings.slotDurationMinutes;
    const inBreak =
      breakStart !== null &&
      breakEnd !== null &&
      !(slotEnd <= breakStart || cursor >= breakEnd);

    if (!inBreak) {
      slots.push(minutesTo12(cursor));
    }
  }

  return slots;
};

const getDateRange = (dateValue) => {
  const start = new Date(dateValue);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
};

module.exports = {
  TIME_24_REGEX,
  TIME_12_REGEX,
  parse24ToMinutes,
  parse12ToMinutes,
  minutesTo12,
  buildSlotsFromSettings,
  getDateRange
};
