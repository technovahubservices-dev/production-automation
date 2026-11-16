const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const { corsOptions } = require('./config/cors');

dotenv.config();

const app = express();

app.use(cors(corsOptions()));
app.use((error, _req, res, next) => {
  if (error.status === 403) return res.status(403).json({ success: false, message: 'Origin is not permitted.' });
  next(error);
});

app.use(express.json({ verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
app.use('/api/attendance', require('./routes/attendanceRoutes'));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Starlit Production Automation API is running",
  });
});

app.use(
  "/api/work-entries",
  require("./routes/workEntryRoutes")
);
app.use(
  "/api/workers",
  require("./routes/workerRoutes")
);
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    if (process.env.BIOMETRIC_INTEGRATION_ENABLED === 'true') {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Attendance requires a MongoDB replica set.');
      await Promise.all(['AttendanceSession', 'AttendanceEvent', 'AttendanceCursor'].map(name => mongoose.model(name).init()));
    }
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(async (error) => {
    console.log(
      "MongoDB connection failed:",
      error.message
    );
    await mongoose.disconnect();
    process.exitCode = 1;
  });
