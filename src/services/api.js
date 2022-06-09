const axios = require('axios');
const jwt = require('jsonwebtoken');
const Controller = require('../core/controller');
const helpers = require('../helpers/helper.functions');
const assets = require('../db/assets');
const users = require('../db/users');
const accesToken = require('../db/management-token');
const config = require('config');
const controller = new Controller;
const market = require('../db/market-list');
const favourite = require('../db/favourite-user-market');
// const Binance = require('binance-api-node').default;
// const kafka = require('kafka-node');
const orderCancel = require('../db/order-cancel');
const fs = require('fs');
const moment = require('moment');
const _ = require('lodash');
const device = require('../db/device-management');
const branca = require("branca")(config.get('encryption.realKey'));
const { AuthenticatedClient } = require("../helpers/AuthenticatedClient");
const Utils = require('../helpers/utils');
const utils = new Utils();
const redis = helpers.redisConnection();
const orders = require('../db/orders');
const fee = require('../db/matching-engine-config');
const marketLastPrice = require('../db/market-last-price');
const matchingEngineConfig = require('../db/matching-engine-config');
const assetHelper = require('../helpers/asset.helpers');

class Api extends Controller {

    async sendEmailNotification(data, res) {
        if (data.email_for !== 'registration' && data.email_for !== 'welcome' && data.email_for != 'kyc-verificationfail') {

            if (!data.user_id) {
                return res.status(400).send(controller.errorMsgFormat({ "message": "User could not be found." }, 'users', 400));
            }
            if (data.email_for == 'wallet-withdraw') {
                data.code = helpers.encrypt(JSON.stringify(
                    {
                        user: data.user_id,
                        user_id: data.userId,
                        code: data.verification_code
                    }))
            }
        }

        if (process.env.NODE_ENV === 'development' && data.email_for === "otp-login") {
            return;
        }
        axios.post(`${process.env.NOTIFICATION}/api/${process.env.NOTIFICATION_VERSION}/email-notification`, this.requestDataFormat(data))
            .then((res) => {

            })
            .catch((err) => {
                throw (err.message)
            });

    }

    async initAddressCreation(user) {
        try {
            let results = await assets.find({
                delist: false,
                auto_address_generate: true,
                is_active: true
            });
            results.forEach((result) => {
                let data = {
                    "coin": result.asset_code,
                    "user_id": user.user_id,
                    "user": user._id,
                    "asset": result._id
                };
                return this.axiosAPI(data)
            });

        } catch (err) {
            throw (err.message)
        }
    }

    axiosAPI(data) {

        axios.post(
            `${process.env.WALLETAPI}/api/${process.env.WALLETAPI_VERSION}/address/generate`, this.requestDataFormat(data)
        ).then(axiosResponse => {
            if (axiosResponse.data !== undefined) {
                return axiosResponse.data;
            }
        }).catch(axiosError => {
            if (axiosError.response !== undefined) throw (axiosError.response)
        });
    }

    async OkexHttp(input, req, res) {
        const timestamp = await utils.getTime();
        const authClient = new AuthenticatedClient(process.env.HTTPKEY, process.env.HTTPSECRET, process.env.PASSPHRASE, timestamp.epoch);

        let body = input;
        let response = await authClient.spot().postOrder(body);
        if (response.result) {
            if (input.type == 'market') {
                response.order_id = `OX:${response.order_id}`
                await this.addResponseInREDIS(response);
                return res.status(200).send(controller.successFormat({ 'message': "The Market order has been placed " }))
            } else {
                req.data.attributes['source'] = `OX-${response.order_id}`;
                response.order_id = `OX:${response.order_id}`
                await this.addResponseInREDIS(response);
                await this.matchingEngineRequest('post', 'order/put-limit', req, res);
            }

        }
        else {
            return res.status(500).send(controller.errorMsgFormat({
                'message': 'Something went wrong, Please try again'
            }, 'order-matching', 500));
        }
    }
    async matchingEngineGetRequest(path, res) {
        let axiosResponse = await axios['get'](
            `${process.env.MATCHINGENGINE}/api/${process.env.MATCHINGENGINE_VERSION}/${path}`);
        let result = axiosResponse.data;
        if (result.status) {
            return res.status(200).send(controller.successFormat(result.result.result, result.result.id))
        } else {
            return res.status(result.errorCode).send(controller.errorMsgFormat({
                'message': result.error
            }, 'order-matching', result.errorCode));
        }
    }

