const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendance_db',
    multipleStatements: true
});

db.connect(err => {
    if (err) {
        console.error('❌ DB Connection Failed:', err);
        return;
    }

    console.log('✅ MySQL Connected');

    const initSQL = `
    CREATE DATABASE IF NOT EXISTS attendance_db;
    USE attendance_db;

    -- SHIFTS
    CREATE TABLE IF NOT EXISTS shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- USERS
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        salary DECIMAL(10,2) DEFAULT 0,
        role ENUM('employee', 'admin') DEFAULT 'employee',
        shift_id INT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
    );

    -- ADMINS
    CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ATTENDANCE
    CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        date DATE DEFAULT CURDATE(),
        in_time DATETIME,
        out_time DATETIME,
        shift_start DATETIME,
        shift_end DATETIME,
        hours_worked DECIMAL(5,2) DEFAULT 0,
        overtime DECIMAL(5,2) DEFAULT 0,
        status ENUM('present','late','absent','paid_leave', 'half_paid_leave', 'unpaid_leave') DEFAULT 'present',
        location VARCHAR(255),
        notes TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- HOLIDAYS & CALENDAR RULES (Unified Table)
    -- Stores: Specific Holidays, Recurring Week Offs, and Half Days
    CREATE TABLE IF NOT EXISTS holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,           -- e.g. "Christmas", "Sunday Off"
        date DATE DEFAULT NULL,               -- Specific Date (NULL for recurring)
        day_of_week TINYINT DEFAULT NULL,     -- 0=Sun, 1=Mon... (NULL for specific date)
        type ENUM('holiday', 'weekly_off', 'half_day') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    leave_type ENUM('sick', 'casual', 'unpaid') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

    `;

    db.query(initSQL, err => {
        if (err) {
            console.error('❌ Table Init Failed:', err);
        } else {
            console.log('✅ All Tables Ready');
        }
    });
});

module.exports = db;