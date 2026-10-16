const { defaults } = require("../config/departments");
const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      default: "Starlit Steel Building Solution",
      trim: true,
    },

    plantName: {
      type: String,
      default: "Production Floor",
      trim: true,
    },

    departments: {
      type: [
        {
          name: {
            type: String,
            required: true,
          },
          unit: {
            type: String,
            default: "",
          },
          active: {
            type: Boolean,
            default: true,
          },
        },
      ],
      default: () => defaults.map(department => ({ ...department })),
    },

    shifts: {
      type: [
        {
          name: String,
          startTime: String,
          endTime: String,
        },
      ],
      default: [
        {
          name: "Day",
          startTime: "08:00",
          endTime: "20:00",
        },
        {
          name: "Night",
          startTime: "20:00",
          endTime: "08:00",
        },
      ],
    },

    reportPreferences: {
      reportTitle: {
        type: String,
        default: "Daily Production Report",
      },
      showEmployeeId: {
        type: Boolean,
        default: true,
      },
      showProject: {
        type: Boolean,
        default: true,
      },
      showRemarks: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);