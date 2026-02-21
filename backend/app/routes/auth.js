const express = require("express");
const { signup, login, signupAdmin, loginAdmin } = require("../controllers/authController");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/admin/signup", signupAdmin);
router.post("/admin/login", loginAdmin);

module.exports = router;
