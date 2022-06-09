const Controller = require('../core/controller');
const browserNotification = require('../db/user-browser-notification');
const _ = require("lodash")
const webPush = require('web-push')
const mongoose = require('mongoose');

class BrowserNotification extends Controller {

    async getUserKeys(req, res) {
        try {
            if (!req.query.type) {
                return res.status(400).json(this.errorMsgFormat("Type is required", 'browser-notification', 400));
            }
            if(req.params.user == 'ALL' && req.query.type == 'socket'){
                let getAllUserKeys = await browserNotification.find({});
                return res.status(200).json(this.successFormat({ result: getAllUserKeys }));
            }
            let user = await browserNotification.findOne({ user: req.params.user })
            if (_.isEmpty(user)) {
                if (req.query.type == 'socket') {
                    return res.status(200).json(this.successFormat({ result: [] }));
                }
                const vapidKeys = webPush.generateVAPIDKeys();
                let result = await new browserNotification({
                    user: req.params.user,
                    public_key: vapidKeys.publicKey,
                    private_key: vapidKeys.privateKey
                }).save();
                delete result.private_key;
                return res.status(200).json(this.successFormat({ result: result }));
            }
            if (req.query.type == 'socket') {
                return res.status(200).json(this.successFormat({ result: user }));
            }
            delete user.private_key;
            return res.status(200).json(this.successFormat({ result: user }));

        } catch (error) {
            return res.status(400).json(this.errorMsgFormat(error.message, 'browser-notification', 400));
        }
    }

    async addSubcribeUrl(req, res) {
        try {
            let data = req.body.data.attributes;
            let checkUser = await browserNotification.findOne({ user: req.params.user });
            if (!checkUser) {
                return res.status(400).json(this.errorMsgFormat(`User doesn't have vapids keys`, 'browser-notification', 400));
            }
            let checkBrowserList = await browserNotification.findOne({ user: req.params.user, "browser_list.type": data.type })
            if (_.isEmpty(checkBrowserList)) {
                await browserNotification.update({ user: req.params.user }, {
                    $push: {
                        browser_list: data
                    }
                });
                return res.status(200).json(this.successFormat({ result: "Data added Successfully" }, 'browser-notification', 200));
            }
            await browserNotification.update({ user: req.params.user, "browser_list.type": data.type }, { $set: { 'browser_list.$.data': data.data } })
            return res.status(200).json(this.successFormat({ result: "Updated Successfully" }, 'browser-notification', 200));
        }
        catch (err) {
            return res.status(400).json(this.errorMsgFormat(err.message, 'browser-notification', 400));
        }
    }

}

module.exports = new BrowserNotification;       