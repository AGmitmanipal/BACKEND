const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/auth/me - Returns current user status
// Used by frontend to check approval status
router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
});

module.exports = router;
