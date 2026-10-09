const express = require("express");
const router = express.Router();

const { login } = require("../controllers/authController");
const { protect, superAdminOnly } = require("../middleware/authMiddleware");
const { listAccounts, resetPassword } = require("../controllers/passwordController");

// Login
router.post("/login", login);
router.get("/users", protect, superAdminOnly, listAccounts);
router.patch("/users/:userId/password", protect, superAdminOnly, resetPassword);

module.exports = router;
