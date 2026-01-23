const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    uid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['pending', 'user', 'admin'],
        default: 'pending'
    },
    approved: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
