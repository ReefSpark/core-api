const express = require('express');
const user = require('../core/user');
const password = require('../core/password');
const Controller = require('../core/controller');
const auth = require('../middlewares/authentication');
const refresh_auth = require('../middlewares/auth')
const registration = require('../core/registration');
const slide = require('../core/geetest-captcha');
const router = express.Router();
const info = require('../middlewares/info');
const { emailValidation, loginValidation, otpValidation, otpValidationForMobile, resendOtpValidation, forgetPasswordValidation, resetPasswordValidation, changePasswordValidation, settingsValidation, g2fSettingValidation, favouriteValidation, kycDetailsValidation, apiKeyValidation, moveBalanceValidation, userVotingCoin, g2fResetRequest, g2fValidateOtp, g2fResendOtp } = require('../validation/user.validations');
const controller = new Controller;
const user_api_auth = require('../middlewares/user-api-auth');
const apiServices = require('../services/api');
const Utils = require('../helpers/utils');
const utils = new Utils();


router.post('/email-verify', async (req, res) => {
    try {
        let { error } = await emailValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        return user.mailVerified(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/activation/:hash', (req, res) => {
    try {
        user.activate(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/encrypt', (req, res) => {
    try {
        user.userEncryption(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/login', async (req, res) => {
    try {
        let { error } = await loginValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.login(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/validate/otp', async (req, res) => {
    try {
        if (Boolean(req.headers.transportable) == true) {
            let { error } = await otpValidationForMobile(req.body.data.attributes);
            if (error) {
                return res.status(400).send(controller.errorFormat(error, 'users', 400));
            }
            return user.validateOtpForEmail(req, res, "forget-password");
        }
        let { error } = await otpValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.validateOtpForEmail(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});
router.post('/resend/otp', async (req, res) => {
    try {
        let { error } = await resendOtpValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            user.resendOtpForEmail(req, res, req.body.data.attributes.type);
        }

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});


router.delete('/', (req, res) => {
    user.removeUser(req.body.data.attributes.email, res);
});

router.post('/forget-password', (req, res) => {
    try {
        let { error } = forgetPasswordValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.sendResetLink(req, res);
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/reset-password/:hash', (req, res) => {
    try {
        password.checkResetLink(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});


router.patch('/reset-password', async (req, res) => {
    try {
        await utils.passwordDecryption(req.body.data.attributes, res);
        let { error } = resetPasswordValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.resetPassword(req, res);
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.patch('/change-password', auth, info, async (req, res) => {
    try {
        await utils.passwordDecryption(req.body.data.attributes, res);
        let { error } = changePasswordValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            password.changePassword(req, res);
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/get-user-id', (req, res) => {
    try {
        if (req.headers.authorization) {

            return user.getTokenToUserId(req, res);
        } else {
            return res.status(401).json(controller.errorMsgFormat({
                message: "Invalid authentication",
                data: req.headers
            }, 'users', 401));
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/login-history', auth, info, (req, res) => {
    try {
        user.getLoginHistory(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/device-history', auth, info, (req, res) => {
    try {
        user.getDeviceHistory(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.patch('/whitelist-ip/:hash', (req, res) => {
    try {
        return user.patchWhiteListIP(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.patch('/settings', auth, info, (req, res) => {
    try {
        let { error } = settingsValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            user.patchSettings(req, res, 'withG2f');
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/resend-email', (req, res) => {
    try {
        registration.resendEmail(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }));
    }
});

router.patch('/disable', (req, res) => {
    try {
        user.disableAccount(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get("/gt/register-slide", function (req, res) {

    try {
        slide.register(null, function (err, data) {
            if (err) {
                return res.status(500).send(err);
            }
            return res.status(200).json(controller.successFormat({
                'message': 'Captcha values fetching successfully...',
                'data': data
            }));
        });
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/g2f-create', info, auth, (req, res) => {
    try {
        user.insert2faAuth(req, res);
    } catch (err) {
        return res.status(400).send(controller.errorMsgFormat({
            'message': error
        }, 'users', 400));
    }

});

router.patch('/g2f-settings', info, auth, (req, res) => {
    try {
        let { error } = g2fSettingValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        } else {
            user.patch2FAuth(req, res);
        }
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/g2f-verify', (req, res) => {
    try {
        user.postVerifyG2F(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/token', info, refresh_auth, async (req, res) => {
    try {
        await user.refreshToken(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});


router.post('/logout', auth, async (req, res) => {
    try {
        await user.logout(req.user, req.headers, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.delete('/whitelist', info, auth, async (req, res) => {
    try {
        let data = req.body.data.attributes;
        data.user = req.user.user;
        data.user_id = req.user.user_id
        await user.deleteWhiteList(data, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});
router.post('/market', async (req, res) => {
    try {
        await user.addMarkets(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/market/list', async (req, res) => {
    try {
        await user.marketList(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/favourite', info, auth, async (req, res) => {
    try {
        let { error } = favouriteValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        await user.addFavouriteUser(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.patch('/favourite', info, auth, async (req, res) => {
    try {
        await user.updateFavourite(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});


router.post('/generate/otp', async (req, res) => {
    try {
        if (req.body.data.attributes.type) {
            let user_id;
            if (req.headers.authorization && req.headers.info) {
                let isInfo = await apiServices.authenticationInfo(req);
                let isChecked = await apiServices.authentication(req);

                if (!isInfo.status) {
                    return res.status(401).json(controller.errorMsgFormat({
                        message: isInfo.result
                    }, 'user', 401));
                }
                else if (!isChecked.status) {
                    return res.status(401).json(controller.errorMsgFormat({
                        message: isChecked.result
                    }, 'user', 401));
                }
                user_id = isChecked.result.user;
            }
            if (req.body.data.attributes.type === 'reset-password') {
                user_id = req.body.data.id;
            }
            await user.generatorOtpforEmail(user_id, req.body.data.attributes.type, res);
        } else {
            return res.status(400).send(controller.errorMsgFormat({
                'message': "Type is required"
            }, 'users', 400));
        }
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/withdraw/active', info, auth, async (req, res) => {
    try {
        await user.withdrawActive(req.user.user, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/kyc-session', info, auth, async (req, res) => {
    try {
        await user.kycSession(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/kyc-update', async (req, res) => {
    try {
        await user.kycUpdate(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/referrer-history/:code', info, auth, async (req, res) => {
    try {
        await user.referrerHistory(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/reward-history', info, auth, async (req, res) => {
    try {
        return user.rewardHistory(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'wallet', 500));
    }
});

router.post('/kyc-details', info, auth, async (req, res) => {
    try {
        let { error } = kycDetailsValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        await user.kycDetails(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/kyc_statistics', info, auth, async (req, res) => {
    try {
        await user.kycStatistics(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});
router.post('/apikey', info, auth, async (req, res) => {
    try {
        let { error } = apiKeyValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        await user.checkApikey(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }


});

router.get('/currency-list', (req, res) => {
    try {
        return user.listCurrencies(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message,
        }, 'users', 400));
    }
});

router.post('/currency-convert', auth, async (req, res) => {
    try {
        await user.changeCurrency(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message,
        }, 'users', 400));
    }
});

router.get('/reward-balance', auth, info, async (req, res) => {
    try {
        await user.rewardUserBalance(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/move-balance', auth, info, async (req, res) => {
    try {
        let { error } = moveBalanceValidation(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        await user.moveReward(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/trade-balance', auth, info, async (req, res) => {
    try {
        await user.tradeBalance(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }

});

router.get('/kyc_verified', auth, info, async (req, res) => {
    try {
        await user.kycVerified(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/show-reward-balance', auth, info, async (req, res) => {
    try {
        await user.showMovedBalance(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/script', async (req, res) => {
    try {
        await user.script(req, res);
    }
    catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/get-token', user_api_auth, (req, res) => {
    try {
        user.getToken(req, res);

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/withdraw-discount', auth, info, (req, res) => {
    try {
        user.withdrawDiscount(req, res);

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.patch('/disable-token', (req, res) => {
    try {
        user.disableToken(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/user-info', auth, (req, res) => {
    try {
        user.getUserInfo(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/voting-list', auth, info, (req, res) => {
    try {
        user.votingCoinList(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.post('/vote', auth, info, (req, res) => {
    try {
        let { error } = userVotingCoin(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.userVote(req, res);

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }

});

router.get('/banners', (req, res) => {
    try {
        user.getPanetPosters(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'users', 500));
    }
});

router.get('/trade-volume', auth, info, (req, res) => {
    try {
        user.getUserTradeVolume(req, res);
    } catch (error) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': error.message
        }, 'users', 500));
    }
});

router.post('/g2f-reset', (req, res) => {
    try {
        let { error } = g2fResetRequest(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.g2fResetRequest(req, res);
    } catch (error) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': error.message
        }, 'users', 500));
    }
});

router.post('/g2f/validate-otp', (req, res) => {
    try {
        let { error } = g2fValidateOtp(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.g2fValidateOtp(req, res);
    } catch (error) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': error.message
        }, 'users', 500));
    }
});

router.post('/g2f/resend-otp', (req, res) => {
    try {
        let { error } = g2fResendOtp(req.body.data.attributes);
        if (error) {
            return res.status(400).send(controller.errorFormat(error, 'users', 400));
        }
        user.g2fResendOtp(req, res);
    } catch (error) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': error.message
        }, 'users', 500));
    }
});

router.get('/update/anti-spoofing', (req, res) => {
    try {
        user.updateScript(req, res);
    } catch (error) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': error.message
        }, 'users', 500));
    }
});

router.get('/market/pairs/:asset', async (req, res) => {
    try {
        await user.getAllAssetPairs(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'marketlist', 500));
    }
});

router.get('/detectionuser', async (req, res) => {
    try {
        await user.tradeFeeDetectionUser(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'user', 500));
    }
});

router.get('/removetradefee', async (req, res) => {
    try {
        await user.removeTakerMakerFee(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'user', 500));
    }
});

router.post('/timeline', async (req, res) => {
    try {
        await user.userTimeLineUpdate(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'user', 500));
    }
});

router.get('/script-user', async (req, res) => {
    try {
        await user.scriptForUserEmail(req, res);
    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'user', 500));
    }
});

module.exports = router;