    async matchingEngineQueryRequest(path, data, res) {
        let value = Object.values(data);
        let axiosResponse = await axios.get(
            `${process.env.MATCHINGENGINE}/api/${process.env.MATCHINGENGINE_VERSION}/${path}?${Object.keys(data)}=${value[0]}`);
        let result = axiosResponse.data;
        if (result.status) {
            return res.status(200).send(controller.successFormat(result.result.result, result.result.id))
        } else {
            return res.status(result.errorCode).send(controller.errorMsgFormat({
                'message': result.error
            }, 'order-matching', result.errorCode));
        }
    }

    async authenticationInfo(req) {
        try {
            let jwtOptions = {
                issuer: config.get('secrete.issuer'),
                subject: 'Authentication',
                audience: config.get('secrete.domain'),
                expiresIn: config.get('secrete.infoToken')
            };

            let token = req.headers.info;
            const deviceInfo = await jwt.verify(token, config.get('secrete.infokey'), jwtOptions);
            const checkToken = await accesToken.findOne({ user: deviceInfo.info, info_token: token, type_for: "info-token" });
            if (!checkToken || checkToken.is_deleted) {
                throw 'Authentication failed. Your request could not be authenticated.';
            } else {
                let checkDevice = await device.findOne({
                    browser: deviceInfo.browser,
                    user: deviceInfo.info,
                    browser_version: deviceInfo.browser_version,
                    is_deleted: false,
                    region: deviceInfo.region,
                    city: deviceInfo.city,
                    os: deviceInfo.os
                })
                let checkActive = await users.findOne({ _id: deviceInfo.info, is_active: false });
                if (!checkDevice) {
                    return { status: false, result: "The device are browser that you are currently logged in has been removed from the device whitelist." };

                } else if (checkActive) {
                    await accesToken.findOneAndUpdate({ user: checkActive.id, info_token: token, type_for: "info-token" }, { is_deleted: true });
                    return { status: false, result: "Your account is under auditing. Please contact support." };


                }
                else {
                    return { status: true }
                }
            }

        }

        catch (error) {
            return { status: false, result: "Authentication failed. Your request could not be authenticated." };
        }
    }
    async authentication(req) {
        try {

            let verifyOptions = {
                issuer: config.get('secrete.issuer'),
                subject: 'Authentication',
                audience: config.get('secrete.domain'),
                expiresIn: config.get('secrete.expiry')
            };
            const token = req.headers.authorization;
            const dataUser = await jwt.verify(token, config.get('secrete.key'), verifyOptions);
            const data = JSON.parse(branca.decode(dataUser.token));
            const isChecked = await accesToken.findOne({
                user: data.user, access_token: token, type_for: "token"
            })
            if (!isChecked || isChecked.is_deleted) {
                throw 'Authentication failed. Your request could not be authenticated.';
            }
            else {
                return { status: true, result: data }
            }


        }
        catch (error) {
            return { status: false, result: "Authentication failed. Your request could not be authenticated." };
        }

    }
    async matchingEngineRequestForMarketList(path, req, res, type = 'withoutAdd') {
        let makerFeeRate = await matchingEngineConfig.findOne({ config: 'makerFeeRate' });
        let takerFeeRate = await matchingEngineConfig.findOne({ config: 'takerFeeRate' });
        if (req.headers.authorization && req.headers.info) {
            let markets = [];
            let isInfo = await this.authenticationInfo(req);
            let isChecked = await this.authentication(req);
            if (!isInfo.status || !isChecked.status) {
                return res.status(401).json(controller.errorMsgFormat({
                    message: "Authentication failed. Your request could not be authenticated."
                }, 'user', 401));
            }
            let getMarket = await market.find({ is_active: true });
            if (getMarket.length == 0) {
                return res.status(404).send(controller.errorMsgFormat({
                    'message': "Market could not be found."
                }, 'users', 404));
            }
            let q = 0;
            while (q < getMarket.length) {
                let checkedFavorite = await favourite.findOne({
                    user: isChecked.result.user, market: {
                        $in: [
                            getMarket[q]._id
                        ]
                    }
                })
                if (checkedFavorite) {
                    markets.push(getMarket[q].market_name);
                }
                q++;
            }
            let axiosResponse = await axios.get(
                `${process.env.MATCHINGENGINE}/api/${process.env.MATCHINGENGINE_VERSION}/${path}`)
            const result = axiosResponse.data;
            let response = result.result.result;
            let data = await this.marketListActiveCheck(getMarket, response);
            if (result.status) {
                let i = 0;
                while (i < markets.length) {
                    let j = 0;
                    while (j < data.length) {
                        if (data[j].name == markets[i]) {
                            data[j].is_favourite = true;
                        }
                        j++;
                    }
                    i++;
                }
                let z = 0;
                while (z < data.length) {
                    if (!data[z].is_favourite) {
                        data[z].is_favourite = false
                    }
                    z++;
                }
                //add q in response 
                let QResponse = await this.addQResponse(data, getMarket, takerFeeRate, makerFeeRate)
                data = QResponse.data;
                getMarket = QResponse.getMarket;
                await this.marketPairs(data, result, res);
            }
            else {
                return res.status(result.errorCode).send(controller.errorMsgFormat({
                    'message': result.error
                }, 'order-matching', result.errorCode));
            }

        }
        else {
            let getMarket = await market.find({ is_active: true });
            let axiosResponse = await axios['get'](
                `${process.env.MATCHINGENGINE}/api/${process.env.MATCHINGENGINE_VERSION}/${path}`);
            let result = axiosResponse.data;
            if (result.status) {
                let response = result.result.result;
                let data = await this.marketListActiveCheck(getMarket, response);
                if (type == 'withAdd') {
                    return { status: true, result: data };
                }
                let z = 0;
                while (z < data.length) {
                    data[z].is_favourite = false
                    z++;
                }
                //add q in response 
                let QResponse = await this.addQResponse(data, getMarket, takerFeeRate, makerFeeRate)
                data = QResponse.data;
                getMarket = QResponse.getMarket;
                await this.marketPairs(data, result, res);
            } else {
                return res.status(result.errorCode).send(controller.errorMsgFormat({
                    'message': result.error
                }, 'order-matching', result.errorCode));
            }
        }
    }

