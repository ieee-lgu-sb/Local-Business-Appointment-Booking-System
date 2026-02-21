const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
  getAllServicesAdmin,
  createService,
  updateService
} = require("../controllers/serviceController");
const {
  getAdminAvailability,
  updateAvailability
} = require("../controllers/availabilityController");
const {
  getAppointments,
  updateAppointment
} = require("../controllers/appointmentController");
const { getReports } = require("../controllers/reportController");

const router = express.Router();

router.get("/ping", authenticate, requireRole("admin"), (req, res) => {
  res.json({ message: "Admin access granted." });
});

router.get("/services", authenticate, requireRole("admin"), getAllServicesAdmin);
router.post("/services", authenticate, requireRole("admin"), createService);
router.patch("/services/:id", authenticate, requireRole("admin"), updateService);

router.get("/availability", authenticate, requireRole("admin"), getAdminAvailability);
router.patch("/availability", authenticate, requireRole("admin"), updateAvailability);

router.get("/appointments", authenticate, requireRole("admin"), getAppointments);
router.patch("/appointments/:id", authenticate, requireRole("admin"), updateAppointment);
router.get("/reports", authenticate, requireRole("admin"), getReports);

module.exports = router;
