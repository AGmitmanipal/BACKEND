const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Protect all routes
router.use(requireAuth);
router.use(requireAdmin);

// GET /pending-users
router.get('/pending-users', async (req, res) => {
    try {
        const users = await User.find({ approved: false }).sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /approve-user/:uid
router.patch('/approve-user/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        // Update approved user
        const user = await User.findOneAndUpdate(
            { uid },
            { approved: true, role: 'user' },
            { new: true }
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /reject-user/:uid
// Since there is no 'rejected' role, we will delete the user record.
router.patch('/reject-user/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const user = await User.findOneAndDelete({ uid });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User rejected and removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
