const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Admin = require('../models/admin.model');

/* ===================== LOGIN ===================== */
const login = (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: "Email and password required" });

    // 1. Check if Admin
    Admin.findByEmail(email, (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });

        if (result.length) {
            const admin = result[0];
            if (!bcrypt.compareSync(password, admin.password))
                return res.status(401).json({ message: 'Invalid password' });

            const token = jwt.sign(
                { id: admin.id, role: 'admin' },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            return res.json({
                token,
                user: {
                    id: admin.id,
                    name: admin.name,
                    email: admin.email,
                    role: 'admin',
                    created_at: admin.created_at
                }
            });
        }

        // 2. Check if Employee
        User.findByEmail(email, (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!result.length) return res.status(404).json({ message: 'User not found' });

            const user = result[0];
            if (!bcrypt.compareSync(password, user.password))
                return res.status(401).json({ message: 'Invalid password' });

            const token = jwt.sign(
                { id: user.id, role: 'employee' },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: 'employee',
                    salary: user.salary,
                    shift_id: user.shift_id,
                    created_at: user.created_at
                }
            });
        });
    });
};

/* ===================== REGISTER EMPLOYEE ===================== */
const register = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    const { name, email, password, salary, shift_id } = req.body;

    User.findByEmail(email, (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (result.length) return res.status(409).json({ message: 'Email already exists' });

        const hashed = bcrypt.hashSync(password, 10);
        
        // Pass shift_id (or null if not provided)
        const shiftId = shift_id || null;

        User.createUser([name, email, hashed, salary || 0, 'employee', shiftId], (err, result) => {
            // --- ERROR HANDLING START ---
            if (err) {
                // Catch Foreign Key Constraint Fails (Shift ID doesn't exist)
                if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
                    return res.status(400).json({ 
                        message: `Invalid shift_id: Shift with ID ${shiftId} does not exist.` 
                    });
                }
                return res.status(500).json({ message: 'Create failed', error: err.message });
            }
            // --- ERROR HANDLING END ---

            User.getById(result.insertId, (err, rows) => {
                if (err) return res.status(500).json({ message: 'DB error fetching new user' });
                
                res.status(201).json({
                    message: 'Employee created successfully',
                    data: rows[0]
                });
            });
        });
    });
};

/* ===================== REGISTER ADMIN ===================== */
const registerAdmin = (req, res) => {
    const { name, email, password } = req.body;

    Admin.findByEmail(email, (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (result.length) return res.status(409).json({ message: 'Admin exists' });

        const hashed = bcrypt.hashSync(password, 10);
        Admin.createAdmin([name, email, hashed], (err, result) => {
            if (err) return res.status(500).json({ message: 'Create failed' });

            Admin.findByEmail(email, (err, rows) => {
                if (err) return res.status(500).json({ message: 'DB error' });

                res.status(201).json({
                    message: 'Admin created successfully',
                    data: rows[0]
                });
            });
        });
    });
};

/* ===================== ADMIN: GET ALL USERS ===================== */
const getAllUsers = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    User.getAll((err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });

        res.json({
            total_records: rows.length,
            data: rows
        });
    });
};

/* ===================== ADMIN: GET USER BY ID ===================== */
const getUserById = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    User.getById(req.params.id, (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'User not found' });

        res.json({ data: rows[0] });
    });
};

/* ===================== ADMIN: UPDATE USER ===================== */
const updateUser = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    const { name, email, salary, shift_id } = req.body; 

    User.update(req.params.id, [name, email, salary, shift_id], (err, result) => {
        // --- ERROR HANDLING START ---
        if (err) {
            // Catch Foreign Key Constraint Fails (Shift ID doesn't exist)
            if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
                return res.status(400).json({ 
                    message: `Invalid shift_id: Shift with ID ${shift_id} does not exist.` 
                });
            }
            return res.status(500).json({ message: 'Update failed', error: err.message });
        }
        // --- ERROR HANDLING END ---

        if (!result.affectedRows) return res.status(404).json({ message: 'User not found' });

        // Fetch updated data to return
        User.getById(req.params.id, (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.status(200).json({
                message: 'User updated successfully',
                data: rows[0]
            });
        });
    });
};

/* ===================== ADMIN: DELETE USER ===================== */
const deleteUser = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    User.delete(req.params.id, (err, result) => {
        if (err) return res.status(500).json({ message: 'Delete failed', error: err.message });
        if (!result.affectedRows) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ message: 'User deleted successfully' });
    });
};

/* ===================== ADMIN CRUD ===================== */
const getAllAdmins = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    Admin.getAll((err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });

        res.json({
            total_records: rows.length,
            data: rows
        });
    });
};

const deleteAdmin = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Access denied' });

    Admin.delete(req.params.id, (err, result) => {
        if (err) return res.status(500).json({ message: 'Delete failed', error: err.message });
        if (!result.affectedRows) return res.status(404).json({ message: 'Admin not found' });

        res.status(200).json({ message: 'Admin deleted successfully' });
    });
};

module.exports = {
    login,
    register,
    registerAdmin,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    getAllAdmins,
    deleteAdmin
};