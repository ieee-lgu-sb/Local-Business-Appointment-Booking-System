const express = require("express");
const { getPublicAvailability } = require("../controllers/availabilityController");

const router = express.Router();

router.get("/", getPublicAvailability);

module.exports = router;
