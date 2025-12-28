const router = require('express').Router();
const shiftController = require('../controllers/shift.controller');
const auth = require('../middleware/auth.middleware');

// Apply authentication middleware to all routes
router.use(auth);

// Routes
router.post('/', shiftController.createShift);      // Create (Admin only)
router.get('/', shiftController.getAllShifts);      // Read All
router.get('/:id', shiftController.getShiftById);   // Read One
router.put('/:id', shiftController.updateShift);    // Update (Admin only)
router.delete('/:id', shiftController.deleteShift); // Delete (Admin only)

module.exports = router;