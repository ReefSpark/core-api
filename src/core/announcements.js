const moment = require('moment');
const mongoose = require('mongoose');
const Controller = require('./controller');
const { ancmtCategories, ancmtSubCategories, ancmtTitle, ancmtContent, ancmtNotification } = require('../db/announcements');
const userNotificationSchema = require('../db/user-notifications');
const _ = require('lodash');
const Utils = require('../helpers/utils');
const utils = new Utils();


class announcement extends Controller {

    async getAnnouncement(req, res) {
        try {
            let getSubCntDetails = await ancmtSubCategories.aggregate([
                {
                    $match: {
                        is_active: true
                    }
                },
                {
                    $group: {
                        _id: '$category_id',
                        subCategory: { $push: { name: '$name', _id: "$_id", id: "$id", image_url: "$image_url" } }
                    },
                },
                {
                    $lookup: {
                        from: 'announcement-categories',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'category'
                    }
                },
                {
                    $match: {
                        "category.is_active": true
                    }
                },
                { $unwind: '$category' },
                {
                    $project: {
                        'subCategory': 1, 'category.created_date': 1, 'category._id': 1, 'category.name': 1, 'category.id': 1
                    }
                },
                { $sort: { "category.created_date": 1 } }
            ]);
            // let getAllTitle = await ancmtTitle.aggregate([
            //     {
            //         $group: {
            //             _id: '$sub_category_id',
            //             titles: { $push: { title_name: '$name', _id: "$_id" } }
            //         },
            //     }
            // ]);

            // let getAllContent = await ancmtContent.aggregate([
            //     {
            //         $group: {
            //             _id: '$title_id',
            //             content: { $push: { content: '$content', title: '$content_title' } }
            //         },
            //     }, {
            //         $lookup: {
            //             from: 'announcement-titles',
            //             localField: '_id',
            //             foreignField: '_id',
            //             as: 'titleName'
            //         }
            //     },
            //     { $unwind: '$titleName' },
            //     { $project: { 'content': 1, 'titleName._id': 1, 'titleName.name': 1 } }
            // ]);
            // let titleDataFormate = await utils.titleResponseFromat(getAllTitle, getAllContent);
            let response = await utils.subCategoryFormat(getSubCntDetails, res);
            return res.status(200).json(this.successFormat({
                "data": { category: response }
            }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async getAnnouncementDetails(req, res) {
        try {
            let categoryDetails = await ancmtCategories.findOne({ id: req.params.category_id, is_active: true });
            if (!categoryDetails) {
                return res.status(400).json(this.errorMsgFormat({
                    "message": "This announcement category not exits."
                }, 'Announcement'));
            }
            let subCategoryDetaile = await ancmtSubCategories.find({ category_id: categoryDetails._id, is_active: true }).select('name id image_url');
            return res.status(200).json(this.successFormat({
                "data": subCategoryDetaile
            }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async getAncmtSubCategoryDetails(req, res) {
        try {
            let subCategoryDetails = await ancmtSubCategories.findOne({ id: req.params.sub_category_id, is_active: true });
            if (!subCategoryDetails) {
                return res.status(400).json(this.errorMsgFormat({
                    "message": "This announcement sub-category not exits."
                }, 'Announcement'));
            }
            let titleDetails = await ancmtTitle.find({ sub_category_id: subCategoryDetails._id, is_active: true }).select('name id');
            let i = 0, responseData = [];
            while (i < titleDetails.length) {
                let contentDetails = await ancmtContent.find({ title_id: titleDetails[i]._id, is_active: true, approve: true, draft: false }).select('content_title id url summary');
                responseData.push({
                    title_id: titleDetails[i]._id,
                    name: titleDetails[i].name,
                    id: titleDetails[i].id,
                    announcement_content: contentDetails
                });
                i++;
            }
            return res.status(200).json(this.successFormat({
                "data": responseData
            }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async getAncmtTitleDetails(req, res) {
        try {
            let titleDetails = await ancmtTitle.findOne({ id: req.params.title_id, is_active: true });
            if (!titleDetails) {
                return res.status(400).json(this.errorMsgFormat({
                    "message": "This announcement title not exits."
                }, 'Announcement'));
            }
            let contentDetails = await ancmtContent.find({ title_id: titleDetails._id, is_active: true }).select('content_title draft approve id url summary');
            return res.status(200).json(this.successFormat({
                "data": contentDetails
            }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async getAncmtContentDetails(req, res) {
        try {
            let contentDetails = await this.announcementContentFormat(req, 'content');
            if (_.isEmpty(contentDetails)) {
                return res.status(200).json(this.successFormat({
                    "data": []
                }));
            };
            let result = contentDetails[0];
            let relatedArticles = await ancmtContent.find({ is_active: true, id: { $in: result.tags } }).select('id content_title created_date url summary');
            Object.assign(result, { 'related_article': relatedArticles });
            return res.status(200).json(this.successFormat({
                "data": result
            }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async notification(req, res) {
        try {
            let data = req.body.data.attributes;
            switch (data.type) {
                case 'System Message':
                    await this.userNotificationUpdate(data);
                    break;
                case 'activities':
                    await this.ancmtNotificationUpdate(req, data);
                    break;
                default:
                    break;
            }
            return res.status(200).json(this.successFormat({ message: 'User successfully viewed notification' }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async ancmtNotificationUpdate(req, data) {
        try {
            let ancmtNotificationCheck = await ancmtNotification.findOne({ is_active: true, content_id: data.content_id, user: { $in: [req.user.user] } });
            if (ancmtNotificationCheck) {
                return res.status(400).json(this.errorMsgFormat({
                    "message": "This user already viewed notification."
                }));
            }
            let addUserId = await ancmtNotification.findOne({ content_id: data.content_id, is_active: true });
            addUserId.user.push(req.user.user);
            addUserId.save();
            return
        } catch (error) {
            return
        }
    }

    async userNotificationUpdate(data) {
        try {
            return await userNotificationSchema.findOneAndUpdate({ _id: data.content_id }, { is_active: false });
        } catch (error) {
            return
        }
    }

    async getNotificationList(req, res) {
        try {
            let lastSixDays = moment().subtract(6, 'd').format();
            let ancmtNotificationCheck = await ancmtNotification.find({
                is_active: true, created_date: { $gt: lastSixDays },
                user: { $nin: [req.user.user] }
            }).select('id type title url message created_date modified_date content_id');
            let userNotification = await userNotificationSchema.find({
                user: req.user.user,
                created_date: { $gt: lastSixDays }, is_active: true
            });
            let merge = ancmtNotificationCheck.concat(userNotification);
            return res.status(200).json(this.successFormat({ data: merge }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async searchContent(req, res) {
        try {
            let searchContent = await this.announcementContentFormat(req, 'search');
            return res.status(200).json(this.successFormat({ data: searchContent }));
        } catch (error) {
            return res.status(500).send(this.errorMsgFormat({
                "message": error.message
            }, 'asset', 500));
        }
    }

    async announcementContentFormat(req, type) {
        let data = {}, project = {};
        if (type == 'search') {
            if (req.query.category_id) {
                Object.assign(data, { category_id: mongoose.Types.ObjectId(req.query.category_id) });
            }
            Object.assign(data, {
                is_active: true,
                draft: false, approve: true, content: { $regex: req.params.search_id, $options: 'i' }
            });
            project = { 'category.name': 1, 'category.id': 1, 'subCategory.name': 1, 'subCategory.id': 1, 'id': 1, 'content': 1, 'content_title': 1, 'created_date': 1 };
        }
        if (type == 'content') {
            data = { is_active: true, draft: false, approve: true, id: req.params.content_id };
            project = { 'category.name': 1, 'category.id': 1, 'subCategory.name': 1, 'subCategory.id': 1, 'content': 1, 'content_title': 1, 'tags': 1, 'created_date': 1 };
        }
        let searchContent = await ancmtContent.aggregate([
            {
                $match: data
            },
            {
                $lookup: {
                    from: 'announcement-titles',
                    localField: 'title_id',
                    foreignField: '_id',
                    as: 'title'
                }
            },
            {
                $lookup: {
                    from: 'announcement-sub-categories',
                    localField: 'title.sub_category_id',
                    foreignField: '_id',
                    as: 'subCategory'
                }
            },
            {
                $lookup: {
                    from: 'announcement-categories',
                    localField: 'subCategory.category_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$subCategory' },
            { $unwind: '$category' }

            , {
                $project: project
            }
        ]);
        return searchContent;
    }

}
module.exports = new announcement;