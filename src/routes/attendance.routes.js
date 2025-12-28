const router = require('express').Router();
const auth = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attendance.controller');

/* ===================== EMPLOYEE ROUTES ===================== */
// Check-In (Blocks on Holidays/Weekends)
router.post('/check-in', auth, ctrl.checkIn);

// Check-Out
router.post('/check-out', auth, ctrl.checkOut);

// View My Attendance
router.get('/my-attendance', auth, ctrl.getMyAttendance);


/* ===================== ADMIN ROUTES ===================== */
// Get All Attendance (with filters)
router.get('/', auth, ctrl.getAllAttendance);

// Manually Add Attendance Record (NEW)
router.post('/add', auth, ctrl.addAttendance);

// Mark Leave (Paid/Unpaid/Half)
router.post('/mark-leave', auth, ctrl.markLeave);

// Update/Edit Attendance Record
router.put('/:id', auth, ctrl.updateAttendance);

// Delete Attendance Record
router.delete('/:id', auth, ctrl.deleteAttendance);

module.exports = router;