const { defaults, resolveDepartments } = require("../config/departments");
const SystemSettings = require("../models/SystemSettings");

const getDefaultSettings = () => ({
  companyName: "Starlit Steel Building Solution",
  plantName: "Production Floor",

  departments: defaults.map(department => ({ ...department })),

  shifts: [
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

  reportPreferences: {
    reportTitle: "Daily Production Report",
    showEmployeeId: true,
    showProject: true,
    showRemarks: true,
  },
});

exports.getSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = await SystemSettings.create(getDefaultSettings());
    }

    res.status(200).json({
      success: true,
      data: { ...settings.toObject(), departments: resolveDepartments(settings.departments) },
    });
  } catch (error) {
    console.log("Get settings error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load settings.",
    });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = await SystemSettings.create({
        ...getDefaultSettings(),
        ...req.body,
      });
    } else {
      const allowedFields = [
        "companyName",
        "plantName",
        "departments",
        "shifts",
        "reportPreferences",
      ];

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          settings[field] = req.body[field];
        }
      });

      await settings.save();
    }

    res.status(200).json({
      success: true,
      message: "Settings saved successfully.",
      data: { ...settings.toObject(), departments: resolveDepartments(settings.departments) },
    });
  } catch (error) {
    console.log("Update settings error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to save settings.",
    });
  }
};