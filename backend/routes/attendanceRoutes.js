const express = require('express');
const Worker = require('../models/Worker');
const AttendanceSession = require('../models/AttendanceSession');
const { protect } = require('../middleware/authMiddleware');
const { biometricServiceAuth } = require('../middleware/biometricServiceAuth');
const { ingest, indiaDate, summarize } = require('../services/attendanceService');
const router = express.Router();
router.get('/employees/:employeeId', biometricServiceAuth, async (req, res) => {
  try {
    const worker = await Worker.findOne({ employeeId: req.params.employeeId.trim().toUpperCase(), status: 'Active' }).lean();
    if (!worker) return res.status(404).json({ success: false, message: 'Active Starlit employee not found.' });
    res.json({ success: true, data: { workerId: String(worker._id), employeeId: worker.employeeId, name: worker.name, status: worker.status } });
  } catch { res.status(500).json({ success: false, message: 'Employee lookup failed.' }); }
});
router.post('/biometric', biometricServiceAuth, async (req, res) => {
  try { res.json({ success: true, data: await ingest(req.body) }); }
  catch (error) { res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'Attendance unavailable. A MongoDB replica set is required; delivery will retry.' }); }
});
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
router.get('/', protect, async (req, res) => {
  try {
    const { date, month, employeeId, status } = req.query;
    if (date && month || date !== undefined && !validDate(date) || month !== undefined && (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) ||
        employeeId !== undefined && typeof employeeId !== 'string' || status !== undefined && !['Checked In', 'Checked Out'].includes(status))
      return res.status(400).json({ success: false, message: 'Provide a valid date or month and attendance filters.' });
    const today = indiaDate();
    if (req.user.role !== 'superadmin' && (month !== undefined || date !== undefined && date !== today))
      return res.status(403).json({ success: false, message: 'Only superadmins can view historical or monthly attendance.' });
    const attendanceDate = month ? { $gte: `${month}-01`, $lte: `${month}-31` } : date || today;
    const filter = { attendanceDate };
    if (employeeId) filter.employeeId = employeeId.trim().toUpperCase();
    if (status) filter.status = status;
    const rows = await AttendanceSession.find(filter).sort({ checkIn: 1 }).lean();
    // Open overnight sessions may have a check-in date outside the chosen report period.
    const openFilter = { status: 'Checked In' };
    if (employeeId) openFilter.employeeId = employeeId.trim().toUpperCase();
    const openSessions = req.user.role === 'superadmin' ? await AttendanceSession.find(openFilter).sort({ checkIn: 1 }).lean() : [];
    const employees = await Worker.find({ status: 'Active', ...(employeeId ? { employeeId: employeeId.trim().toUpperCase() } : {}) }).select('employeeId name').lean();
    res.json({ success: true, data: rows, summary: summarize(rows), openSessions, employees, generatedAt: new Date(), timezone: 'Asia/Kolkata' });
  } catch { res.status(500).json({ success: false, message: 'Unable to load attendance.' }); }
});
module.exports = router;
