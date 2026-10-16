const Worker = require("../models/Worker");

exports.createWorker = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      phone,
      designation,
      status,
    } = req.body;

    if (typeof employeeId !== "string" || !employeeId.trim() || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Employee ID and employee name are required.",
      });
    }

    if (status !== undefined && !["Active", "Inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive." });
    }

    const existingWorker = await Worker.findOne({
      employeeId: employeeId.trim().toUpperCase(),
    });

    if (existingWorker) {
      return res.status(400).json({
        success: false,
        message:
          "This Employee ID already exists.",
      });
    }

    const worker = await Worker.create({
      employeeId,
      name,
      phone,
      designation,
      status,
    });

    res.status(201).json({
      success: true,
      message: "Worker added successfully.",
      data: worker,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This Employee ID already exists." });
    console.log("Create worker error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to add worker.",
    });
  }
};

exports.getWorkers = async (req, res) => {
  try {
    const filter = req.user?.role === "superadmin" && req.query.includeInactive === "true" ? {} : { status: "Active" };
    const workers = await Worker.find(filter).sort({
      employeeId: 1,
    });

    res.status(200).json({
      success: true,
      count: workers.length,
      data: workers,
    });
  } catch (error) {
    console.log("Get workers error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve workers.",
    });
  }
};
exports.updateWorker = async (req, res) => {
  try {
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      Object.fromEntries(["employeeId", "name", "phone", "designation", "status"].filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]])),
      {
        new: true,
        runValidators: true,
      }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Worker updated successfully.",
      data: worker,
    });
  } catch (error) {
    console.log("Update worker error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update worker.",
    });
  }
};

exports.deleteWorker = async (req, res) => {
  try {
    /*
      We do not permanently delete the worker.
      Existing production history must remain valid.
    */

    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      {
        status: "Inactive",
      },
      {
        new: true,
      }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Worker deactivated successfully.",
      data: worker,
    });
  } catch (error) {
    console.log("Deactivate worker error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to deactivate worker.",
    });
  }
};