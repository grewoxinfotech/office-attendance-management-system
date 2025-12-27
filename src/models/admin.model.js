const db = require('../config/db');

exports.findByEmail = (email, callback) => {
    const sql = 'SELECT * FROM admins WHERE email = ?';
    db.query(sql, [email], callback);
};

exports.createAdmin = (data, callback) => {
    const sql = 'INSERT INTO admins (name, email, password) VALUES (?, ?, ?)';
    db.query(sql, data, callback);
};

exports.getAll = cb => db.query('SELECT id,name,email FROM admins', cb);
exports.delete = (id, cb) =>
    db.query('DELETE FROM admins WHERE id=?', [id], cb);
