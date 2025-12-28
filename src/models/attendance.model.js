const db = require('../config/db');

exports.markIn = (userId, time, location, shiftStart, shiftEnd, cb) => {
    const sql = `
        INSERT INTO attendance (user_id, in_time, location, shift_start, shift_end)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [userId, time, location, shiftStart, shiftEnd], cb);
};

exports.markOut = (userId, time, cb) => {
    // Note: The controller handles check-out logic to calculate hours/OT dynamically.
    // This model function is kept for reference or alternative DB updates.
    
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
        
        const shiftEnd = record.shift_end ? new Date(record.shift_end) : new Date(record.date + ' 18:30:00');
        
        if (time > shiftEnd) {
            overtime = ((time - shiftEnd) / 3600000).toFixed(2);
        }

        const updateSQL = `
            UPDATE attendance
            SET out_time = ?, hours_worked = ?, overtime = ?
            WHERE id = ?
        `;

        db.query(
            updateSQL,
            [time, hoursWorked, overtime, record.id],
            err => {
                if (err) return cb(err);
                cb(null, { in_time: inTime, hoursWorked, overtime });
            }
        );
    });
};