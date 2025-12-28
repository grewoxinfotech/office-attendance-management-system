const Attendance = require('../models/attendance.model');
const db = require('../config/db');

// Helper: Extract HH:MM:SS from a Date object
const extractTime = (dt) => dt ? new Date(dt).toTimeString().split(' ')[0] : null;

// Helper: Combine YYYY-MM-DD and HH:MM:SS into a Date object
const combineDateTime = (dateStr, timeStr) => (dateStr && timeStr) ? new Date(`${dateStr}T${timeStr}`) : null;

/* ===================== EMPLOYEE CHECK-IN (BLOCKS ON HOLIDAYS) ===================== */
const checkIn = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });

    // 1. Get Today's Details
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
    const location = req.body?.location || 'Office';

    // 2. CHECK HOLIDAY RULES
    db.query('SELECT * FROM holidays', (err, rules) => {
        if (err) return res.status(500).json({ msg: 'DB Error checking calendar' });

        let isBlocked = false;
        let blockReason = '';
        let isHalfDay = false;

        for (const r of rules) {
            if (r.type === 'holiday' && r.date) {
                const rDate = new Date(r.date).toISOString().split('T')[0];
                if (rDate === todayStr) { isBlocked = true; blockReason = `Holiday (${r.name})`; break; }
            }
            if (r.type === 'weekly_off' && r.day_of_week === dayOfWeek) {
                isBlocked = true; blockReason = `Weekly Off (${r.name})`; break;
            }
            if (r.type === 'half_day' && r.day_of_week === dayOfWeek) isHalfDay = true;
        }

        if (isBlocked) {
            return res.status(403).json({ msg: `Check-in Failed: Today is a ${blockReason}.` });
        }

        // 3. Duplicate Check
        db.query('SELECT id FROM attendance WHERE user_id = ? AND date = CURDATE()', [userId], (err, rows) => {
            if (err) return res.status(500).json({ msg: 'DB Error' });
            if (rows.length > 0) return res.status(400).json({ msg: 'Already checked in today.' });

            // 4. Fetch Shift
            db.query(`SELECT s.start_time, s.end_time FROM users u LEFT JOIN shifts s ON u.shift_id = s.id WHERE u.id = ?`, [userId], (err, results) => {
                if (err) return res.status(500).json({ msg: 'DB Error' });

                let sStartStr = (results.length && results[0].start_time) ? results[0].start_time : '09:00:00';
                let sEndStr = (results.length && results[0].end_time) ? results[0].end_time : '18:30:00';

                let shiftStart = new Date(`${todayStr}T${sStartStr}`);
                let shiftEnd = new Date(`${todayStr}T${sEndStr}`);

                // Half Day Logic
                if (isHalfDay) shiftEnd = new Date(shiftStart.getTime() + 4 * 60 * 60 * 1000);

                const lateThreshold = new Date(shiftStart.getTime() + 15 * 60000); 

                // 5. Mark In
                Attendance.markIn(userId, now, location, shiftStart, shiftEnd, (err, result) => {
                    if (err) return res.status(500).json({ msg: 'Check-in failed', error: err.message });
                    
                    const attendanceId = result.insertId;
                    const checkLate = () => {
                        if (now > lateThreshold) db.query('UPDATE attendance SET status = "late" WHERE id = ?', [attendanceId]);
                    };
                    checkLate();

                    db.query(`SELECT * FROM attendance WHERE id = ?`, [attendanceId], (err, rows) => {
                        res.json({ msg: isHalfDay ? 'Checked In (Half Day)' : 'Checked In', data: rows[0] });
                    });
                });
            });
        });
    });
};

