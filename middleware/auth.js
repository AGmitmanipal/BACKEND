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
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(token);
        } catch (verifyError) {
            console.error('🔥 Token Verification Failed:', verifyError.code, verifyError.message);
            return res.status(401).json({ message: 'Unauthorized: Invalid token', code: verifyError.code, error: verifyError.message });
        }

        const { uid, email } = decodedToken;

        // Find or Create User in MongoDB
        // Syncing here ensures consistency
        let user = await User.findOne({ uid });

        if (!user) {
            console.log(`👤 User not found in DB, creating new user for ${uid}`);
            try {
                user = await User.create({
                    uid,
                    email: email || `no-email-${uid}@placeholder.com`, // Handle missing email (e.g. phone auth)
                    role: 'user',
                    approved: true,
                    vehiclePlate: 'PENDING'
                });
                console.log(`✨ New user created: ${user.email} (${uid})`);
            } catch (createError) {
                console.error('❌ Failed to create user in DB:', createError);
                if (createError.name === 'ValidationError') {
                    // This is a server/DB schema issue, not an invalid token
                    return res.status(500).json({ message: 'Database Validation Error during user creation', error: createError.message });
                }
                throw createError;
            }
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('🔥 Auth Middleware Error:', error);
        res.status(500).json({ message: 'Internal Server Authentication Error', error: error.message });
    }
};

const requireApprovedUser = (req, res, next) => {
    // Approval requirement removed as per user request
    next();
};

const requireAdmin = (req, res, next) => {
    // Admin restriction removed as per user request
    next();
};

module.exports = { requireAuth, requireApprovedUser, requireAdmin };


