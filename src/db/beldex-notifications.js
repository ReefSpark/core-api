const mongoose = require('mongoose'), Schema = mongoose.Schema;

const notificationSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', index: true },
    type: { type: Number, default: 1 }, // 1 => email, 2 => sms
    notify_type: String,
    notify_data: Object,
    status: { type: Number, default: 1, index: true }, // 1 => Sended , 2 => Processed
    created_date: { type: Date, default: Date.now },
    is_active: { type: Boolean, default: false, index: true },
    modified_date: Date,
    time_expiry: { type: String, default: 'No' }

});

let beldexNotification = mongoose.model('beldex-notifications', notificationSchema);
beldexNotification.createIndexes()
module.exports = beldexNotification;