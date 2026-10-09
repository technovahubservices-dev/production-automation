const mongoose = require("mongoose");

/* =========================================
   EDIT / AUDIT HISTORY SCHEMA
========================================= */

const editHistorySchema = new mongoose.Schema(
  {
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    editedByName: {
      type: String,
      required: true,
      trim: true,
    },

    editedByRole: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    editedAt: {
      type: Date,
      default: Date.now,
    },

    previousValues: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    newValues: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    _id: true,
  }
);

/* =========================================
   WORK ENTRY SCHEMA
========================================= */

const workEntrySchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
    },

    employeeName: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: String,
      required: true,
    },

    department: {
      type: String,
      required: true,
      enum: [
        "CNC",
        "PTW",
        "SETTING",
        "WELDING",
        "CLEANING",
      ],
    },

    shift: {
      type: String,
      default: "Day",
    },

    project: {
      type: String,
      trim: true,
      default: "",
    },
    inTime: { type: String, default: "" },
    outTime: { type: String, default: "" },
    hours: { type: Number, required: true, min: 0 },

    // =========================================
    // CNC
    // =========================================

    pageNo: String,
    plateNo: String,
    length: Number,
    width: Number,
    thickness: Number,
    plateWeight: Number,
    cuttingWeight: Number,
    cuttingTime: String,

    // =========================================
    // PTW / SETTING
    // =========================================

    drawingNo: String,
    quantity: Number,
    weight: Number,

    // =========================================
    // WELDING
    // =========================================

    rmt: Number,

    // =========================================
    // WELDING / CLEANING
    // =========================================

    workDescription: String,

    remarks: {
      type: String,
      default: "",
    },

    // =========================================
    // EDIT AUDIT HISTORY
    // =========================================

    editHistory: {
      type: [editHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "WorkEntry",
  workEntrySchema
);