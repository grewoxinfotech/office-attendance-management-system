const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');

// Public routes
router.post('/login', ctrl.login);

// Admin registration
router.post('/register-admin', ctrl.registerAdmin);

// Admin creates employee
router.post('/register', auth, role(['admin']), ctrl.register);

module.exports = router;
