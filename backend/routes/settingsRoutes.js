const express = require("express");

const {
  getSettings,
  updateSettings,
} = require("../controllers/settingsController");

const { protect, superAdminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getSettings);

router.put("/", protect, superAdminOnly, updateSettings);

module.exports = router;