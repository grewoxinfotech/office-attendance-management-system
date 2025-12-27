const db = require('../config/db');

exports.createUser = (data, cb) => {
    const sql = `
    INSERT INTO users (name, email, password, salary, role)
    VALUES (?, ?, ?, ?, ?)
  `;
    db.query(sql, data, cb);
};

exports.findByEmail = (email, cb) => {
    db.query(
        'SELECT * FROM users WHERE email = ?',
        [email],
        cb
    );
};

exports.getAll = cb => db.query('SELECT id,name,email,salary,role FROM users', cb);
exports.getById = (id, cb) => db.query('SELECT * FROM users WHERE id=?', [id], cb);
exports.update = (id, data, cb) => {
    db.query(
        'UPDATE users SET name=?, email=?, salary=? WHERE id=?',
        [...data, id],
        (err, result) => {
            cb(err, result); // <-- explicitly pass result
        }
    );
};

exports.delete = (id, cb) => {
    db.query(
        'DELETE FROM users WHERE id=?',
        [id],
        (err, result) => {
            cb(err, result); // <-- explicitly pass result
        }
    );
};
