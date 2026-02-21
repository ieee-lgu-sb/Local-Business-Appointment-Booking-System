const mongoose = require("mongoose");
const Appointment = require("../models/appointment");
const Service = require("../models/service");
const User = require("../models/user");
const Availability = require("../models/availability");
const {
  TIME_12_REGEX,
  parse12ToMinutes,
  parse24ToMinutes,
  buildSlotsFromSettings,
  getDateRange
} = require("../utils/scheduling");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const canAccessAppointment = (appointment, user) =>
  user.role === "admin" || appointment.customer.toString() === user._id.toString();

const DEFAULT_AVAILABILITY_SETTINGS = {
  key: "default",
  startTime: "09:00",
  endTime: "17:00",
  slotDurationMinutes: 60,
  workingDays: [1, 2, 3, 4, 5, 6],
  breakStartTime: "13:00",
  breakEndTime: "14:00"
};

const ensureAvailabilitySettings = async () => {
  let settings = await Availability.findOne({ key: "default" });
  if (!settings) {
    settings = await Availability.create(DEFAULT_AVAILABILITY_SETTINGS);
  }
  return settings;
};

const validateTimeRange = (startTime, endTime) => {
  if (!TIME_12_REGEX.test(startTime) || !TIME_12_REGEX.test(endTime)) {
    return {
      valid: false,
      message: "startTime and endTime must be in hh:mm AM/PM format."
    };
  }

  const startMinutes = parse12ToMinutes(startTime);
  const endMinutes = parse12ToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return {
      valid: false,
      message: "Invalid time range. endTime must be after startTime."
    };
  }

  return { valid: true, startMinutes, endMinutes };
};

const validateSlotAgainstAvailability = async ({ appointmentDate, startTime, endTime }) => {
  const settings = await ensureAvailabilitySettings();
  const parsedTimeRange = validateTimeRange(startTime, endTime);
  if (!parsedTimeRange.valid) {
    return parsedTimeRange;
  }

  const { startMinutes, endMinutes } = parsedTimeRange;
  const openMinutes = parse24ToMinutes(settings.startTime);
  const closeMinutes = parse24ToMinutes(settings.endTime);
  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    return {
      valid: false,
      message: "Selected time is outside working hours."
    };
  }

  if (settings.breakStartTime && settings.breakEndTime) {
    const breakStart = parse24ToMinutes(settings.breakStartTime);
    const breakEnd = parse24ToMinutes(settings.breakEndTime);
    const overlapsBreak = !(endMinutes <= breakStart || startMinutes >= breakEnd);
    if (overlapsBreak) {
      return {
        valid: false,
        message: "Selected time overlaps business break hours."
      };
    }
  }

  const appointmentDay = new Date(appointmentDate).getDay();
  if (!settings.workingDays.includes(appointmentDay)) {
    return {
      valid: false,
      message: "Selected date is outside configured working days."
    };
  }

  const validSlots = buildSlotsFromSettings(settings);
  if (!validSlots.includes(startTime)) {
    return {
      valid: false,
      message: "Selected startTime is not an available slot."
    };
  }

  return {
    valid: true,
    startMinutes,
    endMinutes
  };
};

const findConflictingAppointment = async ({
  appointmentDate,
  service,
  startMinutes,
  endMinutes,
  excludeAppointmentId = null
}) => {
  const { start, end } = getDateRange(appointmentDate);
  const query = {
    appointmentDate: { $gte: start, $lt: end },
    service,
    status: { $ne: "cancelled" }
  };
  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const sameDayAppointments = await Appointment.find(query).select("startTime endTime");
  const conflict = sameDayAppointments.find((item) => {
    const existingStart = parse12ToMinutes(item.startTime);
    const existingEnd = parse12ToMinutes(item.endTime);
    if (existingStart === null || existingEnd === null) {
      return false;
    }
    return startMinutes < existingEnd && endMinutes > existingStart;
  });

  return conflict || null;
};

