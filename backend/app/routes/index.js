const express = require("express");
const authRoutes = require("./auth");
const adminRoutes = require("./admin");
const appointmentRoutes = require("./appointments");
const serviceRoutes = require("./services");
const availabilityRoutes = require("./availability");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/services", serviceRoutes);
router.use("/availability", availabilityRoutes);

module.exports = router;
