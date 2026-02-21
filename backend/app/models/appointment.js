const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true
    },
    appointmentDate: {
      type: Date,
      required: true
    },
    startTime: {
      type: String,
      required: true,
      trim: true
    },
    endTime: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rescheduled", "cancelled", "completed"],
      default: "pending"
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

appointmentSchema.index({ customer: 1, appointmentDate: 1 });
appointmentSchema.index({ service: 1, appointmentDate: 1 });
appointmentSchema.index({ appointmentDate: 1, startTime: 1, status: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
