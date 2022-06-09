const mongoose = require('mongoose');

const auditLogSchema = mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    request: mongoose.Schema.Types.Mixed,
    response: String,
    path: String,
    ip_address: String,
    create_date_time: { type: Date, default:new Date() }
});

module.exports =  mongoose.model('auditlog-history', auditLogSchema);