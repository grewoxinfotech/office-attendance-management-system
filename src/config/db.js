const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendance_db',
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

    -- USERS (Employees)
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        salary DECIMAL(10,2) DEFAULT 0,
        role ENUM('employee') DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        status ENUM('present','late','absent') DEFAULT 'present',
        location VARCHAR(255),
        notes TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    );
    `;

    db.query(initSQL, err => {
        if (err) {
            console.error('❌ Table Init Failed:', err);
        } else {
            console.log('✅ All Tables Ready (users, admins, attendance)');
        }
    });
});

module.exports = db;
