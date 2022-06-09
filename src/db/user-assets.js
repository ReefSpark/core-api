const mongoose = require('mongoose');

const userAssetsSchema = mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    asset_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assets' },
    balance: Number,
    created_date: { type: Date, default: Date.now },
    modified_date: Date,
    is_deleted: Boolean
});

module.exports = mongoose.model('user-assets', userAssetsSchema);