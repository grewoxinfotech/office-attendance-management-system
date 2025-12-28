const { faker } = require('@faker-js/faker');
const db = require('../config/db'); 

const NUM_DAYS = 30; // Last 30 days

const seedAttendance = async () => {
    console.log('🌱 Seeding Smart Attendance...');

    // Helper: Promisify DB Query
    const query = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });
    };

    try {
        // 1. CLEAR OLD DATA
        await query('DELETE FROM attendance');
        console.log('🗑️  Old attendance cleared.');

        // 2. FETCH PREREQUISITES (Users, Holidays, Rules)
        const users = await query(`
            SELECT u.id, s.start_time, s.end_time 
            FROM users u 
            LEFT JOIN shifts s ON u.shift_id = s.id 
            WHERE u.role = 'employee'
        `);

        if (users.length === 0) {
            console.log('⚠️ No employees found. Run seedUsers.js first.');
            process.exit(0);
        }

        // Fetch Calendar Config (to respect weekends/holidays)
        const rules = await query('SELECT * FROM holidays');
        
        // Parse Rules
        const holidays = rules.filter(r => r.type === 'holiday').map(r => new Date(r.date).toISOString().split('T')[0]);
        const weeklyOffs = rules.filter(r => r.type === 'weekly_off').map(r => r.day_of_week);
        const halfDays = rules.filter(r => r.type === 'half_day').map(r => r.day_of_week);

        // Defaults if DB is empty
        if (weeklyOffs.length === 0) weeklyOffs.push(0); // Default Sunday off

        console.log(`📅 Config Loaded: ${holidays.length} Holidays, Offs: [${weeklyOffs}], HalfDays: [${halfDays}]`);

        const promises = [];

        // 3. LOOP LAST 30 DAYS
        for (let day = 0; day < NUM_DAYS; day++) {
            const date = new Date();
            date.setDate(date.getDate() - day);
            const dateStr = date.toISOString().split('T')[0];
            const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

            // CHECK: Is this a Non-Working Day?
            if (holidays.includes(dateStr) || weeklyOffs.includes(dayOfWeek)) {
                // Skip generating attendance (Employees don't swipe in on Offs)
                // Payroll logic handles "Missing Record on Holiday" as Paid.
                continue;
            }

            // CHECK: Is this a Half Day?
            const isHalfDay = halfDays.includes(dayOfWeek);

            // 4. GENERATE FOR EACH USER
            for (const user of users) {
                // RANDOM SCENARIO SELECTOR
                const rand = Math.random(); 

                // A. Leaves (10% chance)
                if (rand < 0.10) {
                    let status = 'paid_leave'; // Default
                    if (rand < 0.03) status = 'unpaid_leave'; // 3% Unpaid
                    else if (rand < 0.06) status = 'half_paid_leave'; // 3% Half Pay
                    else if (rand < 0.08) status = 'absent'; // 2% Absent (No Call)

                    promises.push(query(
                        `INSERT INTO attendance (user_id, date, status, hours_worked, overtime, notes) 
                         VALUES (?, ?, ?, 0, 0, ?)`,
                        [user.id, dateStr, status, 'Seeded Leave']
                    ));
                    continue; // Skip the rest for this user
                }

                // B. Present / Late (90% chance)
                const sTime = user.start_time || '09:00:00';
                const eTime = user.end_time || '18:00:00';

                let shiftStart = new Date(`${dateStr}T${sTime}`);
                let shiftEnd = new Date(`${dateStr}T${eTime}`);

                // Adjust Shift End if it's a Half Day (e.g., 4 hour shift)
                if (isHalfDay) {
                    shiftEnd = new Date(shiftStart.getTime() + 4 * 60 * 60 * 1000); 
                }

                // Simulate In Time
                // 80% On Time (-15m to +5m), 20% Late (+15m to +60m)
                const isLate = Math.random() < 0.2;
                const arrivalOffset = isLate 
                    ? faker.number.int({ min: 16, max: 60 }) // Late
                    : faker.number.int({ min: -15, max: 5 }); // On Time

                const inTime = new Date(shiftStart.getTime() + arrivalOffset * 60000);

                // Simulate Out Time
                // Normal day: Work ~9 hrs. Half day: Work ~4.5 hrs.
                // 10% Chance of Overtime (+1 to +3 hours)
                const isOvertime = Math.random() < 0.1;
                const workDurationHours = isHalfDay ? 4.5 : 9;
                
                let departureOffset = faker.number.int({ min: -10, max: 15 }); // Normal variance
                if (isOvertime) departureOffset += faker.number.int({ min: 60, max: 180 }); // Add OT minutes

                const outTime = new Date(inTime.getTime() + (workDurationHours * 3600000) + (departureOffset * 60000));

                // Calculations
                const hoursWorked = ((outTime - inTime) / 3600000).toFixed(2);
                
                // Overtime Calc (Only if worked past Shift End)
                let overtime = 0;
                if (outTime > shiftEnd) {
                    overtime = ((outTime - shiftEnd) / 3600000).toFixed(2);
                }

                // Status Determination
                // 15 min buffer for late
                const lateThreshold = new Date(shiftStart.getTime() + 15 * 60000);
                const status = inTime > lateThreshold ? 'late' : 'present';

                const location = faker.location.city();

                promises.push(query(
                    `INSERT INTO attendance 
                    (user_id, date, in_time, out_time, shift_start, shift_end, hours_worked, overtime, status, location) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [user.id, dateStr, inTime, outTime, shiftStart, shiftEnd, hoursWorked, overtime, status, location]
                ));
            }
        }

        await Promise.all(promises);
        console.log(`✅ Successfully seeded ${promises.length} records.`);
        console.log(`📊 Data includes: Present, Late, Paid/Unpaid Leaves, Half Days & Overtime.`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Error seeding attendance:', err.message);
        process.exit(1);
    }
};

seedAttendance();