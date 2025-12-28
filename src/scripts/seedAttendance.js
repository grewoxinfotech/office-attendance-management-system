const { faker } = require('@faker-js/faker');
const db = require('../config/db'); // adjust path

const NUM_DAYS = 30; // number of days to generate attendance for
const NUM_USERS = 10; // match number of users created

for (let day = 0; day < NUM_DAYS; day++) {
    const date = new Date();
    date.setDate(date.getDate() - day);

    for (let userId = 2; userId <= NUM_USERS; userId++) {
        const shiftStart = new Date(date);
        shiftStart.setHours(9, 0, 0, 0);

        const shiftEnd = new Date(date);
        shiftEnd.setHours(18, 30, 0, 0);

        const in_time = new Date(shiftStart.getTime() + faker.number.int({ min: 0, max: 60 }) * 60000);
        const out_time = new Date(shiftEnd.getTime() + faker.number.int({ min: -30, max: 60 }) * 60000);

        const hours_worked = ((out_time - in_time) / (1000 * 60 * 60)).toFixed(2);
        const overtime = out_time > shiftEnd ? ((out_time - shiftEnd) / (1000 * 60 * 60)).toFixed(2) : 0;

        const status = in_time > new Date(shiftStart.getTime() + 10 * 60000) ? 'late' : 'present';
        const location = faker.location.city();

        db.query(
            `INSERT INTO attendance(user_id, date, in_time, out_time, hours_worked, overtime, status, location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, date, in_time, out_time, hours_worked, overtime, status, location],
            (err) => {
                if (err) console.log('Error inserting attendance:', err.message);
            }
        );
    }
}
console.log('Seeding attendance completed.');