    async addQResponse(data, getMarket, takerFeeRate, makerFeeRate) {

        for (let k = 0; k < data.length; k++) {
            for (let j = 0; j < getMarket.length; j++) {
                if (data[k].name == getMarket[j].market_name) {
                    data[k].min_amount = (getMarket[j].min_amount == "0") ? data[k].min_amount : getMarket[j].min_amount;
                    data[k].money_prec = (getMarket[j].money_prec == 0) ? data[k].money_prec : getMarket[j].money_prec;
                    data[k].stock_prec = (getMarket[j].stock_prec == 0) ? data[k].stock_prec : getMarket[j].stock_prec;
                    data[k].taker_fee = (getMarket[j].market_taker_fee && getMarket[j].fee_discount == true) ? (Number(getMarket[j].market_taker_fee) * 100).toFixed(2) : (Number(takerFeeRate.value) * 100).toFixed(2);
                    data[k].maker_fee = (getMarket[j].market_maker_fee && getMarket[j].fee_discount == true) ? (Number(getMarket[j].market_maker_fee) * 100).toFixed(2) : (Number(makerFeeRate.value) * 100).toFixed(2);
                    data[k].priority = getMarket[j].priority;
                    data[k].q = getMarket[j].q;
                    data[k].disable_trade = getMarket[j].disable_trade;
                    if (getMarket[j].q == true) {
                        if (data[k].stock == "ETH") {
                            data[k].min_amount = "0.05"
                        }
                        if (data[k].stock == "BTC") {
                            data[k].min_amount = "0.001"
                        }

                    }
                    getMarket[j].min_amount = data[k].min_amount;
                    getMarket[j].save()
                }
            }
        }
        return { data, getMarket };
    }

