const Attendance = require('../models/attendance.model');
const db = require('../config/db');

/* ===================== EMPLOYEE CHECK-IN ===================== */
const checkIn = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    const now = new Date();
    const location = req.body?.location || 'Office';

    const shiftStart = new Date();
    shiftStart.setHours(9, 0, 0, 0);
    const lateThreshold = new Date(shiftStart.getTime() + 10 * 60000);

    const status = now > lateThreshold ? 'late' : 'present';

    Attendance.markIn(userId, now, location, (err) => {
        if (err)
            return res.status(500).json({ msg: 'Check-in failed', error: err.message });

        db.query(
            `SELECT * FROM attendance 
             WHERE user_id = ? AND date = CURDATE()
             ORDER BY id DESC LIMIT 1`,
            [userId],
            (err, rows) => {
                if (err) return res.status(500).json({ msg: 'DB Error' });

                res.json({
                    msg: 'Checked In Successfully',
                    data: rows[0]
                });
            }
        );
    });
};

/* ===================== EMPLOYEE CHECK-OUT ===================== */
const checkOut = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    const now = new Date();

    db.query(
        `SELECT * FROM attendance 
         WHERE user_id = ? AND date = CURDATE()
         ORDER BY id DESC LIMIT 1`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ msg: 'DB Error' });
            if (!rows.length) return res.status(400).json({ msg: 'No check-in found today' });

            const attendanceId = rows[0].id;

            db.query(
                `UPDATE attendance
                 SET 
                    out_time = ?,
                    hours_worked = ROUND(TIMESTAMPDIFF(MINUTE, in_time, ?) / 60, 2),
                    overtime = GREATEST(
                        ROUND(TIMESTAMPDIFF(MINUTE, '18:30:00', ?) / 60, 2),
                        0
                    )
                 WHERE id = ?`,
                [now, now, now, attendanceId],
                (err) => {
                    if (err) return res.status(500).json({ msg: 'Check-out failed' });

                    db.query(
                        'SELECT * FROM attendance WHERE id = ?',
                        [attendanceId],
                        (err, rows) => {
                            if (err) return res.status(500).json({ msg: 'DB Error' });

                            res.json({
                                msg: 'Checked Out Successfully',
                                data: rows[0]
                            });
                        }
                    );
                }
            );
        }
    );
};

/* ===================== ADMIN: GET ALL ATTENDANCE (DAY-WISE) ===================== */
const getAllAttendance = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ msg: 'Access denied' });

    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const userId = req.query.user_id || req.query.user_Id || null;

    console.log('Admin GET Attendance params:', { month, userId }); // DEBUG

    let sql = `
        SELECT 
            u.id AS user_id,
            u.name,
            u.email,
            u.role,
            a.date,
            a.in_time,
            a.out_time,
            a.hours_worked,
            a.overtime,
            a.status,
            a.location,
            a.notes
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE DATE_FORMAT(a.date, '%Y-%m') = ?
    `;

    const params = [month];

    if (userId) {
        const uid = parseInt(userId);
        if (!isNaN(uid)) {
            sql += ' AND u.id = ?';
            params.push(uid);
        }
    }

    sql += ' ORDER BY u.name ASC, a.date ASC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });

        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.user_id]) {
                grouped[row.user_id] = {
                    user_id: row.user_id,
                    name: row.name,
                    email: row.email,
                    role: row.role,
                    attendance: []
                };
            }

            grouped[row.user_id].attendance.push({
                date: row.date,
                in_time: row.in_time,
                out_time: row.out_time,
                hours_worked: Number(row.hours_worked || 0),
                overtime: Number(row.overtime || 0),
                status: row.status,
                location: row.location,
                notes: row.notes
            });
        });

        res.status(200).json({
            month,
            total_users: Object.keys(grouped).length,
            data: Object.values(grouped)
        });
    });
};



/* ===================== EMPLOYEE: MY ATTENDANCE (DAY-WISE) ===================== */
const getMyAttendance = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    // optional query param: ?month=YYYY-MM
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    db.query(
        `SELECT 
            date,
            in_time,
            out_time,
            hours_worked,
            overtime,
            status,
            location,
            notes
         FROM attendance
         WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
         ORDER BY date ASC`,
        [userId, month],
        (err, results) => {
            if (err)
                return res.status(500).json({ msg: 'DB Error', error: err.message });

            // Map day-wise attendance
            const attendance = results.map(row => ({
                date: row.date,
                in_time: row.in_time,
                out_time: row.out_time,
                hours_worked: Number(row.hours_worked || 0),
                overtime: Number(row.overtime || 0),
                status: row.status,
                location: row.location,
                notes: row.notes
            }));

            res.status(200).json({
                month,
                total_days: attendance.length,
                data: attendance
            });
        }
    );
};



/* ===================== ADMIN: UPDATE ATTENDANCE ===================== */
const updateAttendance = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params;
    const { in_time, out_time, status, notes } = req.body;

    db.query(
        `UPDATE attendance
         SET 
            in_time = COALESCE(?, in_time),
            out_time = COALESCE(?, out_time),
            status = COALESCE(?, status),
            notes = COALESCE(?, notes),
            hours_worked = ROUND(
                TIMESTAMPDIFF(MINUTE, in_time, out_time) / 60, 2
            )
         WHERE id = ?`,
        [in_time, out_time, status, notes, id],
        (err, result) => {
            if (err)
                return res.status(500).json({ msg: 'Update failed', error: err.message });

            if (!result.affectedRows)
                return res.status(404).json({ msg: 'Record not found' });

            db.query(
                'SELECT * FROM attendance WHERE id = ?',
                [id],
                (err, rows) => {
                    if (err) return res.status(500).json({ msg: 'DB Error' });

                    res.json({
                        msg: 'Attendance updated successfully',
                        data: rows[0]
                    });
                }
            );
        }
    );
};

/* ===================== ADMIN: DELETE ATTENDANCE ===================== */
const deleteAttendance = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params;

    db.query(
        'DELETE FROM attendance WHERE id = ?',
        [id],
        (err, result) => {
            if (err)
                return res.status(500).json({ msg: 'Delete failed', error: err.message });

            if (!result.affectedRows)
                return res.status(404).json({ msg: 'Record not found' });

            res.json({ msg: 'Attendance deleted successfully' });
        }
    );
};

module.exports = {
    checkIn,
    checkOut,
    getAllAttendance,
    getMyAttendance,
    updateAttendance,
    deleteAttendance
};
