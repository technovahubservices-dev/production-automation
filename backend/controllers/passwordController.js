const mongoose = require("mongoose");
const User = require("../models/User");

const eligibleRoles = ["admin", "superadmin"];

exports.listAccounts = async (req, res) => {
  try {
    const users = await User.find({ role: { $in: eligibleRoles } })
      .select("_id name username role")
      .sort({ role: 1, name: 1 });
    // Explicit response fields prevent accidental password/hash disclosure.
    return res.json({ success: true, data: users.map((user) => ({
      id: user._id, name: user.name, username: user.username, role: user.role,
    })) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load accounts." });
  }
};

exports.resetPassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body || {};
  if (!mongoose.isObjectIdOrHexString(userId)) {
    return res.status(400).json({ success: false, message: "Invalid account ID." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6 || !newPassword.trim()) {
    return res.status(400).json({ success: false, message: "New password must contain at least 6 characters and cannot be blank." });
  }
  // bcrypt uses at most 72 bytes; reject longer input instead of silently truncating.
  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ success: false, message: "New password must not exceed 72 UTF-8 bytes." });
  }
  try {
    const user = await User.findById(userId);
    if (!user || !eligibleRoles.includes(user.role)) {
      return res.status(404).json({ success: false, message: "Eligible account not found." });
    }
    user.password = newPassword;
    // User's existing pre-save hook hashes the password exactly once.
    await user.save();
    return res.json({ success: true, message: "Password updated successfully." });
  } catch {
    // Validation/database errors can contain password values. Do not log them.
    return res.status(500).json({ success: false, message: "Unable to update password." });
  }
};
