const SystemSettings = require("../models/SystemSettings");
const WorkEntry = require("../models/WorkEntry");

/* =========================================
   INDIA TODAY DATE
========================================= */

const getIndiaToday = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

/* =========================================
   CREATE WORK ENTRY
========================================= */
const calculateWorkDuration = (inTime, outTime) => {
  if (typeof inTime !== "string" || typeof outTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(inTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(outTime)) {
    return null;
  }

  const [inHour, inMinute] = inTime.split(":").map(Number);
  const [outHour, outMinute] = outTime.split(":").map(Number);

  if (
    !Number.isFinite(inHour) ||
    !Number.isFinite(inMinute) ||
    !Number.isFinite(outHour) ||
    !Number.isFinite(outMinute)
  ) {
    return null;
  }

  let startMinutes = inHour * 60 + inMinute;
  let endMinutes = outHour * 60 + outMinute;

  // Night shift / crosses midnight
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const totalMinutes = endMinutes - startMinutes;

  if (totalMinutes <= 0) {
    return null;
  }

  return {
    totalMinutes,
    hours: Number((totalMinutes / 60).toFixed(2)),
    display: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
  };
};
exports.createWorkEntry = async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      date,
      department,
      inTime,
      outTime,
    } = req.body;

    // -----------------------------------------
    // REQUIRED FIELD VALIDATION
    // -----------------------------------------
    if (!employeeId || !employeeName || !date || !department) {
      return res.status(400).json({
        success: false,
        message:
          "Employee, date and department are required.",
      });
    }

    // -----------------------------------------
    // ADMIN CAN ONLY CREATE TODAY'S ENTRY
    // -----------------------------------------

    if (req.user?.role === "admin") {
      const today = getIndiaToday();

      if (date !== today) {
        return res.status(403).json({
          success: false,
          message:
            "Admin can only create work entries for today.",
        });
      }
    }

    // -----------------------------------------
    // HOURS VALIDATION
    // -----------------------------------------

    const duration = calculateWorkDuration(inTime, outTime);
    if (!duration) {
      return res.status(400).json({ success: false, message: "Valid In Time and Out Time are required." });
    }

    // -----------------------------------------
    // SYSTEM SETTINGS
    // -----------------------------------------

    const settings = await SystemSettings.findOne();

    if (!settings) {
      return res.status(503).json({
        success: false,
        message:
          "Settings unavailable. Load System Settings before creating work entries.",
      });
    }

    // -----------------------------------------
    // DEPARTMENT VALIDATION
    // -----------------------------------------

    const configuredDepartment =
      settings.departments.find(
        (item) => item.name === department
      );

    if (
      !configuredDepartment ||
      configuredDepartment.active !== true
    ) {
      return res.status(400).json({
        success: false,
        message: `${department} department is currently inactive or not configured.`,
      });
    }

    // -----------------------------------------
    // SHIFT VALIDATION
    // -----------------------------------------

    const validShift = settings.shifts.some(
      (shift) => shift.name === req.body.shift
    );

    if (!validShift) {
      return res.status(400).json({
        success: false,
        message: "Select a configured shift.",
      });
    }

    // -----------------------------------------
    // CREATE WORK ENTRY
    // -----------------------------------------
    const workEntry = await WorkEntry.create({
      ...req.body,
      editHistory: [],

      // Admin date is forced again server-side.
      date:
        req.user?.role === "admin"
          ? getIndiaToday()
          : date,

      inTime,
      outTime,
      hours: duration.hours,
    });

    return res.status(201).json({
      success: true,
      message: "Work activity saved successfully.",
      data: workEntry,
    });
  } catch (error) {
    console.error(
      "Create work entry error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to save work activity.",
    });
  }
};

/* =========================================
   GET WORK ENTRIES
========================================= */

exports.getWorkEntries = async (req, res) => {
  try {
    const filter = {};

    // -----------------------------------------
    // ADMIN → TODAY ONLY
    // SUPERADMIN → REQUESTED DATE / ALL DATES
    // -----------------------------------------

    if (req.user?.role === "admin") {
      filter.date = getIndiaToday();
    } else {
      const { date, fromDate, toDate } = req.query;
      const validDate = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if ([date, fromDate, toDate].some((value) => value !== undefined && !validDate(value)) ||
          (fromDate && toDate && fromDate > toDate)) {
        return res.status(400).json({ success: false, message: "Provide valid YYYY-MM-DD dates with From Date on or before To Date." });
      }
      // Exact date takes precedence when both date and range are supplied.
      if (date) filter.date = date;
      else if (fromDate || toDate) {
        filter.date = {};
        if (fromDate) filter.date.$gte = fromDate;
        if (toDate) filter.date.$lte = toDate;
      }
    }

    // -----------------------------------------
    // DEPARTMENT FILTER
    // -----------------------------------------

    if (req.query.department) {
      filter.department = req.query.department;
    }

    // -----------------------------------------
    // EMPLOYEE FILTER
    // -----------------------------------------

    if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }

    // -----------------------------------------
    // FETCH ENTRIES
    // -----------------------------------------

    const entries = await WorkEntry.find(filter).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: entries.length,
      data: entries,
    });
  } catch (error) {
    console.error(
      "Get work entries error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve work activities.",
    });
  }
};