const createAppointment = async (req, res) => {
  try {
    const { service, serviceName, appointmentDate, startTime, endTime, notes, customerId } = req.body;

    if ((!service && !serviceName) || !appointmentDate || !startTime || !endTime) {
      return res.status(400).json({
        message: "Service or serviceName, appointmentDate, startTime, and endTime are required."
      });
    }

    const parsedDate = parseDate(appointmentDate);
    if (!parsedDate) {
      return res.status(400).json({ message: "Invalid appointment date." });
    }

    let serviceDoc = null;
    if (service) {
      if (!isValidObjectId(service)) {
        return res.status(400).json({ message: "Invalid service id." });
      }
      serviceDoc = await Service.findById(service);
    } else if (serviceName) {
      serviceDoc = await Service.findOne({
        name: { $regex: `^${serviceName.trim()}$`, $options: "i" }
      });
    }

    // For UI-only Day 8 integration, allow creating missing service by name.
    if (!serviceDoc && serviceName) {
      serviceDoc = await Service.create({
        name: serviceName.trim(),
        description: "Service created from booking flow",
        durationMinutes: 30,
        price: 0,
        isActive: true
      });
    }

    if (!serviceDoc) {
      return res.status(404).json({ message: "Service not found." });
    }

    let customer = req.user._id;
    if (req.user.role === "admin" && customerId) {
      if (!isValidObjectId(customerId)) {
        return res.status(400).json({ message: "Invalid customer id." });
      }
      const customerDoc = await User.findById(customerId);
      if (!customerDoc || customerDoc.role !== "customer") {
        return res.status(404).json({ message: "Customer not found." });
      }
      customer = customerDoc._id;
    }

    const slotValidation = await validateSlotAgainstAvailability({
      appointmentDate: parsedDate,
      startTime,
      endTime
    });
    if (!slotValidation.valid) {
      return res.status(400).json({ message: slotValidation.message });
    }

    const conflict = await findConflictingAppointment({
      appointmentDate: parsedDate,
      service: serviceDoc._id,
      startMinutes: slotValidation.startMinutes,
      endMinutes: slotValidation.endMinutes
    });
    if (conflict) {
      return res.status(409).json({
        message: "Selected slot is already booked."
      });
    }

    const appointment = await Appointment.create({
      customer,
      service: serviceDoc._id,
      appointmentDate: parsedDate,
      startTime,
      endTime,
      notes
    });

    const populated = await Appointment.findById(appointment._id)
      .populate("customer", "name email phone role")
      .populate("service", "name durationMinutes price");

    return res.status(201).json({
      message: "Appointment created successfully.",
      appointment: populated
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create appointment." });
  }
};

const getAppointments = async (req, res) => {
  try {
    const { status, service, customerId, dateFrom, dateTo } = req.query;
    const filter = {};

    if (req.user.role === "customer") {
      filter.customer = req.user._id;
    }

    if (status) {
      filter.status = status;
    }

    if (service) {
      if (!isValidObjectId(service)) {
        return res.status(400).json({ message: "Invalid service id." });
      }
      filter.service = service;
    }

    if (customerId && req.user.role === "admin") {
      if (!isValidObjectId(customerId)) {
        return res.status(400).json({ message: "Invalid customer id." });
      }
      filter.customer = customerId;
    }

    if (dateFrom || dateTo) {
      filter.appointmentDate = {};
      if (dateFrom) {
        const parsedFrom = parseDate(dateFrom);
        if (!parsedFrom) {
          return res.status(400).json({ message: "Invalid dateFrom value." });
        }
        filter.appointmentDate.$gte = parsedFrom;
      }
      if (dateTo) {
        const parsedTo = parseDate(dateTo);
        if (!parsedTo) {
          return res.status(400).json({ message: "Invalid dateTo value." });
        }
        filter.appointmentDate.$lte = parsedTo;
      }
    }

    const appointments = await Appointment.find(filter)
      .sort({ appointmentDate: 1, startTime: 1 })
      .populate("customer", "name email phone role")
      .populate("service", "name durationMinutes price");

    return res.status(200).json({ appointments });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch appointments." });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid appointment id." });
    }

    const appointment = await Appointment.findById(id)
      .populate("customer", "name email phone role")
      .populate("service", "name durationMinutes price");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    if (!canAccessAppointment(appointment, req.user)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    return res.status(200).json({ appointment });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch appointment." });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid appointment id." });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    if (!canAccessAppointment(appointment, req.user)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const allowedFields =
      req.user.role === "admin"
        ? ["customer", "service", "appointmentDate", "startTime", "endTime", "status", "notes"]
        : ["appointmentDate", "startTime", "endTime", "notes", "status"];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (req.user.role === "customer" && updates.status && updates.status !== "cancelled") {
      return res
        .status(403)
        .json({ message: "Customers can only change status to cancelled." });
    }

    if (updates.service) {
      if (!isValidObjectId(updates.service)) {
        return res.status(400).json({ message: "Invalid service id." });
      }
      const serviceDoc = await Service.findById(updates.service);
      if (!serviceDoc) {
        return res.status(404).json({ message: "Service not found." });
      }
    }

    if (updates.customer) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin can change customer." });
      }
      if (!isValidObjectId(updates.customer)) {
        return res.status(400).json({ message: "Invalid customer id." });
      }
      const customerDoc = await User.findById(updates.customer);
      if (!customerDoc || customerDoc.role !== "customer") {
        return res.status(404).json({ message: "Customer not found." });
      }
    }

    if (updates.appointmentDate) {
      const parsedDate = parseDate(updates.appointmentDate);
      if (!parsedDate) {
        return res.status(400).json({ message: "Invalid appointment date." });
      }
      updates.appointmentDate = parsedDate;
    }

    const nextStatus = updates.status || appointment.status;
    const nextDate = updates.appointmentDate || appointment.appointmentDate;
    const nextService = updates.service || appointment.service;
    const nextStartTime = updates.startTime || appointment.startTime;
    const nextEndTime = updates.endTime || appointment.endTime;
    const shouldValidateSlot = nextStatus !== "cancelled";

    if (shouldValidateSlot) {
      const slotValidation = await validateSlotAgainstAvailability({
        appointmentDate: nextDate,
        startTime: nextStartTime,
        endTime: nextEndTime
      });
      if (!slotValidation.valid) {
        return res.status(400).json({ message: slotValidation.message });
      }

      const conflict = await findConflictingAppointment({
        appointmentDate: nextDate,
        service: nextService,
        startMinutes: slotValidation.startMinutes,
        endMinutes: slotValidation.endMinutes,
        excludeAppointmentId: appointment._id
      });
      if (conflict) {
        return res.status(409).json({
          message: "Selected slot is already booked."
        });
      }
    }

    const updated = await Appointment.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })
      .populate("customer", "name email phone role")
      .populate("service", "name durationMinutes price");

    return res.status(200).json({
      message: "Appointment updated successfully.",
      appointment: updated
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update appointment." });
  }
};

module.exports = {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment
};
