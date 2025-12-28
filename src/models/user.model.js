const db = require('../config/db');

const User = {
    // Create a new user with an optional shift_id
    createUser: (data, cb) => {
        // data order: [name, email, password, salary, role, shift_id]
        const sql = `
            INSERT INTO users (name, email, password, salary, role, shift_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.query(sql, data, cb);
    },

    // Find a user by email (used for Login)
    findByEmail: (email, cb) => {
        const sql = 'SELECT * FROM users WHERE email = ?';
        db.query(sql, [email], cb);
    },

    // Get all users with their Shift Name and Timing
    getAll: (cb) => {
        const sql = `
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.salary, 
                u.role, 
                u.shift_id, 
                s.name as shift_name, 
                s.start_time, 
                s.end_time,
                u.created_at
            FROM users u 
            LEFT JOIN shifts s ON u.shift_id = s.id
            ORDER BY u.id DESC
        `;
        db.query(sql, cb);
    },

    // Get a single user by ID with Shift details
    getById: (id, cb) => {
        const sql = `
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.salary, 
                u.role, 
                u.shift_id,
                s.name as shift_name, 
                s.start_time, 
                s.end_time,
                u.created_at
            FROM users u 
            LEFT JOIN shifts s ON u.shift_id = s.id 
            WHERE u.id = ?
        `;
        db.query(sql, [id], cb);
    },

    // Update user details including shift
    update: (id, data, cb) => {
        // data order: [name, email, salary, shift_id]
        const sql = `
            UPDATE users 
            SET name = ?, email = ?, salary = ?, shift_id = ? 
            WHERE id = ?
        `;
        db.query(sql, [...data, id], (err, result) => {
            cb(err, result);
        });
    },

    // Delete a user
    delete: (id, cb) => {
        const sql = 'DELETE FROM users WHERE id = ?';
        db.query(sql, [id], (err, result) => {
            cb(err, result);
        });
    }
};

module.exports = User;