    //Collect ot market pairs
    async marketPairs(data, result, res) {
        try {
            let j = 0;
            let isCheck = await assets.find({ is_active: true });
            while (j < data.length) {
                _.map(isCheck, function (asset) {
                    asset.eco_system = asset.eco_system ? asset.eco_system : ''
                    if (asset.asset_code == data[j].stock) {
                        if (asset.delist) {
                            data.splice(j, 1);
                        }
                    }
                });
                j++;
            }
            let response = [];
            let pairs = [];
            let market_name = []
            let pair = await _.unionBy(data, 'money');
            await _.map(pair, async function (uniquePair) {
                pairs.push(uniquePair.money);
            });
            _.map(data, function (nofMarkets) {
                market_name.push(nofMarkets.name);
            });
            let ecoSystem = await _.unionBy(isCheck, 'eco_system');
            let uniqueEcoSystem = [];
            await _.map(ecoSystem, function (e) {
                e.eco_system ? uniqueEcoSystem.push(e.eco_system) : '';
            });
            let assetData = await assets.find({ is_active: true });
            for (var i = 0; i < pairs.length; i++) {
                let markets = [];
                let k = 0;
                while (k < data.length) {
                    let assetUrl = assetData.find((e) => e ? e.asset_code == data[k].stock : '');
                    if (assetUrl) {
                        data[k].logo_url = assetUrl.logo_url;
                        data[k].eco_system = assetUrl.eco_system ? assetUrl.eco_system : '';
                        if (pairs[i] == data[k].money) {
                            markets.push(data[k]);
                        }
                    }
                    k++;
                }
                markets.sort((obj1, obj2) => obj2.priority - obj1.priority);
                response.push({ [pairs[i]]: markets });
            }
            let allEcoSystem = [];
            for (let z = 0; z < uniqueEcoSystem.length; z++) {
                let marketWithPairs = [];
                for (var i = 0; i < pairs.length; i++) {
                    let markets = [];
                    let k = 0;
                    while (k < data.length) {
                        let assetUrl = assetData.find((e) => e ? e.asset_code == data[k].stock : '');
                        if (assetUrl) {
                            data[k].logo_url = assetUrl.logo_url;
                            data[k].eco_system = assetUrl.eco_system ? assetUrl.eco_system : '';
                            if (pairs[i] == data[k].money && uniqueEcoSystem[z] == data[k].eco_system) {
                                markets.push(data[k]);
                            }
                        }
                        k++;
                    }
                    markets.sort((obj1, obj2) => obj2.priority - obj1.priority);
                    marketWithPairs.push(markets);
                }
                allEcoSystem.push({ [uniqueEcoSystem[z]]: _.flattenDepth(marketWithPairs, 1) });
            }
            response = response.concat(allEcoSystem);
            return res.status(200).send(controller.successFormat([response, market_name], result.result.id))
        } catch (err) {
            return res.status(result.errorCode).send(controller.errorMsgFormat({
                'message': err.message
            }, 'order-matching'));
        }

    }

    async matchingEngineRequest(method, path, input, res, type = 'json', liquidity, allOrderCancel) {
        let source = " ";
        let data = null;
        if (path == 'order/cancel') {
            data = input.data.attributes;
            if (data.source) {
                source = data.source
                delete input.data.attributes.source
            }
        }
        const axiosResponse = await axios[method](
            `${process.env.MATCHINGENGINE}/api/${process.env.MATCHINGENGINE_VERSION}/${path}`, input)
        const result = axiosResponse.data;
        if (result.status) {
            let value = result.result.result;
            if (type === 'json') {
                if (allOrderCancel == 'allOrderCancel') {
                    return value;
                }
                if (path == 'order/put-limit') {
                    let data = {};
                    data = value;
                    data['order_id'] = data.id;
                    delete data.id;
                    new orders(data).save();
                }
                if (path == 'order/cancel') {
                    orders.deleteOne({ order_id: value.id });
                    await new orderCancel(value).save();
                    if (liquidity.q && source.startsWith("OX")) {
                        let body
                        const timestamp = await utils.getTime();
                        const authClient = new AuthenticatedClient(process.env.HTTPKEY, process.env.HTTPSECRET, process.env.PASSPHRASE, timestamp.epoch);
                        let pair = data.market
                        if (pair.substr(pair.length - 4) == 'USDT') {
                            body = pair.slice(0, pair.length - 4) + '-' + pair.slice(pair.length - 4);
                        }
                        else {
                            body = pair.slice(0, pair.length - 3) + '-' + pair.slice(pair.length - 3);
                        }
                        let response = await authClient.spot().postCancelOrder(source.substr(source.indexOf('-') + 1), { "instrument_id": body.toLowerCase() });
                        if (response.result) {
                            response.order_id = `OX:${response.order_id}`
                            await this.addResponseInREDIS(response, "cancel");
                            return res.status(200).send(controller.successFormat({ 'message': "Your order has been cancel" }));
                        }
                        else {
                            return res.status(500).send(controller.errorMsgFormat({
                                'message': 'Something went wrong, Please try again'
                            }, 'order-matching', 500));
                        }
                    }
                }
                return res.status(200).send(controller.successFormat(value, result.result.id));
            } else {
                return controller.successFormat(value, result.result.id);
            }
        } else {
            if (type == 'json') {
                return res.status(result.errorCode).send(controller.errorMsgFormat({
                    'message': result.error
                }, 'order-matching', result.errorCode));
            }
            return controller.errorFormat(result.error);
        }
    }

