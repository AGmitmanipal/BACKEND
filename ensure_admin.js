const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function ensureAdmin(email) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Checking for user: ${email}`);

        let user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

        if (user) {
            user.role = 'admin';
            user.approved = true;
            await user.save();
            console.log(`✅ User ${email} was found and promoted to admin.`);
        } else {
            console.log(`⚠️ User ${email} not found in database.`);
            console.log(`Creating dummy record for ${email}. Note: UID must be set correctly when the user logs in.`);
            // When user logs in, requireAuth will find by UID. 
            // If we don't know the UID, we can't fully 'link' them yet.
            // But if we create a record with email, and the user logs in, 
            // the requireAuth middleware will look by UID, find nothing, and try to create.
            // Wait, if it tries to create and the email is unique, it might fail if we have a record without UID.
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

const email = process.argv[2] || 'ghodeanay@gmail.com';
ensureAdmin(email);
