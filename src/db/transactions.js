const mongoose = require('mongoose');

const transactionSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', index: true },
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'assets', index: true },
    user_id: { type: Number, index: true },
    address: String,
    type: String,                // 1 => withdraw / 2 => deposit
    amount: Number,
    tx_hash: { type: String, default: null },
    txtime: { type: Number, default: 0, index: true },
    fee: { type: Number, default: 0, index: true },
    final_amount: { type: Number, default: 0, index: true },
    status: { type: String, default: 0, index: true }, // 1 => Pending / 2 => Success / 3 => Failure / 4 => Waiting for an approval 
    date: {
        type: Date,
        default: Date.now,

    },
    updated_date: Date,
    is_deleted: { type: Boolean, default: false },
    payment_id: { type: String },
    height: { type: Number },
    internal_transfer: { type: Boolean, default: false },

});

let transactionFee = mongoose.model('transaction', transactionSchema);
transactionFee.createIndexes()
module.exports = transactionFee;