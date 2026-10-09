const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendLoginNotification } = require("../utils/emailService");

// Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "12h",
    }
  );
};

// ======================================================
// LOGIN
// POST /api/auth/login
// ======================================================

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const user = await User.findOne({
      username: username.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    const token = generateToken(user);

    if (["admin", "superadmin"].includes(user.role)) {
      try {
        await sendLoginNotification({
          name: user.name,
          username: user.username,
          role: user.role,
          loginAt: new Date(),
        });
      } catch {
        // SMTP errors can contain credentials or server responses. Never log them.
        console.error("Login email failed: notification could not be sent.");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",

      token,

      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to login.",
    });
  }
};
