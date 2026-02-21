const express = require("express");
const { authenticate } = require("../middleware/auth");
const {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment
} = require("../controllers/appointmentController");

const router = express.Router();

router.post("/", authenticate, createAppointment);
router.get("/", authenticate, getAppointments);
router.get("/:id", authenticate, getAppointmentById);
router.patch("/:id", authenticate, updateAppointment);

module.exports = router;
