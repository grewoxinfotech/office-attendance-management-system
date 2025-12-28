const db = require('../config/db');

/* ===================== 1. APPLY FOR LEAVE (Employee Only) ===================== */
const applyLeave = (req, res) => {
    // Only employees (or users) can apply; logic usually blocks admins from applying to themselves 
    // depending on your preference.
    const { leave_type, start_date, end_date, reason } = req.body;
    const userId = req.user.id;

    if (!leave_type || !start_date || !end_date) {
        return res.status(400).json({ msg: 'Please fill all required fields' });
    }

    const sql = `INSERT INTO leaves (user_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)`;

    db.query(sql, [userId, leave_type, start_date, end_date, reason], (err, result) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });
        res.status(201).json({ 
            msg: 'Leave application submitted successfully', 
            leaveId: result.insertId 
        });
    });
};

/* ===================== 2. GET LEAVES (Admin: All, Employee: Own) ===================== */
const getLeaves = (req, res) => {
    // Admin sees everything. Employee only sees their own requests.
    let sql = `
        SELECT 
            l.id, l.user_id, l.leave_type, l.reason, l.status, l.admin_comment, l.created_at,
            DATE_FORMAT(l.start_date, '%Y-%m-%d') as start_date, 
            DATE_FORMAT(l.end_date, '%Y-%m-%d') as end_date,
            u.name as user_name 
        FROM leaves l 
        JOIN users u ON l.user_id = u.id 
    `;
    const params = [];

    if (req.user.role !== 'admin') {
        sql += ` WHERE l.user_id = ?`;
        params.push(req.user.id);
    }

    sql += ` ORDER BY l.created_at DESC`;

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        res.json(rows);
    });
};

/* ===================== 3. APPROVE / REJECT LEAVE (Partial & Status Override) ===================== */
const updateLeaveStatus = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params; 
    const { 
        status, 
        admin_comment, 
        override_type,    // e.g., 'unpaid_leave' or 'paid_leave'
        approved_start,   // Admin can change start date
        approved_end      // Admin can change end date
    } = req.body; 

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ msg: 'Invalid status. Use approved or rejected.' });
    }

    // 1. Fetch the Leave Request
    db.query('SELECT * FROM leaves WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ msg: 'Leave request not found' });
        
        const leave = rows[0];

        // 2. Determine final dates (Use admin dates if provided, else use original)
        const finalStart = approved_start || leave.start_date;
        const finalEnd = approved_end || leave.end_date;

        // 3. Update Leave Record with Final Decision
        const updateSql = `
            UPDATE leaves SET 
                status = ?, 
                admin_comment = ?, 
                start_date = ?, 
                end_date = ? 
            WHERE id = ?`;

        db.query(updateSql, [status, admin_comment, finalStart, finalEnd, id], (err) => {
            if (err) return res.status(500).json({ msg: 'Update failed' });

            if (status === 'approved') {
                // Determine Paid/Unpaid status
                let finalAttStatus = override_type; 
                if (!finalAttStatus) {
                    finalAttStatus = (leave.leave_type === 'unpaid') ? 'unpaid_leave' : 'paid_leave';
                }

                // Create a temporary object with updated dates for the sync helper
                const updatedLeaveInfo = { ...leave, start_date: finalStart, end_date: finalEnd };
                syncAttendanceSmart(updatedLeaveInfo, finalAttStatus, res);
            } else {
                res.json({ msg: `Leave request rejected.` });
            }
        });
    });
};

/* ===================== HELPER: Smart Attendance Sync ===================== */
const syncAttendanceSmart = (leave, finalStatus, res) => {
    db.query('SELECT * FROM holidays', (err, rules) => {
        if (err) return res.status(500).json({ msg: 'Error checking calendar rules' });

        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        
        const promises = [];
        const report = []; 

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dayOfWeek = d.getDay(); 
            
            let isHoliday = false;
            let skipReason = '';

            for (const r of rules) {
                if (r.type === 'holiday' && r.date) {
                    const rDate = new Date(r.date).toISOString().split('T')[0];
                    if (rDate === dateStr) { isHoliday = true; skipReason = `Holiday (${r.name})`; break; }
                }
                if (r.type === 'weekly_off' && r.day_of_week === dayOfWeek) {
                    isHoliday = true; skipReason = `Weekly Off (${r.name})`; break;
                }
            }

            if (isHoliday) {
                report.push({ date: dateStr, status: 'Skipped', reason: skipReason });
            } else {
                report.push({ date: dateStr, status: 'Marked', type: finalStatus });

                promises.push(new Promise((resolve, reject) => {
                    const sql = `
                        INSERT INTO attendance (user_id, date, status, notes, hours_worked, overtime) 
                        VALUES (?, ?, ?, ?, 0, 0) 
                        ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), hours_worked = 0
                    `;
                    const note = `Leave Approved (Admin Choice: ${finalStatus})`;
                    db.query(sql, [leave.user_id, dateStr, finalStatus, note], (err) => {
                        if (err) reject(err); else resolve();
                    });
                }));
            }
        }

        Promise.all(promises)
            .then(() => {
                res.json({
                    msg: `Leave approved as ${finalStatus.replace('_', ' ')}`,
                    summary: { marked: promises.length, skipped: report.length - promises.length, details: report }
                });
            })
            .catch(err => res.status(500).json({ msg: 'Sync failed', error: err.message }));
    });
};

module.exports = { applyLeave, getLeaves, updateLeaveStatus };