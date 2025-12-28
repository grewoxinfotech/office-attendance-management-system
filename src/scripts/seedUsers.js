const { faker } = require('@faker-js/faker');
const db = require('../config/db'); // adjust path

const NUM_USERS = 10; // how many users you want

for (let i = 1; i <= NUM_USERS; i++) {
    const name = faker.person.fullName();
    const email = faker.internet.email();
    const role = 'employee';
    const salary = faker.number.int({ min: 20000, max: 50000 });

    db.query(
        'INSERT INTO users(name, email, role, salary) VALUES (?, ?, ?, ?)',
        [name, email, role, salary],
        (err) => {
            if (err) {
                console.log('Error inserting user:', err.message);
            } else {
                console.log('User inserted:', name);
            }
        }
    );
}
console.log('Seeding users completed.');
process.exit();