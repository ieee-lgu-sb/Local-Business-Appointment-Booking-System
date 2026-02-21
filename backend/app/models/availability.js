const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default"
    },
    startTime: {
      type: String,
      required: true,
      default: "09:00"
    },
    endTime: {
      type: String,
      required: true,
      default: "17:00"
    },
    slotDurationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: 15
    },
    workingDays: {
      type: [Number],
      default: [1, 2, 3, 4, 5, 6],
      validate: {
        validator: (days) => days.every((day) => day >= 0 && day <= 6),
        message: "workingDays must contain values between 0 and 6."
      }
    },
    breakStartTime: {
      type: String,
      default: ""
    },
    breakEndTime: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Availability", availabilitySchema);
