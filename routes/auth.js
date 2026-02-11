const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/auth/me - Returns current user status
// Used by frontend to check approval status
router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
});

// POST /api/auth/update-profile
router.post('/update-profile', requireAuth, async (req, res) => {
    try {
        const { vehiclePlate } = req.body;
        const user = req.user;

        if (vehiclePlate) {
            user.vehiclePlate = vehiclePlate;
            await user.save();
        }

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});

module.exports = router;
