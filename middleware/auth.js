const admin = require('../config/firebase');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
    try {
        // If Firebase Admin isn't initialized, token verification cannot work.
        // Return 500 (server misconfiguration) instead of 401 (client auth failure).
        if (!admin.apps || admin.apps.length === 0) {
            return res.status(500).json({
                message: 'Server auth is not configured (Firebase Admin not initialized).',
                code: 'AUTH_NOT_CONFIGURED'
            });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const { uid, email } = decodedToken;

        // Find or Create User in MongoDB
        // Syncing here ensures consistency
        let user = await User.findOne({ uid });

        if (!user) {
            user = await User.create({
                uid,
                email,
                role: 'pending',
                approved: false
            });
            console.log(`✨ New user created: ${email} (${uid})`);
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('🔥 Auth Error Details:', JSON.stringify(error, null, 2));
        console.error('Token:', req.headers.authorization);
        if (error.code === 'auth/argument-error') {
            return res.status(401).json({ message: 'Invalid Token Format' });
        }
        res.status(401).json({ message: 'Unauthorized: Invalid token', error: error.message });
    }
};

const requireApprovedUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // Admins always bypass approval check, or should we separate?
    // Use case said: "Allow only role === 'admin'" for admin routes.
    // For user routes, if logic is shared, admins should probably be allowed or need approval too?
    // Usually admins are approved by default or handled manually.
    // We'll stick to strict flag check.

    if (req.user.approved !== true) {
        return res.status(403).json({
            message: 'Access Denied: Your account is pending approval.',
            code: 'PENDING_APPROVAL',
            role: req.user.role
        });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access Denied: Admins only.' });
    }
    next();
};

module.exports = { requireAuth, requireApprovedUser, requireAdmin };
