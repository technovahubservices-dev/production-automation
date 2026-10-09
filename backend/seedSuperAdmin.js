require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function createSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // Delete existing superadmin
    await User.deleteOne({ username: "superadmin" });

    // Create superadmin again with new password
    const user = await User.create({
      name: "Super Admin",
      username: "superadmin",
      password: "test123",
      role: "superadmin",
      active: true,
    });

    console.log("Super Admin recreated successfully.");
    console.log("Username:", user.username);
    console.log("Role:", user.role);

    // Test the SAME password
    const passwordWorks = await user.comparePassword("test123");

    console.log("Password verification:", passwordWorks);

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error);
    await mongoose.connection.close();
  }
}

createSuperAdmin();