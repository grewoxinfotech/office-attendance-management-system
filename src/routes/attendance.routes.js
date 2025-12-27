const router = require('express').Router();
const auth = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attendance.controller');

// Employee
router.post('/check-in', auth, ctrl.checkIn);
router.post('/check-out', auth, ctrl.checkOut);
router.get('/my', auth, ctrl.getMyAttendance);

// Admin
router.get('/list', auth, ctrl.getAllAttendance);
router.put('/:id', auth, ctrl.updateAttendance);
router.delete('/:id', auth, ctrl.deleteAttendance);

module.exports = router;
