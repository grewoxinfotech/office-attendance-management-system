const express = require('express');
const router = express.Router();
const { calculateSalary } = require('../controllers/payroll.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Assuming you have this

// Route: GET /api/payroll/calculate?user_id=4&month=2025-12
router.get('/calculate', authMiddleware, calculateSalary);

module.exports = router;