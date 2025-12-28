const Shift = require('../models/shift.model');

// Helper to check for admin role (consistent with your existing code)
const isAdmin = (req) => req.user && req.user.role === 'admin';

/* ===================== CREATE SHIFT ===================== */
const createShift = (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

    const { name, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
        return res.status(400).json({ msg: 'Please provide name, start_time, and end_time' });
    }

    Shift.create({ name, start_time, end_time }, (err, result) => {
        if (err) return res.status(500).json({ msg: 'Database error', error: err.message });
        res.status(201).json({ 
            msg: 'Shift created successfully', 
            data: { id: result.insertId, name, start_time, end_time } 
        });
    });
};

/* ===================== GET ALL SHIFTS ===================== */
const getAllShifts = (req, res) => {
    Shift.findAll((err, rows) => {
        if (err) 
            return res.status(500).json({ msg: 'Database error', error: err.message });

        // Handle case where no shifts exist
        if (!rows.length) {
            return res.status(404).json({ 
                msg: 'No shifts found', 
                data: [] 
            });
        }

        // Return data with metadata
        res.status(200).json({
            msg: 'Shifts retrieved successfully',
            total: rows.length,
            data: rows
        });
    });
};

/* ===================== GET SHIFT BY ID ===================== */
const getShiftById = (req, res) => {
    Shift.findById(req.params.id, (err, rows) => {
        if (err) return res.status(500).json({ msg: 'Database error', error: err.message });
        if (rows.length === 0) return res.status(404).json({ msg: 'Shift not found' });
        res.json(rows[0]);
    });
};

/* ===================== UPDATE SHIFT ===================== */
const updateShift = (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

    const { id } = req.params;
    const { name, start_time, end_time } = req.body;
    
    const data = { name, start_time, end_time };

    // 1. Perform the Update
    Shift.update(id, data, (err, result) => {
        if (err) return res.status(500).json({ msg: 'Database error', error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: 'Shift not found' });
        }
        
        // 2. Fetch the updated record to return it
        Shift.findById(id, (err, rows) => {
            if (err) return res.status(500).json({ msg: 'Error fetching updated data' });

            res.json({ 
                msg: 'Shift updated successfully',
                data: rows[0] 
            });
        });
    });
};

/* ===================== DELETE SHIFT ===================== */
const deleteShift = (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

    Shift.delete(req.params.id, (err, result) => {
        if (err) return res.status(500).json({ msg: 'Database error', error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ msg: 'Shift not found' });
        res.json({ msg: 'Shift deleted successfully' });
    });
};

module.exports = {
    createShift,
    getAllShifts,
    getShiftById,
    updateShift,
    deleteShift
};