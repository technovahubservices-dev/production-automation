require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // Remove old test admin if one exists
    await User.deleteOne({ username: "admin" });

    // Create normal Admin
    const user = await User.create({
      name: "Production Admin",
      username: "admin",
      password: "admin123",
      role: "admin",
      active: true,
    });

    console.log("Admin created successfully.");
    console.log("Username:", user.username);
    console.log("Role:", user.role);

    // Verify password
    const passwordWorks = await user.comparePassword("admin123");

    console.log("Password verification:", passwordWorks);

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error creating Admin:", error);
    await mongoose.connection.close();
  }
}

createAdmin();