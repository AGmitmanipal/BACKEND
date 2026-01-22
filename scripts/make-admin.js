const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config(); // Load .env from CWD (backend root)

const makeAdmin = async (email) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Custom Script: MongoDB connected");

        const result = await User.updateMany(
            { email: { $regex: new RegExp(`^${email}$`, 'i') } },
            { $set: { role: 'admin', approved: true } }
        );

        if (result.matchedCount > 0) {
            console.log(`🎉 Success! Updated ${result.modifiedCount} user(s) with email ${email} to ADMIN.`);
        } else {
            console.log(`⚠️ User with email ${email} not found.`);
            console.log("Make sure you have signed up in the User App first!");
        }

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("👋 Disconnected");
        process.exit();
    }
};

const email = process.argv[2];
if (!email) {
    console.log("Usage: node make-admin.js <email>");
    process.exit(1);
}

makeAdmin(email);
