const express = require("express");
const cors = require("cors");
const { corsOptions } = require('./config/cors');

// Keep the HTTP stack testable without loading .env or connecting to MongoDB.
function createApp(env = process.env) {
  const app = express();

  app.use(cors(corsOptions(env)));
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

  return app;
}

module.exports = { createApp };
