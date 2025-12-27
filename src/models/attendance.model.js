const db = require('../config/db');

exports.markIn = (userId, time, location, cb) => {
    const shiftStart = new Date();
    shiftStart.setHours(9, 0, 0, 0);

    const shiftEnd = new Date();
    shiftEnd.setHours(18, 30, 0, 0);

    const sql = `
        INSERT INTO attendance (user_id, in_time, location, shift_start, shift_end)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [userId, time, location, shiftStart, shiftEnd], cb);
};

exports.markOut = (userId, time, cb) => {
    const sql = `
        SELECT * FROM attendance
        WHERE user_id = ? AND date = CURDATE()
        ORDER BY id DESC LIMIT 1
    `;

    db.query(sql, [userId], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(new Error('No check-in found'));

        const record = rows[0];
        const inTime = new Date(record.in_time);

        const hoursWorked = ((time - inTime) / 3600000).toFixed(2);

        let overtime = 0;
        if (time > record.shift_end)
            overtime = ((time - record.shift_end) / 3600000).toFixed(2);

        const lateLimit = new Date(record.shift_start.getTime() + 10 * 60000);
        const status = inTime > lateLimit ? 'late' : 'present';

        const updateSQL = `
            UPDATE attendance
            SET out_time = ?, hours_worked = ?, overtime = ?, status = ?
            WHERE id = ?
        `;

        db.query(
            updateSQL,
            [time, hoursWorked, overtime, status, record.id],
            err => {
                if (err) return cb(err);
                cb(null, { in_time: inTime, hoursWorked, overtime, status });
            }
        );
    });
};
