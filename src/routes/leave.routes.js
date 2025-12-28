const express = require('express');
const router = express.Router();
const { applyLeave, getLeaves, updateLeaveStatus } = require('../controllers/leave.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Anyone logged in can see leaves (controller filters data by role)
router.get('/', authMiddleware, getLeaves);

// Employee only
router.post('/apply', authMiddleware, applyLeave);

// Admin only (PUT /api/leaves/5/status)
router.put('/:id/status', authMiddleware, updateLeaveStatus);

module.exports = router;