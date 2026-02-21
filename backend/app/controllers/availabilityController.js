const Availability = require("../models/availability");
const { TIME_24_REGEX, buildSlotsFromSettings } = require("../utils/scheduling");

const DEFAULT_SETTINGS = {
  key: "default",
  startTime: "09:00",
  endTime: "17:00",
  slotDurationMinutes: 60,
  workingDays: [1, 2, 3, 4, 5, 6],
  breakStartTime: "13:00",
  breakEndTime: "14:00"
};

const ensureSettings = async () => {
  let settings = await Availability.findOne({ key: "default" });
  if (!settings) {
    settings = await Availability.create(DEFAULT_SETTINGS);
  }
  return settings;
};

const validateUpdatePayload = (payload) => {
  const fieldsToCheck = ["startTime", "endTime", "breakStartTime", "breakEndTime"];

  for (const field of fieldsToCheck) {
    const value = payload[field];
    if (value !== undefined && value !== "" && !TIME_24_REGEX.test(value)) {
      return `${field} must be in HH:mm format.`;
    }
  }

  if (payload.slotDurationMinutes !== undefined) {
    const duration = Number(payload.slotDurationMinutes);
    if (!Number.isInteger(duration) || duration < 15) {
      return "slotDurationMinutes must be an integer >= 15.";
    }
  }

  if (payload.workingDays !== undefined) {
    const valid =
      Array.isArray(payload.workingDays) &&
      payload.workingDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (!valid) {
      return "workingDays must be an array with values between 0 and 6.";
    }
  }

  return "";
};

const getPublicAvailability = async (req, res) => {
  try {
    const settings = await ensureSettings();
    return res.status(200).json({
      availability: {
        startTime: settings.startTime,
        endTime: settings.endTime,
        slotDurationMinutes: settings.slotDurationMinutes,
        workingDays: settings.workingDays,
        breakStartTime: settings.breakStartTime,
        breakEndTime: settings.breakEndTime,
        slots: buildSlotsFromSettings(settings)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch availability." });
  }
};

const getAdminAvailability = async (req, res) => {
  try {
    const settings = await ensureSettings();
    return res.status(200).json({
      availability: {
        id: settings._id,
        startTime: settings.startTime,
        endTime: settings.endTime,
        slotDurationMinutes: settings.slotDurationMinutes,
        workingDays: settings.workingDays,
        breakStartTime: settings.breakStartTime,
        breakEndTime: settings.breakEndTime,
        slots: buildSlotsFromSettings(settings)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch availability." });
  }
};

const updateAvailability = async (req, res) => {
  try {
    const validationError = validateUpdatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const settings = await ensureSettings();
    const allowedFields = [
      "startTime",
      "endTime",
      "slotDurationMinutes",
      "workingDays",
      "breakStartTime",
      "breakEndTime"
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();

    return res.status(200).json({
      message: "Availability updated successfully.",
      availability: {
        id: settings._id,
        startTime: settings.startTime,
        endTime: settings.endTime,
        slotDurationMinutes: settings.slotDurationMinutes,
        workingDays: settings.workingDays,
        breakStartTime: settings.breakStartTime,
        breakEndTime: settings.breakEndTime,
        slots: buildSlotsFromSettings(settings)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update availability." });
  }
};

module.exports = {
  getPublicAvailability,
  getAdminAvailability,
  updateAvailability
};
