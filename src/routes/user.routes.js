const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');

// Admin-only user CRUD
router.get('/users', auth, role(['admin']), ctrl.getAllUsers);
router.get('/users/:id', auth, role(['admin']), ctrl.getUserById);
router.put('/users/:id', auth, role(['admin']), ctrl.updateUser);
router.delete('/users/:id', auth, role(['admin']), ctrl.deleteUser);

// Admin-only admin management
router.get('/admins', auth, role(['admin']), ctrl.getAllAdmins);
router.delete('/admins/:id', auth, role(['admin']), ctrl.deleteAdmin);

module.exports = router;
