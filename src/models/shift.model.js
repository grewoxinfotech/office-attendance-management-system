const db = require('../config/db');

const Shift = {
    create: (data, callback) => {
        const sql = 'INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)';
        db.query(sql, [data.name, data.start_time, data.end_time], callback);
    },

    findAll: (callback) => {
        const sql = 'SELECT * FROM shifts ORDER BY id ASC';
        db.query(sql, callback);
    },

    findById: (id, callback) => {
        const sql = 'SELECT * FROM shifts WHERE id = ?';
        db.query(sql, [id], callback);
    },

    update: (id, data, callback) => {
        const sql = 'UPDATE shifts SET name = ?, start_time = ?, end_time = ? WHERE id = ?';
        db.query(sql, [data.name, data.start_time, data.end_time, id], callback);
    },

    delete: (id, callback) => {
        const sql = 'DELETE FROM shifts WHERE id = ?';
        db.query(sql, [id], callback);
    }
};

module.exports = Shift;