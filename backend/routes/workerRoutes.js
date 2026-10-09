const express = require("express");

const {
  createWorker,
  getWorkers,
  updateWorker,
  deleteWorker,
} = require("../controllers/workerController");

const router = express.Router();

router.get("/", getWorkers);

router.post("/", createWorker);

router.patch("/:id", updateWorker);

router.delete("/:id", deleteWorker);

module.exports = router;