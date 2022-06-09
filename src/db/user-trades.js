const mongoose = require('mongoose');

const tradeSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    type: String,
    sell: mongoose.Schema.Types.Mixed,
    buy: mongoose.Schema.Types.Mixed,
    created_date: Date
})
module.exports = mongoose.model('trades', tradeSchema);