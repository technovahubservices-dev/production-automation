const express = require("express");

const {
  createWorker,
  getWorkers,
  updateWorker,
  deleteWorker,
} = require("../controllers/workerController");

const { protect, superAdminOnly } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);

router.get("/", getWorkers);

router.post("/", superAdminOnly, createWorker);

router.patch("/:id", superAdminOnly, updateWorker);

router.delete("/:id", superAdminOnly, deleteWorker);

module.exports = router;