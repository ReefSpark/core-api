const config = require('config');
require('dotenv').config();
const Controller = require('../core/controller');
const moment = require('moment');
const accountActive = require('../db/account-active');
const user =  require('../core/user');
const users = require('../db/users');
const _ = require('lodash')


class userHelper extends Controller {

    async accountActiveCountIncrese(data, timeNow) {
        await accountActive.findOneAndUpdate({ email: data.email, type_for: 'login' },
            {
                $inc: {
                    count: 1
                },
                create_date: timeNow
            });
    }

    accountExpiryTimeCheck(isChecked) {
        let date = new Date(isChecked.create_date);
        let getSeconds = date.getSeconds() + config.get('accountActive.timeExpiry');
        let duration = moment.duration(moment().diff(isChecked.create_date));
        return { getSeconds, duration: duration.asSeconds() };
    }

    //G2F VERIFIED ONLY BALANCE UPDATE
    async g2fVerifiedOnlyBalanceUpadte(req, res) { 
        let payload = req.body.data;
        let checkUser = await users.findOne({ _id: payload.id });
        if (_.isEmpty(checkUser)) {
            return { status: false, error: "User Object Id doesn't exits" };
        }
        if (checkUser.google_auth) {
            if (!payload.attributes.g2f_code) {
                return { status: false, error: "Google authentication code must be provided." };
            }
            let check = await user.postVerifyG2F(req, res, 'boolean');
            if (check.status == false) {
                return { status: false, error: "The google authentication code you entered is incorrect." };
            }
            return { status: true }
        }
        return { status: false, error: "Doesn't g2f enable this user" };
    }

}

module.exports = new userHelper();