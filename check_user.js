const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({ email: /ghodeanay@gmail.com/i });
        console.log("USER_DATA_START");
        console.log(JSON.stringify(user, null, 2));
        console.log("USER_DATA_END");
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}
run();
