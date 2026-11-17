const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { createApp } = require('./app');

dotenv.config();

const app = createApp();

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
