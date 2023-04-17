'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

let _emailQ;
let _twilioQ;
let _webhookQ;
let _snsQ;

// The function init initializes necessary queues for handling communication methods (email, twilio, webhook, and SNS) if available, uses Redis if available, and sets the different queues to undefined if not available.
const init = async (email = true, twilio = true, webhook = false, sns = false) => {
    //TODO!
    let redisUrl = await awsClient.getParameter('/config/shared/redis/url');
    if (typeof (redisUrl) !== 'undefined' && redisUrl.startsWith('redis') ) {
        const Q = require('./utils-q');
        Q.setRedisUrl(redisUrl);
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
// These four functions (email, twilio, webhook, and sns) are custom queue interfaces that add payloads data and optional options objects to corresponding queues (_emailQ, _twilioQ, _webhookQ, and _snsQ) for processing later.
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