/* ===================== EMPLOYEE CHECK-OUT (With 1 Hr Min OT Rule) ===================== */
const checkOut = (req, res) => {
    const userId = req.user?.id;
    const now = new Date();

    db.query(
        `SELECT * FROM attendance WHERE user_id = ? AND date = CURDATE() ORDER BY id DESC LIMIT 1`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ msg: 'DB Error' });
            if (!rows.length) return res.status(400).json({ msg: 'No check-in found today' });

            const record = rows[0];
            if (record.out_time) return res.status(400).json({ msg: 'Already checked out.' });

            // 1. Calculate Times
            const inTime = new Date(record.in_time);
            const shiftEnd = record.shift_end ? new Date(record.shift_end) : new Date();
            
            // Calculate Hours Worked (Total duration)
            const hoursWorked = ((now - inTime) / 3600000).toFixed(2);

            // 2. Calculate Potential Overtime
            let overtime = 0;
            if (now > shiftEnd) {
                // Raw difference in hours
                const diffHours = (now - shiftEnd) / 3600000;

                // --- 🛑 RULE: Minimum 1 Hour Extra Required ---
                if (diffHours >= 1.0) {
                    overtime = diffHours.toFixed(2);
                } else {
                    overtime = 0; // Ignore if less than 1 hour (e.g., 45 mins)
                }
            }

            // 3. Security Fix: If Total Work is roughly 0 (e.g. < 10 mins), force OT to 0
            // This fixes the bug where someone swipes in/out instantly late at night and gets OT.
            if (hoursWorked < 0.17) { // less than ~10 mins
                 overtime = 0; 
            }

            const sql = `UPDATE attendance SET out_time = ?, hours_worked = ?, overtime = ? WHERE id = ?`;

            db.query(sql, [now, hoursWorked, overtime, record.id], (err) => {
                if (err) return res.status(500).json({ msg: 'Check-out failed' });
                
                db.query('SELECT * FROM attendance WHERE id = ?', [record.id], (err, rows) => {
                    res.json({ 
                        msg: 'Checked Out', 
                        data: {
                            ...rows[0],
                            note: overtime > 0 ? "Overtime Recorded" : "No Overtime (Min 1hr required)"
                        } 
                    });
                });
            });
        }
    );
};

