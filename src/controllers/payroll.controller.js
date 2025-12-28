const db = require('../config/db');

// Helper: Get total days in month
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

/* ===================== CALCULATE SALARY API ===================== */
const calculateSalary = async (req, res) => {
    const { user_id, month } = req.query; // "2025-12"
    
    if (!user_id || !month) return res.status(400).json({ msg: 'Missing params: user_id or month (YYYY-MM)' });

    if (req.user.role !== 'admin' && req.user.id != user_id) {
        return res.status(403).json({ msg: 'Access denied' });
    }

    try {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr);
        const monthInt = parseInt(monthStr);

        // --- FETCH DATA (PARALLEL) ---
        const userPromise = new Promise((resolve, reject) => {
            db.query('SELECT name, salary FROM users WHERE id = ?', [user_id], (err, rows) => {
                if (err) return reject(err);
                resolve(rows && rows.length ? rows[0] : null);
            });
        });

        const attendancePromise = new Promise((resolve, reject) => {
            db.query(
                `SELECT status, hours_worked, overtime, date FROM attendance 
                 WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
                [user_id, month],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });

        const calendarPromise = new Promise((resolve) => {
            db.query(`SELECT * FROM holidays`, (err, rows) => {
                if (err) return resolve({ holidays: [], weekly_offs: [0], half_days: [] });

                const config = { holidays: [], weekly_offs: [], half_days: [] };
                rows.forEach(r => {
                    if (r.type === 'holiday' && r.date) {
                        const d = new Date(r.date).toISOString().split('T')[0];
                        if (d.startsWith(month)) config.holidays.push(d);
                    } else if (r.type === 'weekly_off') {
                        config.weekly_offs.push(r.day_of_week);
                    } else if (r.type === 'half_day') {
                        config.half_days.push(r.day_of_week);
                    }
                });
                if (config.weekly_offs.length === 0 && config.half_days.length === 0) config.weekly_offs = [0];
                resolve(config);
            });
        });

        const [user, attendance, calendar] = await Promise.all([
            userPromise, attendancePromise, calendarPromise
        ]);

        if (!user) return res.status(404).json({ msg: 'User not found' });

        // --- CALCULATION CONSTANTS ---
        const FULL_DAY_HOURS = 6.0; 
        const HALF_DAY_HOURS = 3.0;

        const baseSalary = Number(user.salary);
        const totalDays = getDaysInMonth(year, monthInt);
        
        // 1. Calculate Expected Working Days
        let totalWorkingDays = 0;
        for (let d = 1; d <= totalDays; d++) {
            const currentObj = new Date(year, monthInt - 1, d);
            const dateStr = `${year}-${String(monthInt).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayOfWeek = currentObj.getDay();

            if (!calendar.weekly_offs.includes(dayOfWeek) && !calendar.holidays.includes(dateStr)) {
                totalWorkingDays++;
            }
        }

        const effectiveDays = totalWorkingDays || 1; 
        const perDaySalary = baseSalary / effectiveDays;
        const perHourRate = perDaySalary / 8; 

        // 2. Process Attendance (Payable Logic)
        let payableDays = 0.0;
        let lateCount = 0;
        let totalOvertimeHours = 0;
        let presentCount = 0;

        attendance.forEach(row => {
            const hours = Number(row.hours_worked || 0);
            const status = row.status;

            // PRIORITY: EXPLICIT LEAVE STATUS
            if (status === 'paid_leave') {
                payableDays += 1.0;
            } 
            else if (status === 'half_paid_leave') {
                payableDays += 0.5;
            } 
            else if (status === 'unpaid_leave') {
                payableDays += 0.0; // Explicitly 0
            } 
            // PRIORITY: HOURS WORKED (Present/Late)
            else {
                if (hours >= FULL_DAY_HOURS) {
                    payableDays += 1.0;
                    presentCount++;
                } else if (hours >= HALF_DAY_HOURS) {
                    payableDays += 0.5;
                    presentCount++;
                }
            }

            if (status === 'late') lateCount++;
            totalOvertimeHours += Number(row.overtime || 0);
        });

        // 3. Financials
        const unpaidDays = Math.max(0, totalWorkingDays - payableDays);
        const unpaidDeduction = unpaidDays * perDaySalary;
        const latePenaltyDays = Math.floor(lateCount / 3) * 0.5;
        const latePenaltyAmount = latePenaltyDays * perDaySalary;
        const overtimePay = totalOvertimeHours * perHourRate;
        
        const netSalary = baseSalary - unpaidDeduction - latePenaltyAmount + overtimePay;

        // --- RESPONSE ---
        res.json({
            month,
            user: {
                id: user_id,
                name: user.name,
                base_salary: baseSalary,
                per_day_value: perDaySalary.toFixed(2),
                per_hour_value: perHourRate.toFixed(2)
            },
            calendar_summary: {
                total_days: totalDays,
                working_days: totalWorkingDays,
                holidays: calendar.holidays.length,
                weekends_config: calendar.weekly_offs
            },
            attendance_summary: {
                present_days: presentCount,
                payable_days: payableDays,
                unpaid_days: unpaidDays,
                late_marks: lateCount,
                overtime_hours: totalOvertimeHours.toFixed(2)
            },
            financials: {
                earnings: {
                    base_earned: (payableDays * perDaySalary).toFixed(2),
                    overtime_pay: overtimePay.toFixed(2)
                },
                deductions: {
                    unpaid_leave: unpaidDeduction.toFixed(2),
                    late_penalty: latePenaltyAmount.toFixed(2)
                },
                net_salary: netSalary.toFixed(2)
            }
        });

    } catch (err) {
        console.error("Payroll Error:", err);
        res.status(500).json({ msg: 'Calculation error', error: err.message });
    }
};

module.exports = { calculateSalary };