const mongoose = require('mongoose');

const userAssetsSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    public_key: { type: String, required: true },
    private_key: { type: String, required: true },
    browser_list: { type: mongoose.Schema.Types.Mixed }
},
    {
        timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' }
    });

module.exports = mongoose.model('user-browser-notification', userAssetsSchema);