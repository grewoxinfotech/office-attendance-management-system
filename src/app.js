const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));

module.exports = app;
