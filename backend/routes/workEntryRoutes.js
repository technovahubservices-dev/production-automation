const express = require("express");

const {
  protect,
  superAdminOnly,
} = require("../middleware/authMiddleware");

const {
  createWorkEntry,
  getWorkEntries,
  updateWorkEntry,
  deleteWorkEntry,
} = require("../controllers/workEntryController");

const router = express.Router();

/* =========================================
   GET WORK ENTRIES
   Admin      -> Today only (controller)
   Superadmin -> All / filtered records
========================================= */

router.get("/", protect, getWorkEntries);

/* =========================================
   CREATE WORK ENTRY
   Admin      -> Today only
   Superadmin -> Any allowed date
========================================= */

router.post("/", protect, createWorkEntry);

/* =========================================
   UPDATE WORK ENTRY
   SUPER ADMIN ONLY
========================================= */

router.patch(
  "/:id",
  protect,
  superAdminOnly,
  updateWorkEntry
);

/* =========================================
   DELETE WORK ENTRY
   DISABLED FOR EVERYONE
========================================= */

router.delete(
  "/:id",
  protect,
  deleteWorkEntry
);

module.exports = router;