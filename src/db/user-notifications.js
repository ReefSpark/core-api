const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', index: true },
    type: { type: String },
    title: { type: String },
    message: { type: String },
    url: { type: String },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' } });
let userNotification = mongoose.model('user-notifications', notificationSchema);
userNotification.createIndexes();
module.exports = userNotification;