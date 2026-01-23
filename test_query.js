const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function testPendingUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        // Find users with approved: false OR approved: { $exists: false }
        const users = await User.find({
            $or: [
                { approved: false },
                { approved: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });

        console.log("PENDING_USERS_TEST_SUCCESS");
        console.log(`Found ${users.length} users.`);
    } catch (err) {
        console.log("PENDING_USERS_TEST_ERROR");
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

testPendingUsers();
