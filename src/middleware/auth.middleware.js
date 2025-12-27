const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ msg: 'Token missing' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // ⬅ VERY IMPORTANT
        next();
    } catch (err) {
        return res.status(401).json({ msg: 'Invalid token' });
    }
};
