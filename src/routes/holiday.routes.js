const express = require('express');
const router = express.Router();
const { getCalendar, addRule, deleteRule, updateRule } = require('../controllers/holiday.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/', authMiddleware, getCalendar);       // Get everything
router.post('/', authMiddleware, addRule);          // Add any type
router.put('/:id', authMiddleware, updateRule); // New Route
router.delete('/:id', authMiddleware, deleteRule);  // Delete by ID

module.exports = router;