    async marketPrice(assetsName, convertTo = 'usd,btc') {
        return await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${assetsName}&vs_currencies=${convertTo}`);
    }

    async getmarketPrice(assetNames, assetCode, res) {
        let i = 0, response = {}, value;
        let marketLastPriceAll = await marketLastPrice.find({});
        // let assetPrice = await this.matchingEngineRequest('post', 'market/last', this.requestDataFormat({ "market": "BTCUSDT" }), res, 'data');
        // let usd = Number(assetPrice.data.attributes);
        // while (i < assetNames.length) {
        //     if (assetNames[i] == 'bitcoin' || assetNames[i] == 'tether') {
        //         value = {
        //             "btc": (assetNames[i] == 'bitcoin') ? 1 : 1 / usd,
        //             "usd": (assetNames[i] == 'bitcoin') ? usd : 1
        //         };
        //         response[assetNames[i]] = value;
        //     }
        //     else {
        //         if (assetNames[i] == 'prediqt') {
        //             let PQTMarket = await this.matchingEngineRequest('post', 'market/last', this.requestDataFormat({ "market": "PQTUSDT" }), res, 'data');
        //             let value = {
        //                 "btc": PQTMarket.data.attributes / usd,
        //                 "usd": PQTMarket.data.attributes
        //             };
        //             response[assetNames[i]] = value;
        //         } else {
        //             let coinCode = (assetCode[i] === 'IDRT') ? ('BTC' + assetCode[i]) : (assetCode[i] + 'BTC');
        //             let marketLast = await this.matchingEngineRequest('post', 'market/last', this.requestDataFormat({ "market": coinCode }), res, 'data');
        //             let btcValue = marketLast.data.attributes;
        //             let value = {
        //                 "btc": btcValue,
        //                 "usd": btcValue * usd
        //             };
        //             response[assetNames[i]] = value;
        //             if (marketLast.data.attributes.message) {
        //                 if ((marketLast.data.attributes.message).message == 'invalid argument') {
        //                     let value = {
        //                         "btc": 0,
        //                         "usd": 0
        //                     };
        //                     response[assetNames[i]] = value;
        //                 }
        //             }
        //         }
        //     }
        //     i++;
        // }
        let usdValuerequest = await marketLastPrice.findOne({ market_name: 'BTCUSDT' });
        let usdValue = Number(usdValuerequest.last_price);
        while (i < assetCode.length) {
            let assetLastPrice = await utils.assetLastPrice(assetCode[i], marketLastPriceAll);
            if (assetNames[i] == 'tether') {
                value = {
                    "btc": (usdValue) ? 1 / usdValue : 0,
                    "usd": 1
                };
                response[assetNames[i]] = value;
            }
            if (assetLastPrice.market_pair == 'BTC') {
                let value = {
                    "btc": Number(assetLastPrice.last_price),
                    "usd": (usdValue) ? Number(assetLastPrice.last_price) * usdValue : 0
                };
                response[assetNames[i]] = value;
            } else if (assetLastPrice.market_pair == 'USDT') {
                let value = {
                    "btc": (usdValue) ? Number(assetLastPrice.last_price) / usdValue : 0,
                    "usd": Number(assetLastPrice.last_price)
                };
                response[assetNames[i]] = value;
            }
            i++;
        }
        return response;
    }

    async publishNotification(user, data) {
        return await redis.publish(`NOTIFICATIONS:${user}`, JSON.stringify(data));
    }

    async addResponseInREDIS(response, type = 'nonCancel') {
        redis.rpush(response.order_id, JSON.stringify(response));
        redis.rpush(response.order_id, type == 'cancel' ? JSON.stringify({ cancel: true }) : JSON.stringify({ cancel: false }));
        redis.on('error', (err) => {
            console.log(err);
        })
        let fileConent = `(${moment().format('YYYY-MM-DD HH:mm:ss')}) : success : ${response.order_id} : ${response.client_oid} : ${JSON.stringify(response)}`
        fs.appendFile('redisSuccess.txt', `\n${fileConent} `, function (err) {
            if (err)
                console.log("Error:", err);
        });


    }

    async DisposableEmailAPI(data) {

        let axiosResponse = await axios.get(`https://block-temporary-email.com/check/domain/${data}`)
        if (axiosResponse.data) {
            return axiosResponse.data
        }
    }

