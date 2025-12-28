const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Expecting header: "Authorization: Bearer <token>"
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attaches { id, role } to req object
        next();
    } catch (err) {
        return res.status(401).json({ msg: 'Token is not valid' });
    }
};