/* =========================================
   UPDATE WORK ENTRY
   SUPER ADMIN ONLY + AUDIT HISTORY
========================================= */

exports.updateWorkEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      editReason,
      editHistory,
      _id,
      createdAt,
      updatedAt,
      __v,
      ...changes
    } = req.body;

    // -----------------------------------------
    // REASON IS MANDATORY
    // -----------------------------------------

    if (
      !editReason ||
      !String(editReason).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Reason for editing is required.",
      });
    }

    // -----------------------------------------
    // FIND EXISTING ENTRY
    // -----------------------------------------

    const existingEntry =
      await WorkEntry.findById(id);

    if (!existingEntry) {
      return res.status(404).json({
        success: false,
        message: "Work entry not found.",
      });
    }

    // -----------------------------------------
    // VALIDATE HOURS IF CHANGED
    // -----------------------------------------

    // Numeric hours are server-owned, including for historical entries.
    delete changes.hours;
    if (changes.inTime !== undefined || changes.outTime !== undefined) {
      const duration = calculateWorkDuration(
        changes.inTime !== undefined ? changes.inTime : existingEntry.inTime,
        changes.outTime !== undefined ? changes.outTime : existingEntry.outTime
      );
      if (!duration) {
        return res.status(400).json({ success: false, message: "Please enter valid In Time and Out Time." });
      }
      changes.hours = duration.hours;
    }

    // -----------------------------------------
    // VALIDATE DEPARTMENT / SHIFT IF CHANGED
    // -----------------------------------------

    const settings =
      await SystemSettings.findOne();

    if (!settings) {
      return res.status(503).json({
        success: false,
        message:
          "System settings are unavailable.",
      });
    }

    if (changes.department !== undefined) {
      const configuredDepartment =
        settings.departments.find(
          (item) =>
            item.name === changes.department
        );

      if (
        !configuredDepartment ||
        configuredDepartment.active !== true
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Selected department is inactive or not configured.",
        });
      }
    }

    if (changes.shift !== undefined) {
      const validShift =
        settings.shifts.some(
          (shift) =>
            shift.name === changes.shift
        );

      if (!validShift) {
        return res.status(400).json({
          success: false,
          message:
            "Select a configured shift.",
        });
      }
    }

    // -----------------------------------------
    // FIELDS THAT ARE ALLOWED TO BE EDITED
    // -----------------------------------------

    const allowedFields = [
      "employeeId",
      "employeeName",
      "date",
      "department",
      "shift",
      "project",
      "inTime",
      "outTime",
      "hours",

      // CNC
      "pageNo",
      "plateNo",
      "length",
      "width",
      "thickness",
      "plateWeight",
      "cuttingWeight",
      "cuttingTime",

      // PTW / SETTING
      "drawingNo",
      "quantity",
      "weight",

      // WELDING
      "rmt",

      // WELDING / CLEANING
      "workDescription",

      "remarks",
    ];

    const cleanChanges = {};

    allowedFields.forEach((field) => {
      if (changes[field] !== undefined) {
        cleanChanges[field] =
          changes[field];
      }
    });

    // -----------------------------------------
    // MAKE SURE SOMETHING WAS ACTUALLY CHANGED
    // -----------------------------------------

    const previousValues = {};
    const newValues = {};

    Object.keys(cleanChanges).forEach(
      (field) => {
        const oldValue =
          existingEntry[field];

        const newValue =
          cleanChanges[field];

        if (
          String(oldValue ?? "") !==
          String(newValue ?? "")
        ) {
          previousValues[field] =
            oldValue ?? "";

          newValues[field] =
            newValue ?? "";
        }
      }
    );

    if (
      Object.keys(newValues).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No changes were detected in this work entry.",
      });
    }

    // -----------------------------------------
    // APPLY CHANGES
    // -----------------------------------------

    Object.keys(newValues).forEach(
      (field) => {
        existingEntry[field] =
          newValues[field];
      }
    );

    // -----------------------------------------
    // SAVE AUDIT HISTORY
    // -----------------------------------------

    existingEntry.editHistory.push({
      editedBy: req.user._id,

      editedByName:
        req.user.name ||
        req.user.username ||
        "Super Admin",

      editedByRole: req.user.role,

      reason: String(editReason).trim(),

      editedAt: new Date(),

      previousValues,

      newValues,
    });

    // -----------------------------------------
    // SAVE ENTRY
    // -----------------------------------------

    await existingEntry.save();

    return res.status(200).json({
      success: true,

      message:
        "Work activity updated successfully.",

      data: existingEntry,
    });
  } catch (error) {
    console.error(
      "Update work entry error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to update work activity.",
    });
  }
};
/* =========================================
   DELETE WORK ENTRY
========================================= */

exports.deleteWorkEntry = async (req, res) => {
  try {
    // Deleting production records is not allowed
    // for Admin or Super Admin.

    return res.status(405).json({
      success: false,
      message:
        "Deleting work entries is not allowed.",
    });
  } catch (error) {
    console.error(
      "Delete work entry error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process delete request.",
    });
  }
};