    async getAccessCode(data, res) {
        try {
            let axiosResponse = await axios.post(`${process.env.fractal_auth}?client_id=${process.env.client_id}&client_secret=${process.env.client_secret}&code=${data}&grant_type=${process.env.grant_type}&redirect_uri=${process.env.redirect_uri}`)
            if (axiosResponse.data) {
                return axiosResponse.data
            }
        }
        catch (err) {
            return false
        }

    }

    async checkUserMe(data) {
        try {
            let axiosResponse = await axios.get(`${process.env.fractal_user}`, {
                headers: {
                    Authorization: 'Bearer ' + data
                }
            })

            if (axiosResponse.data) {
                return axiosResponse.data
            }
        }
        catch (err) {
            return false
        }
    }

    async tradeFeeSetter(req, checkUser, market, takerFee, makerFee) {
        req.body.data.attributes.takerFeeRate = (market.fee_discount) ? (market.market_taker_fee).toString() : (checkUser.taker_fee_detection_percentage) ? (takerFee.value - (takerFee.value * Number(checkUser.taker_fee_detection_percentage) / 100)).toString() : (takerFee.value).toString();
        req.body.data.attributes.makerFeeRate = (market.fee_discount) ? (market.market_maker_fee).toString() : (checkUser.maker_fee_detection_percentage) ? (makerFee.value - (makerFee.value * Number(checkUser.maker_fee_detection_percentage) / 100)).toString() : (makerFee.value).toString();
        return
    }

    async order(req, res, type) {
        req.body.data.attributes.user_id = Number(req.user.user_id);
        let data = req.body.data.attributes;
        let takerFee = await fee.findOne({ config: 'takerFeeRate' });
        let makerFee = await fee.findOne({ config: 'makerFeeRate' });
        let check = await market.findOne({ market_name: data.market });
        let checkUser = await users.findOne({ _id: req.user.user });
        let checktrade = await assetHelper.assetTradeChecker(data.market);
        if (!checktrade) {
            return res.status(400).send(controller.errorMsgFormat({ message: 'Trade is disabled for this asset' }));
        }
        if (!checkUser.trade) {
            return res.status(400).send(controller.errorMsgFormat({ message: 'Trade is disabled for this account' }));
        }
        if (!checkUser.is_active) {
            return res.status(400).send(controller.errorMsgFormat({ message: 'Your account is under auditing. Please contact support.' }));
        }
        if (check.is_active == false || check.disable_trade == true) {
            return res.status(400).send(controller.errorMsgFormat({ message: `The  market-${data.market} is inactive` }));
        }
        await this.tradeFeeSetter(req, checkUser, check, takerFee, makerFee);
        if (type == 'limit') {
            if (parseInt(check.minimum_amount) >= parseInt(data.amount)) {
                return res.status(400).send({
                    message: 'The order you have placed is lesser than the minimum price'
                }, 'order-matching', 400)
            }
            await this.okexInput(req, res, data, 'limit', check);
        } else {
            await this.okexInput(req, res, data, 'market', check);
        }

    }

