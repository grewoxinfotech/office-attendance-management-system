const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();

// ================= Middleware =================
app.use(cors());
app.use(express.json());

// ================= Routes =================
const attendanceRoutes = require('./src/routes/attendance.routes');
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');

// Mount routes
app.use('/api/auth', authRoutes);        // Login / registration
app.use('/api/attendance', attendanceRoutes);  // Attendance
app.use('/api', userRoutes);             // User / Admin management

// ================= Health Check =================
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'API is running 🚀' });
});

// ================= Global Error Handler =================
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Internal Server Error',
        error: err.message
    });
});

// ================= Server =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
