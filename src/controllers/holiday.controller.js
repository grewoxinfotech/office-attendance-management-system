const db = require('../config/db');

/* ===================== GET ALL CALENDAR RULES ===================== */
const getCalendar = (req, res) => {
    const sql = `SELECT * FROM holidays ORDER BY type, date, day_of_week`;

    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });

        // Grouping for cleaner Frontend response
        const response = {
            specific_holidays: [],
            weekly_offs: [],    // Recurring full offs
            half_days: []       // Recurring half days
        };

        rows.forEach(row => {
            if (row.type === 'holiday') {
                response.specific_holidays.push(row);
            } else if (row.type === 'weekly_off') {
                // Sending object so Frontend has 'id' for update/delete
                response.weekly_offs.push({ 
                    id: row.id, 
                    day: row.day_of_week, 
                    name: row.name 
                }); 
            } else if (row.type === 'half_day') {
                response.half_days.push({ 
                    id: row.id, 
                    day: row.day_of_week, 
                    name: row.name 
                });
            }
        });

        res.json(response);
    });
};

/* ===================== ADD RULE ===================== */
const addRule = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    const { name, date, day_of_week, type } = req.body;

    // Validation
    if (!type || !name) return res.status(400).json({ msg: 'Type and Name are required' });
    if (type === 'holiday' && !date) return res.status(400).json({ msg: 'Date required for holiday' });
    if ((type === 'weekly_off' || type === 'half_day') && day_of_week === undefined) {
        return res.status(400).json({ msg: 'day_of_week (0-6) required for recurring rule' });
    }

    const sql = `INSERT INTO holidays (name, date, day_of_week, type) VALUES (?, ?, ?, ?)`;
    
    // Pass NULL for fields not used by that type
    const d = type === 'holiday' ? date : null;
    const w = type !== 'holiday' ? day_of_week : null;

    db.query(sql, [name, d, w, type], (err, result) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });
        
        // Fetch the created record to return it
        db.query('SELECT * FROM holidays WHERE id = ?', [result.insertId], (err, rows) => {
            res.status(201).json({ 
                msg: 'Rule added successfully', 
                data: rows[0] 
            });
        });
    });
};

/* ===================== UPDATE RULE (Robust Version) ===================== */
const updateRule = (req, res) => {
    // 1. Security Check
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    // 2. Safety Check: Prevent Server Crash if Body is Missing
    if (!req.body) {
        return res.status(400).json({ 
            msg: 'Request body is missing. Ensure "Content-Type" is set to "application/json" in your request headers.' 
        });
    }

    const { id } = req.params;
    const { name, date, day_of_week, type } = req.body;

    // 3. Check if Rule Exists
    db.query('SELECT * FROM holidays WHERE id = ?', [id], (err, rows) => {
        if (err) return res.status(500).json({ msg: 'DB Error', error: err.message });
        if (!rows.length) return res.status(404).json({ msg: 'Rule not found' });

        const oldRec = rows[0];

        // 4. Prepare New Values (Keep old values if not sent)
        const newType = type || oldRec.type;
        const newName = name || oldRec.name;
        
        let newDate = oldRec.date;
        let newDay = oldRec.day_of_week;

        // 5. Logic: Clear incompatible fields based on Type
        // If changing to 'holiday', we need a Date (and clear Day of Week)
        // If changing to 'weekly_off'/'half_day', we need Day of Week (and clear Date)
        
        if (newType === 'holiday') {
            newDate = date || oldRec.date; // Keep old date if not provided
            newDay = null;                 // Clear recurring day
        } else {
            newDate = null;                // Clear specific date
            // carefully handle 0 (Sunday) so it's not treated as false
            newDay = (day_of_week !== undefined) ? day_of_week : oldRec.day_of_week;
        }

        const sql = `UPDATE holidays SET name=?, date=?, day_of_week=?, type=? WHERE id=?`;

        // 6. Execute Update
        db.query(sql, [newName, newDate, newDay, newType, id], (err) => {
            if (err) return res.status(500).json({ msg: 'Update failed', error: err.message });

            // 7. Return the Updated Record
            db.query('SELECT * FROM holidays WHERE id = ?', [id], (err, resultRows) => {
                res.json({ 
                    msg: 'Rule updated successfully', 
                    data: resultRows[0] 
                });
            });
        });
    });
};

/* ===================== DELETE RULE ===================== */
const deleteRule = (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    db.query('DELETE FROM holidays WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ msg: 'DB Error' });
        if (result.affectedRows === 0) return res.status(404).json({ msg: 'Rule not found' });
        
        res.json({ msg: 'Deleted successfully', id: req.params.id });
    });
};

module.exports = { getCalendar, addRule, updateRule, deleteRule };