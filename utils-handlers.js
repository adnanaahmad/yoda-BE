'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

let _emailQ;
let _twilioQ;
let _webhookQ;

const init = (email = true, twilio = true, webhook = false) => {
    if (typeof (process.env.REDIS_URL) !== 'undefined') {
        const Q = require('./utils-q');
        _twilioQ = twilio ? Q.getQ(Q.names.handler_twilio) : undefined;
        _emailQ = email ? Q.getQ(Q.names.handler_email) : undefined;
        _webhookQ = webhook ? Q.getQ(Q.names.handler_webhook) : undefined;
    } else {
        _twilioQ = twilio ? require('./handler-twilio') : undefined;
        _emailQ = email ? require('./handler-email') : undefined;
        _webhookQ = webhook ? require('./handler-webhook') : undefined;
    }
}

const email = (data, options) => _emailQ.add(data, options);
const twilio = (data, options) => _twilioQ.add(data, options);
const webhook = (data, options) => _webhookQ.add(data, options);

(async () => {

})();

module.exports = {
    init,
    twilio,
    email,
    webhook
}