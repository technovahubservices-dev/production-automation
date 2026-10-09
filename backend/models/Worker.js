const mongoose = require("mongoose");

/* =========================================
   WORKER SCHEMA
========================================= */

const workerSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, "Employee ID is required."],
      unique: true,
      trim: true,
      uppercase: true,
    },

    name: {
      type: String,
      required: [true, "Employee name is required."],
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    designation: {
      type: String,
      trim: true,
      default: "Worker",
    },

    /*
      IMPORTANT:
      We are NOT storing department here.

      A worker is not permanently assigned to
      CNC / PTW / SETTING / WELDING / CLEANING.

      Department is stored inside WorkEntry
      because the same worker can work in
      different departments on the same day.
    */

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================
   NORMALIZE EMPLOYEE ID
========================================= */

workerSchema.pre("save", function () {
  if (this.employeeId) {
    this.employeeId = this.employeeId
      .trim()
      .toUpperCase();
  }
});

/* =========================================
   CREATE MODEL
========================================= */

const Worker = mongoose.model(
  "Worker",
  workerSchema
);

module.exports = Worker;