    async okexInput(req, res, data, type, check) {
        if (check.q) {
            let amount = Number(req.body.data.attributes.amount);
            let payloads = {},
                asset = [], asset_code;
            payloads.user_id = req.user.user_id;
            if (data.side == 1) {
                asset_code = data.market.replace(check.market_pair, "");
                asset.push(asset_code.toUpperCase());
            } else {
                asset_code = check.market_pair;
                asset.push(asset_code.toUpperCase());
                amount = amount * Number(req.body.data.attributes.pride);
            }
            payloads.asset = asset;
            let apiResponse = await this.matchingEngineRequest('post', 'balance/query', this.requestDataFormat(payloads), res, 'data');
            let currentBalance = Number(apiResponse.data.attributes[asset_code].available);
            if (amount <= currentBalance) {
                let side = data.side == 2 ? "buy" : "sell";
                let pair = data.market;
                let input;
                let body;
                if (pair.substr(pair.length - 4) == 'USDT') {
                    body = pair.slice(0, pair.length - 4) + '-' + pair.slice(pair.length - 4);
                }
                else {
                    body = pair.slice(0, pair.length - 3) + '-' + pair.slice(pair.length - 3);
                }
                let fee = req.body.data.attributes.takerFeeRate.replace('.', 'D')
                if (type == 'limit') {
                    input = Object.assign({}, {
                        'type': 'limit',
                        'side': side,
                        'instrument_id': body,
                        'size': Number(data.amount),
                        'client_oid': `BDXU${data.user_id}F${fee}`,
                        'price': data.pride,
                        'order_type': '0'
                    })
                } else {
                    input = Object.assign({}, {
                        'type': 'market',
                        'side': side,
                        'instrument_id': body,
                        'size': data.side == 1 ? Number(data.amount) : 0,
                        'client_oid': `BDXU${data.user_id}F${fee}`,
                        "notional": data.side == 2 ? data.amount : '',
                        'order_type': '0'
                    })
                }
                await this.OkexHttp(input, req.body, res);
            }
            return res.status(400).send(this.errorMsgFormat({ 'message': 'The order cannot be placed due to insufficient balance.' }, null, 'api', 400));
        } else {
            await this.matchingEngineRequest('post', `order/${type == 'limit' ? 'put-limit' : 'put-market'}`, req.body, res);
        }
    }

    async userApi(pair) {
        return axios.get(`http://api.beldex.io/api/v1/market/last/${pair}`)
    }

    async allOrdersCancel(req, res, user, type) {
        let requestedData = req.body.data.attributes, marketList;
        if (!requestedData.market) {
            marketList = await market.find({ is_active: true });
        } else {
            marketList = await market.find({ market_name: requestedData.market, is_active: true });
        }
        if (_.isEmpty(marketList)) {
            return res.status(400).json(this.errorMsgFormat({
                "message": 'This market not active.'
            }, 'api'));
        }
        let i = 0;
        while (i < marketList.length) {
            let orderPendingRequest = {};
            Object.assign(orderPendingRequest, {
                market: marketList[i].market_name,
                offset: 0,
                limit: 10,
                user_id: user
            });
            let orderdetails = await this.matchingEngineRequest('post', 'order/pending', this.requestDataFormat(orderPendingRequest), res, 'json', marketList[i], type);
            let j = 0;
            while (j < orderdetails.total) {
                let orderCancelRequest = {};
                Object.assign(orderCancelRequest, { "market": orderdetails.records[j].market, "order_id": orderdetails.records[j].id, user_id: user, "source": orderdetails.records[j].source });
                await this.matchingEngineRequest('post', 'order/cancel', this.requestDataFormat(orderCancelRequest), res, 'json', marketList[i], type);
                j++;
            }
            i++;
        }
        if (type == 'disable')
            return;
        return res.status(200).send(this.successFormat({
            'message': 'Successfully all orders cancel'
        }, null, 'api', 200));
    }

    async okexRequest() {
        try {
            const timestamp = await utils.getTime();
            const authClient = new AuthenticatedClient(process.env.WITHDRAWAL_HTTPKEY, process.env.WITHDRAWAL_HTTPSECRET, process.env.PASSPHRASE, timestamp.epoch);
            return { status: true, result: authClient }
        }
        catch (err) {
            return { status: false, error: err.message }
        }

    }

    marketListActiveCheck(marketList, matchingEndineResponse) {
        let i = 0, response = [];
        while (i < marketList.length) {
            let j = 0;
            while (j < matchingEndineResponse.length) {
                if (marketList[i].market_name == matchingEndineResponse[j].name) {
                    response.push(matchingEndineResponse[j]);
                }
                j++;
            }
            i++;
        }
        return response;
    }
}

module.exports = new Api();