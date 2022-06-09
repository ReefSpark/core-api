const express = require('express');
const router = express.Router();
const Controller = require('../core/controller');
const controller = new Controller()
const notification = require('../core/browser-notification');
const info = require('../middlewares/info');
const auth = require('../middlewares/authentication');

router.get('/:user', async (req, res) => {
    try {
        await notification.getUserKeys(req, res)

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'browser-notification', 500));
    }
})

router.post('/subscribe/:user', async (req, res) => {
    try {
        await notification.addSubcribeUrl(req, res)

    } catch (err) {
        return res.status(500).send(controller.errorMsgFormat({
            'message': err.message
        }, 'browser-notification', 500));
    }
})

module.exports = router