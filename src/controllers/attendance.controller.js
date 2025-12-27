const Attendance = require('../models/attendance.model');
const db = require('../config/db');

// Employee check-in
const checkIn = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    const now = new Date();
    const location = req.body?.location || 'Office';

    // Shift rules
    const shiftStart = new Date();
    shiftStart.setHours(9, 0, 0, 0);          // 9:00 AM
    const lateThreshold = new Date(shiftStart.getTime() + 10 * 60000); // 9:10 AM

    const status = now > lateThreshold ? 'late' : 'present';

    Attendance.markIn(userId, now, location, (err) => {
        if (err) {
            return res.status(500).json({
                msg: 'Check-in failed',
                error: err.message
            });
        }

        res.status(200).json({
            msg: 'Checked In Successfully',
            check_in_time: now,
            shift_start: shiftStart,
            status,
            location
        });
    });
};

// Employee check-out
const checkOut = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    const now = new Date();

    // Shift timings
    const shiftStart = new Date();
    shiftStart.setHours(9, 0, 0, 0);

    const shiftEnd = new Date();
    shiftEnd.setHours(18, 30, 0, 0); // 6:30 PM

    // Fetch today's attendance
    const sql = `
        SELECT * FROM attendance
        WHERE user_id = ? AND date = CURDATE()
        ORDER BY id DESC LIMIT 1
    `;

    db.query(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        if (!rows.length) return res.status(400).json({ msg: 'No check-in found today' });

        const attendance = rows[0];
        const inTime = new Date(attendance.in_time);

        // Calculate hours worked
        const hoursWorked = ((now - inTime) / (1000 * 60 * 60)).toFixed(2);

        // Calculate overtime
        let overtime = 0;
        if (now > shiftEnd) {
            overtime = ((now - shiftEnd) / (1000 * 60 * 60)).toFixed(2);
        }

        // Status
        const lateThreshold = new Date(shiftStart.getTime() + 10 * 60000);
        const status = inTime > lateThreshold ? 'late' : 'present';

        // Update record
        const updateSQL = `
            UPDATE attendance
            SET out_time = ?, hours_worked = ?, overtime = ?, status = ?
            WHERE id = ?
        `;

        db.query(
            updateSQL,
            [now, hoursWorked, overtime, status, attendance.id],
            (err) => {
                if (err) return res.status(500).json({ msg: 'Check-out failed' });

                res.status(200).json({
                    msg: 'Checked Out Successfully',
                    check_in_time: inTime,
                    check_out_time: now,
                    hours_worked: hoursWorked,
                    overtime,
                    status
                });
            }
        );
    });
};


// Admin: Get all attendance
const getAllAttendance = (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            msg: 'Access denied'
        });
    }

    const sql = `
        SELECT 
            a.id,
            a.user_id,
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
        ORDER BY a.date DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                msg: 'Failed to fetch attendance records',
                error: err.message
            });
        }

        // ✅ No data case
        if (!results || results.length === 0) {
            return res.status(200).json({
                success: true,
                msg: 'No attendance records found',
                total_records: 0,
                data: []
            });
        }

        // ✅ Success
        return res.status(200).json({
            success: true,
            msg: 'Attendance records fetched successfully',
            total_records: results.length,
            data: results
        });
    });
};


// Employee: Get my attendance
const getMyAttendance = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    const sql = `
        SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });
        res.json(results);
    });
};


// Admin: Update attendance
const updateAttendance = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params;
    const { in_time, out_time, status, notes } = req.body;

    const sql = `
        UPDATE attendance
        SET 
            in_time = COALESCE(?, in_time),
            out_time = COALESCE(?, out_time),
            status = COALESCE(?, status),
            notes = COALESCE(?, notes)
        WHERE id = ?
    `;

    db.query(sql, [in_time, out_time, status, notes, id], (err, result) => {
        if (err) return res.status(500).json({ msg: 'Update failed', error: err.message });
        if (!result.affectedRows) return res.status(404).json({ msg: 'Record not found' });

        res.json({ msg: 'Attendance updated successfully' });
    });
};

// Admin: Delete attendance
const deleteAttendance = (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params;

    db.query('DELETE FROM attendance WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ msg: 'Delete failed', error: err.message });
        if (!result.affectedRows) return res.status(404).json({ msg: 'Record not found' });

        res.json({ msg: 'Attendance deleted successfully' });
    });
};


module.exports = { checkIn, checkOut, getAllAttendance, getMyAttendance, updateAttendance, deleteAttendance };
