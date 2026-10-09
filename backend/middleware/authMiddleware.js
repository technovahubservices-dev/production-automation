const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ======================================================
// VERIFY LOGIN TOKEN
// ======================================================

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id).select(
      "-password"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session.",
    });
  }
};

// ======================================================
// SUPER ADMIN ONLY
// ======================================================

const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Super Admin access required.",
    });
  }

  next();
};

module.exports = {
  protect,
  superAdminOnly,
};