'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

let _emailQ;
let _twilioQ;
let _webhookQ;
let _snsQ;

const init = async (email = true, twilio = true, webhook = false, sns = false) => {
    let redisUrl = await awsClient.getParameter('/config/shared/redis/url');

    if (typeof (redisUrl) !== 'undefined') {
        const Q = require('./utils-q');
        //TODO!
        _twilioQ = twilio ? Q.getQ(Q.names.handler_twilio) : undefined;
        _emailQ = email ? Q.getQ(Q.names.handler_email) : undefined;
        _webhookQ = webhook ? Q.getQ(Q.names.handler_webhook) : undefined;
        _snsQ = sns ? Q.getQ(Q.names.handler_sns) : undefined;
    } else {
        _twilioQ = twilio ? require('./handler-twilio') : undefined;
        _emailQ = email ? require('./handler-email') : undefined;
        _webhookQ = webhook ? require('./handler-webhook') : undefined;
        _snsQ = sns ? require('./handler-sns') : undefined;
    }
}

const email = (data, options) => _emailQ.add(data, options);
const twilio = (data, options) => _twilioQ.add(data, options);
const webhook = (data, options) => _webhookQ.add(data, options);
const sns = (data, options) => _snsQ.add(data, options);

(async () => {
    
})();

module.exports = {
    init,
    twilio,
    email,
    webhook,
    sns
}