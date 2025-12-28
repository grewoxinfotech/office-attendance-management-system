const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');
const db = require('../config/db'); 

const NUM_USERS = 10;
const DEFAULT_PASSWORD = 'password123';

const seedUsers = async () => {
    console.log('🌱 Seeding Users...');

    const query = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });
    };

    try {
        // 1. Ensure a Default Shift Exists
        const shifts = await query('SELECT id FROM shifts');
        if (shifts.length === 0) {
            console.log('⚠️ No shifts found. Creating default shift...');
            await query("INSERT INTO shifts (name, start_time, end_time) VALUES ('General', '09:00:00', '18:00:00')");
        }
        
        // Get valid Shift IDs
        const updatedShifts = await query('SELECT id FROM shifts');
        const shiftIds = updatedShifts.map(s => s.id);

        const hashed = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
        const promises = [];

        // 2. Create Admin (for testing)
        promises.push(query(
            `INSERT IGNORE INTO users (name, email, password, role, salary, shift_id) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['Admin User', 'admin@example.com', hashed, 'admin', 100000, null]
        ));

        // 3. Create Employees
        for (let i = 0; i < NUM_USERS; i++) {
            const name = faker.person.fullName();
            const email = faker.internet.email({ firstName: name.split(' ')[0], lastName: name.split(' ')[1] });
            const role = 'employee';
            // Realistic monthly salary between 30k and 80k
            const salary = faker.number.int({ min: 30000, max: 80000 });
            const shiftId = shiftIds[Math.floor(Math.random() * shiftIds.length)];

            promises.push(
                query(
                    `INSERT IGNORE INTO users(name, email, password, role, salary, shift_id) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [name, email, hashed, role, salary, shiftId]
                )
            );
        }

        await Promise.all(promises);
        console.log(`✅ Users seeded successfully.`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Error seeding users:', err.message);
        process.exit(1);
    }
};

seedUsers();