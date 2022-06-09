const Users = require('../db/users');
const apiServices = require('../services/api');
const Controller = require('../core/controller');
const helpers = require('../helpers/helper.functions');
const config = require('config');
const bcrypt = require('bcryptjs');
const mangHash = require('../db/management-hash');
const moment = require('moment');
const User = require('../core/user');
const redis = helpers.redisConnection();

let checkHash = null;
class Password extends Controller {

    encryptHash(email, user) {
        let timeNow = moment().format('YYYY-MM-DD HH:mm:ss');
        let data = JSON.stringify({
            'email': email,
            'datetime': timeNow,
            'user': user

        });

        return helpers.encrypt(data);
    }

    sendResetLink(req, res) {
        Users.findOne({
            email: req.body.data.attributes.email
        }).exec()
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json(this.errorMsgFormat({ 'message': 'User cannot be found. If already registered please contact our support or Register again.' }));
                } else {
                    // let index = req.body.data.attributes.email.indexOf('@');
                    // let check = await apiServices.DisposableEmailAPI(req.body.data.attributes.email.substring(index + 1));
                    // if (!check.dns) {
                    //     return res.status(400).send(this.errorMsgFormat({
                    //         'message': 'Invaild Email'
                    //     }));
                    // } else if (!check.dns || check.temporary) {
                    //     return res.status(400).send(this.errorMsgFormat({
                    //         'message': 'Invaild Email'
                    //     }));
                    // }
                    let encryptedHash = this.encryptHash(user.email, user._id);

                    // send email notification to the registered user
                    if (req.headers.transportable) {
                        const isChecked = await User.generatorOtpforEmail(user._id, 'forget-password', res)
                        if (isChecked.status) {
                            return res.status(200).send(this.successFormat({ 'message': "An OTP has been sent to your registered email address." }, user._id));
                        }
                        return res.status(400).send(this.successFormat({ 'message': "Something went wrong" }, user._id));
                    }
                    let serviceData = {
                        'hash': encryptedHash,
                        'subject': `Password Reset - ${moment().format('YYYY-MM-DD HH:mm:ss')} (${config.get('settings.timeZone')})`,
                        'email_for': 'forget-password',
                        'user_id': user._id
                    };
                    await apiServices.sendEmailNotification(serviceData, res);
                    await mangHash.update({ email: user.email, is_active: false, type_for: "reset" }, { $set: { is_active: true, created_date: moment().format('YYYY-MM-DD HH:mm:ss') } })
                    await new mangHash({ email: user.email, hash: encryptedHash, type_for: "reset", created_date: moment().format('YYYY-MM-DD HH:mm:ss') }).save();
                    return res.status(200).json(this.successFormat({
                        'message': 'A password reset link has been sent to your registered email address. Please check your email to reset your password.',
                        'hash': encryptedHash
                    }, user._id));
                }
            });
    }
    async forgetPasswordResend(req, res) {
        let input = req.body.data;
        let user = await Users.findOne({ _id: input.id, email: input.attributes.email });
        if (user) {
            let ischecked = await mangHash.findOne({ email: user.email, is_active: false, type_for: "reset" })
            if (ischecked) {
                if (ischecked.count > config.get('site.hmtLink')) {
                    await mangHash.findOneAndUpdate({ email: user.email, is_active: false, type_for: "reset" }, { is_active: true, created_date: moment().format('YYYY-MM-DD HH:mm:ss') })
                    return res.status(400).send(this.errorMsgFormat({
                        'message': `You have exceeded the maximum email resend request. Please click the 'Forgot Password' option to continue. `
                    }, 'users', 400));
                }
            }
            let encryptedHash = this.encryptHash(user.email, user._id);
            if (ischecked) {
                let count = ischecked.count;
                await mangHash.findOneAndUpdate({ email: user.email, is_active: false, type_for: "reset" }, { hash: encryptedHash, count: ++count, created_date: moment().format('YYYY-MM-DD HH:mm:ss') });
            }
            let serviceData = {
                'hash': encryptedHash,
                'subject': `Password Reset - ${moment().format('YYYY-MM-DD HH:mm:ss')} (${config.get('settings.timeZone')})`,
                'email_for': 'forget-password',
                'user_id': user._id
            };

            await apiServices.sendEmailNotification(serviceData, res);
            return res.status(200).json(this.successFormat({
                'message': 'A password reset link has been resent to your registered email address. Please check your email to reset your password.'
            }, user._id));

        } else {
            return res.status(400).send(this.errorMsgFormat({ 'message': 'User cannot be found. Please contact support.' }, 'user', 400));
        }
    }
    async checkResetLink(req, res) {
        let userHash = JSON.parse(helpers.decrypt(req.params.hash, res));
        let checkHash = await mangHash.findOne({ email: userHash.email, hash: req.params.hash });
        if (checkHash) {
            if (checkHash.is_active) {
                return res.status(400).send(this.errorMsgFormat({
                    'message': 'The password reset link has already been used. Please login to continue.'
                }));
            } else {
                req.body.checkHash = checkHash;
                await this.resetPassword(req, res, 'hash');
            }
        } else {
            return res.status(400).send(this.errorMsgFormat({
                'message': 'The password reset link has expired. Please login to continue.'
            }));
        }
        if (userHash.email) {
            let checkExpired = this.checkTimeExpired(userHash.datetime);
            if (checkExpired) {
                let result = await Users.findOne({ email: userHash.email, _id: userHash.user }).exec()
                if (!result) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': "User cannot be found."
                    }));
                }
                return res.status(200).send(this.successFormat({
                    'message': 'The password reset link has been validated.',
                    "google_auth": result.google_auth
                }, result._id));
            }
            return res.status(404).send(this.errorMsgFormat({
                'message': 'The password reset link has expired. Please login to continue.'
            }));

        } else {
            return res.status(404).send(this.errorMsgFormat({
                'message': 'User cannot be found.'
            }));
        }
    }

    checkTimeExpired(startDate) {
        let date = new Date(startDate);
        let getSeconds = date.getSeconds() + config.get('activation.expiryTime');
        let duration = moment.duration(moment().diff(startDate));
        if (getSeconds > duration.asSeconds()) {
            return true;
        }
        return false;
    }

    async resetPassword(req, res, type = 'reset') {
        if (type == 'hash') {
            checkHash = req.body.checkHash;
            return;
        }
        let data = req.body.data.attributes;
        const checkPassword = await Users.findById({ _id: req.body.data.id });
        if (type === 'reset') {
            if (Boolean(req.headers.transportable) == true) {
                if (checkPassword.google_auth) {
                    let checkData = await this.checkOtpOrG2f('both', req, res, data);
                    if (!checkData.checkOtp.status || !checkData.checkG2f.status) {
                        return res.status(400).send(this.successFormat({
                            'message': !checkData.checkOtp.status ? checkData.checkOtp.error : checkData.checkG2f.error
                        }, checkPassword._id, 'users', 400));
                    }
                }
                else {
                    let checkData = await this.checkOtpOrG2f('otp', req, res, data);
                    if (!checkData.status) {
                        return res.status(400).send(this.successFormat({
                            'message': checkData.error
                        }, checkPassword._id, 'users', 400));
                    }
                }

            } else if (checkPassword.google_auth == true) {
                let checkData = await this.checkOtpOrG2f('g2f', req, res, data);
                if (!checkData.status) {
                    return res.status(400).send(this.successFormat({
                        'message': checkData.error
                    }, checkPassword._id, 'users', 400));
                }
            } else {
                let checkData = await this.checkOtpOrG2f('otp', req, res, data);
                if (!checkData.status) {
                    return res.status(400).send(this.successFormat({
                        'message': checkData.error
                    }, checkPassword._id, 'users', 400));
                }
            }
        }
        let comparePassword = await bcrypt.compare(data.password, checkPassword.password);
        if (comparePassword) {
            return res.status(400).send(this.successFormat({
                'message': 'Please enter a password that you have not used before.'
            }, checkPassword._id, 'users', 400));
        }
        let salt = await bcrypt.genSalt(10);
        let hash = await bcrypt.hash(data.password, salt);
        // find and update the reccord
        let user = await Users.findByIdAndUpdate(req.body.data.id, { password: hash });
        if (user == null) {
            return res.status(404).send(this.errorMsgFormat({ 'message': 'Invalid user.' }));
        } else {
            if (type == 'change') {
                let serviceData = {
                    subject: `Beldex Change Password From ${data.email} - ${moment().format('YYYY-MM-DD HH:mm:ss')}( ${config.get('settings.timeZone')} )`,
                    email_for: "confirm-password",
                    email: data.email,
                    user_id: data.user_id
                }
                await apiServices.sendEmailNotification(serviceData, res);
                await Users.findOneAndUpdate({ _id: req.body.data.id }, { withdraw: false, password_reset_time: moment().format('YYYY-MM-DD HH:mm:ss') });
                await helpers.publishAndStoreData({ publish: { type: 'System Message', title: 'Password Changed', message: `Your Password Was Changed Successfully`, url: `${process.env.FRONT_END_URL}userAccount`, isStore: true, user_settings: { 'change_password': true, 'logout': true } }, store: { activity: `Your Password Was Changed Successfully`, at: new Date } }, req.body.data.id, 'both', `NOTIFICATIONS`);
                return res.status(202).send(this.successFormat({
                    'message': 'Your password has been changed successfully.'
                }, user._id, 'users', 202));
            }
            if (checkHash != null) {
                await mangHash.findOneAndUpdate({ email: checkHash.email, hash: checkHash.hash, is_active: false, type_for: "reset" }, { is_active: true, created_date: moment().format('YYYY-MM-DD HH:mm:ss') })
            }
            let serviceData = {
                subject: `Beldex Reset Password  ${moment().format('YYYY-MM-DD HH:mm:ss')}( ${config.get('settings.timeZone')} )`,
                email_for: "reset-password",
                email: user.email,
                user_id: user._id
            }
            await redis.set(`WITHDRAW_DISABLED_USER:${user._id}`, true);
            await redis.expire(`WITHDRAW_DISABLED_USER:${user._id}`, 86400);
            await apiServices.sendEmailNotification(serviceData, res);
            await helpers.publishAndStoreData({ publish: { type: 'System Message', title: 'Reset Password', message: `Your Password Was Reset Successfully`, url: `${process.env.FRONT_END_URL}userAccount`, isStore: true, user_settings: { 'reset_password': true, 'logout': true } }, store: { activity: `Your Password Was Reset Successfully`, at: new Date } }, user._id, 'both', `NOTIFICATIONS`);
            return res.status(202).send(this.successFormat({
                'message': 'Your password has been reset successfully.'
            }, user._id, 'users', 202));
        }
    }

    async checkOtpOrG2f(type, req, res, data) {
        switch (type) {
            case 'g2f': {
                let checkG2f = await this.g2fValid(req, res, data);
                return checkG2f
            }
            case 'otp': {
                let checkOtp = await this.otpValid(req, res, data);
                return checkOtp
            }
            case 'both': {
                let g2f = await this.g2fValid(req, res, data);
                let otp = await this.otpValid(req, res, data);
                return { checkOtp: otp, checkG2f: g2f }
            }
        }
    }

    async g2fValid(req, res, data) {
        if (!data.g2f_code) {
            return { status: false, error: 'Google authentication code must be provided.' }
        }
        let check = await User.postVerifyG2F(req, res, 'boolean');
        if (check.status == false) {
            return { status: false, error: 'The google authentication code you entered is incorrect.' }
        }
        return { status: true }
    }

    async otpValid(req, res, data) {
        if (data.otp == null || undefined) {
            return { status: false, error: 'OTP is required.' }
        }
        let checkOtp = await User.validateOtpForEmail(req, res, "reset-password");
        if (checkOtp.status == false) {
            return { status: false, error: checkOtp.err }
        }
        return { status: true }
    }

    async changePassword(req, res) {
        let requestData = req.body.data.attributes;
        requestData.old_password = await helpers.decrypt(requestData.old_password, res);
        if (requestData.old_password === '') {
            return res.status(400).send(this.errorMsgFormat({
                message: 'Your request was not encrypted.'
            }));
        }
        Users.findById(req.body.data.id)
            .exec()
            .then(async (result) => {
                let check = null;
                if (!result) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'User cannot be found.'
                    }));
                }

                if (result.google_auth) {
                    if (!requestData.g2f_code) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'Google authentication code must be provided.'
                        }, 'user', 400));
                    }
                    let check = await User.postVerifyG2F(req, res, 'boolean');
                    if (check.status == false) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'The google authentication code you entered is incorrect.'
                        }, '2factor', 400));
                    }

                } else {
                    if (requestData.otp == null || undefined) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': 'OTP must be provided.'
                        }, 'user', 400));
                    }
                    let checkOtp = await User.validateOtpForEmail(req, res, "change password");
                    if (checkOtp.status == false) {
                        return res.status(400).send(this.errorMsgFormat({
                            'message': checkOtp.err
                        }, 'user', 400));
                    }
                }
                let passwordCompare = bcrypt.compareSync(requestData.old_password, result.password);

                if (passwordCompare == false) {
                    return res.status(400).send(this.errorMsgFormat({
                        'message': 'The current password you entered is incorrect.'
                    }));
                } else {
                    req.body.data.attributes.email = result.email;
                    req.body.data.attributes.user_id = result._id;
                    // update password
                    this.resetPassword(req, res, 'change', result.email);
                }
            });
    }
}

module.exports = new Password;