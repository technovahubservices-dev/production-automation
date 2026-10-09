const Worker = require("../models/Worker");

exports.createWorker = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      phone,
      designation,
    } = req.body;

    if (!employeeId || !name) {
      return res.status(400).json({
        success: false,
        message:
          "Employee ID and employee name are required.",
      });
    }

    const existingWorker = await Worker.findOne({
      employeeId: employeeId.toUpperCase(),
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
    });

    res.status(201).json({
      success: true,
      message: "Worker added successfully.",
      data: worker,
    });
  } catch (error) {
    console.error("Create worker error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to add worker.",
    });
  }
};

exports.getWorkers = async (req, res) => {
  try {
    const workers = await Worker.find({
      status: "Active",
    }).sort({
      employeeId: 1,
    });

    res.status(200).json({
      success: true,
      count: workers.length,
      data: workers,
    });
  } catch (error) {
    console.error("Get workers error:", error);

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
      req.body,
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
    console.error("Update worker error:", error);

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
    console.error("Deactivate worker error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to deactivate worker.",
    });
  }
};