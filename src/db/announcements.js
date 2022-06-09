const mongoose = require('mongoose');
require('mongoose-type-url');


const categoryschema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' } });
let ancmtCategories = mongoose.model('announcement-categories', categoryschema);
ancmtCategories.createIndexes();
exports.ancmtCategories = ancmtCategories;


const subCategoryschema = new mongoose.Schema({
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'announcement-categories', required: true, index: true },
    name: { type: String, required: true, index: true },
    is_active: { type: Boolean, default: true },
    image_url: { type: mongoose.SchemaTypes.Url, required: true },
}, { timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' } });
let ancmtSubCategories = mongoose.model('announcement-sub-categories', subCategoryschema);
ancmtSubCategories.createIndexes();
exports.ancmtSubCategories = ancmtSubCategories;

const titleSchema = new mongoose.Schema({
    sub_category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'announcement-sub-categories', required: true, index: true },
    name: { type: String, index: true },
    id: { type: String, index: true },
    is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' } });
let ancmtTitle = mongoose.model('announcement-title', titleSchema);
ancmtTitle.createIndexes();
exports.ancmtTitle = ancmtTitle;

const contentSchema = new mongoose.Schema({
    id: { type: String, index: true },
    title_id: { type: mongoose.Schema.Types.ObjectId, ref: 'announcement-title', required: true, index: true },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'announcement-categories', required: true, index: true },
    content_title: { type: String, required: true, index: true },
    content: { type: String, required: true, index: true },
    is_active: { type: Boolean, default: true },
    approve: { type: Boolean, default: false },
    draft: { type: Boolean, default: false },
    notify: { type: Boolean, default: false },
    tags: { type: Array },
    summary: { type: String },
    url: { type: String },
}, { timestamps: { createdAt:'created_date', updatedAt: 'modified_date' } });
let ancmtContent = mongoose.model('announcement-content', contentSchema);
ancmtContent.createIndexes();
exports.ancmtContent = ancmtContent;

const notificationSchema = new mongoose.Schema({
    content_id: { type: mongoose.Schema.Types.ObjectId, ref: 'announcement-contents', required: true, index: true },
    type: { type: String },
    title: { type: String, required: true, index: true },
    user: { type: Array, index: true },
    message: { type: String },
    url: { type: String },
    is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' } });
let ancmtNotification = mongoose.model('announcement-notifications', notificationSchema);
ancmtNotification.createIndexes();
exports.ancmtNotification = ancmtNotification;