/* ===================== ADMIN: ADD MANUAL ATTENDANCE (NEW) ===================== */
const addAttendance = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    const { user_id, date, in_time, out_time, status, location, notes } = req.body;

    if (!user_id || !date || !in_time) {
        return res.status(400).json({ msg: 'Missing required fields: user_id, date, in_time' });
    }

    // 1. Fetch User Shift to calculate Shift Start/End
    db.query(`SELECT s.start_time, s.end_time FROM users u LEFT JOIN shifts s ON u.shift_id = s.id WHERE u.id = ?`, [user_id], (err, results) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });

        const targetDate = new Date(date).toISOString().split('T')[0];
        const sStartStr = (results.length && results[0].start_time) ? results[0].start_time : '09:00:00';
        const sEndStr = (results.length && results[0].end_time) ? results[0].end_time : '18:30:00';

        const shiftStart = combineDateTime(targetDate, sStartStr);
        let shiftEnd = combineDateTime(targetDate, sEndStr);
        if (shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1); // Handle overnight shifts

        // 2. Process Input Times
        const inTimeObj = combineDateTime(targetDate, in_time); // Expecting HH:MM:SS
        const outTimeObj = out_time ? combineDateTime(targetDate, out_time) : null;

        let hoursWorked = 0;
        let overtime = 0;

        if (inTimeObj && outTimeObj) {
            hoursWorked = ((outTimeObj - inTimeObj) / 3600000).toFixed(2);
            if (outTimeObj > shiftEnd) {
                overtime = ((outTimeObj - shiftEnd) / 3600000).toFixed(2);
            }
        }

        const finalStatus = status || 'present';
        const finalLoc = location || 'Manual Entry';

        // 3. Insert
        const sql = `
            INSERT INTO attendance 
            (user_id, date, in_time, out_time, shift_start, shift_end, hours_worked, overtime, status, location, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(sql, [user_id, targetDate, inTimeObj, outTimeObj, shiftStart, shiftEnd, hoursWorked, overtime, finalStatus, finalLoc, notes], (err, result) => {
            if (err) return res.status(500).json({ msg: 'Error adding attendance', error: err.message });
            
            res.status(201).json({ msg: 'Attendance added successfully', id: result.insertId });
        });
    });
};

/* ===================== ADMIN: MARK LEAVE ===================== */
const markLeave = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { user_id, date, status, notes } = req.body;
    if (!user_id || !date || !status) return res.status(400).json({ msg: 'Missing fields' });

    const sql = `INSERT INTO attendance (user_id, date, status, notes, hours_worked, overtime) VALUES (?, ?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), hours_worked = 0, overtime = 0`;
    db.query(sql, [user_id, date, status, notes], (err) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        res.json({ msg: 'Leave status updated successfully' });
    });
};

/* ===================== ADMIN: GET ALL ATTENDANCE ===================== */
const getAllAttendance = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { month, start_date, end_date, user_id } = req.query;

    let sql = `SELECT a.id AS attendance_id, a.user_id, a.date, a.in_time, a.out_time, a.hours_worked, a.overtime, a.status, a.location, a.notes, a.shift_start, a.shift_end, u.shift_id AS current_shift_id FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1 = 1`;
    const params = [];

    if (start_date && end_date) { sql += ' AND a.date BETWEEN ? AND ?'; params.push(start_date, end_date); }
    else if (month) { sql += ' AND DATE_FORMAT(a.date, "%Y-%m") = ?'; params.push(month); }
    if (user_id) { sql += ' AND u.id = ?'; params.push(user_id); }
    sql += ' ORDER BY a.date DESC, u.name ASC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        const flatList = rows.map(row => ({
            id: row.attendance_id, user_id: row.user_id, shift_id: row.current_shift_id, date: row.date,
            in_time: row.in_time, out_time: row.out_time,
            shift_start: extractTime(row.shift_start), shift_end: extractTime(row.shift_end),
            hours_worked: Number(row.hours_worked || 0), overtime: Number(row.overtime || 0),
            status: row.status, location: row.location, notes: row.notes
        }));
        res.status(200).json({ total_records: flatList.length, filter: req.query, data: flatList });
    });
};

/* ===================== EMPLOYEE: MY ATTENDANCE ===================== */
const getMyAttendance = (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ msg: 'User not found' });
    const { month, start_date, end_date } = req.query;
    let sql = `SELECT a.*, u.shift_id FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.user_id = ?`;
    const params = [userId];

    if (month) { sql += ` AND DATE_FORMAT(a.date, '%Y-%m') = ?`; params.push(month); }
    if (start_date && end_date) { sql += ` AND a.date BETWEEN ? AND ?`; params.push(start_date, end_date); }
    sql += ` ORDER BY a.date DESC`;

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        const attendance = rows.map(row => ({
            id: row.id, user_id: row.user_id, shift_id: row.shift_id, date: row.date,
            in_time: row.in_time, out_time: row.out_time,
            hours_worked: Number(row.hours_worked || 0), overtime: Number(row.overtime || 0),
            status: row.status, location: row.location, notes: row.notes
        }));
        res.status(200).json({ total_days: attendance.length, filter: req.query, data: attendance });
    });
};

/* ===================== ADMIN: UPDATE ATTENDANCE (SMART LOGIC) ===================== */
const updateAttendance = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { id } = req.params;
    const body = req.body;
    
    db.query('SELECT * FROM attendance WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ msg: 'Record not found' });
        const oldRec = rows[0];
        const targetDateStr = body.date ? new Date(body.date).toISOString().split('T')[0] : new Date(oldRec.date).toISOString().split('T')[0];

        const processWithShift = (newShiftStart, newShiftEnd) => {
            const newDate = body.date !== undefined ? body.date : oldRec.date;
            let newIn = body.in_time !== undefined ? new Date(body.in_time) : oldRec.in_time;
            let newOut = body.out_time !== undefined ? new Date(body.out_time) : oldRec.out_time;

            if (body.date && !body.in_time && oldRec.in_time) newIn = combineDateTime(targetDateStr, extractTime(oldRec.in_time));
            if (body.date && !body.out_time && oldRec.out_time) newOut = combineDateTime(targetDateStr, extractTime(oldRec.out_time));

            const newStatus = body.status !== undefined ? body.status : oldRec.status;
            const newLocation = body.location !== undefined ? body.location : oldRec.location;
            const newNotes = body.notes !== undefined ? body.notes : oldRec.notes;

            let newHours = oldRec.hours_worked;
            let newOvertime = oldRec.overtime;

            // 1. Recalculate Hours Worked
            if (body.hours_worked !== undefined) {
                newHours = body.hours_worked;
            } else if (newIn && newOut) {
                newHours = ((new Date(newOut) - new Date(newIn)) / 3600000).toFixed(2);
            }

            // 2. Recalculate Overtime (Smart Logic)
            if (body.overtime !== undefined) {
                newOvertime = body.overtime;
            } else if (newOut && newShiftEnd) {
                const diff = (new Date(newOut) - newShiftEnd) / 3600000;
                
                // 🛑 NEW RULE: Min 1 Hour OT & Min 10 mins worked required
                // This prevents "Ghost OT" where hours worked is 0 but OT is high.
                if (diff >= 1.0 && Number(newHours) > 0.17) {
                    newOvertime = diff.toFixed(2);
                } else {
                    newOvertime = 0;
                }
            }

            const sql = `UPDATE attendance SET date=?, in_time=?, out_time=?, shift_start=?, shift_end=?, hours_worked=?, overtime=?, status=?, location=?, notes=? WHERE id=?`;
            db.query(sql, [newDate, newIn, newOut, newShiftStart, newShiftEnd, newHours, newOvertime, newStatus, newLocation, newNotes, id], (err) => {
                if (err) return res.status(500).json({ msg: 'Update failed', error: err.message });
                
                db.query(`SELECT a.*, u.shift_id AS current_shift_id FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.id = ?`, [id], (err, rows) => {
                    const row = rows[0];
                    res.json({
                        msg: 'Updated successfully',
                        data: {
                            id: row.id, user_id: row.user_id, shift_id: row.current_shift_id, date: row.date,
                            shift_start: extractTime(row.shift_start), shift_end: extractTime(row.shift_end),
                            in_time: row.in_time, out_time: row.out_time,
                            hours_worked: Number(row.hours_worked), overtime: Number(row.overtime),
                            status: row.status, location: row.location, notes: row.notes
                        }
                    });
                });
            });
        };

        if (body.shift_id) {
            db.query('SELECT start_time, end_time FROM shifts WHERE id = ?', [body.shift_id], (err, shifts) => {
                if (!shifts.length) return res.status(404).json({ msg: 'Shift not found' });
                const s = shifts[0];
                const sStart = combineDateTime(targetDateStr, s.start_time);
                let sEnd = combineDateTime(targetDateStr, s.end_time);
                if (sEnd < sStart) sEnd.setDate(sEnd.getDate() + 1);
                processWithShift(sStart, sEnd);
            });
        } else {
            let sStart = oldRec.shift_start;
            let sEnd = oldRec.shift_end;
            if (body.date && sStart && sEnd) {
                sStart = combineDateTime(targetDateStr, extractTime(sStart));
                sEnd = combineDateTime(targetDateStr, extractTime(sEnd));
                if (sEnd < sStart) sEnd.setDate(sEnd.getDate() + 1);
            }
            processWithShift(sStart, sEnd);
        }
    });
};

/* ===================== DELETE ATTENDANCE ===================== */
const deleteAttendance = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    db.query('DELETE FROM attendance WHERE id = ?', [req.params.id], (err, result) => {
        if (!result.affectedRows) return res.status(404).json({ msg: 'Record not found' });
        res.json({ msg: 'Deleted successfully' });
    });
};

module.exports = { checkIn, checkOut, addAttendance, markLeave, getAllAttendance, getMyAttendance, updateAttendance, deleteAttendance };