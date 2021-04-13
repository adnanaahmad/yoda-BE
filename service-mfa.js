'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-mfa');
utils.setLogger(logger);

const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');
const net = require('net');

const cache = require('./cache');

const authMain =  require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

const twilioUtils = require('./handler-twilio');

const Q = require('./utils-q');
const handlerTwilioQ = Q.getQ(Q.names.handler_twilio);
const handlerWebhookQ = Q.getQ(Q.names.handler_webhook);

const STATUS = {};

const RESTRICTED_ROUTES = [
    '/generate-id-url',
    '/check-request'
]

const loadParams = async () => {
}

//TODO! params!
const email_subject = 'MFA step';
//Multi-factor authentication
const sms_text = 'From FortifID: please use the following link to complete the Secure MFA step: %URL%'

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;
    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        //let record = STATUS[id];
        let record = await cache.get('mfa', id);

        if (record) {
            data.status = record.status;
            if (record.reason !== null) {
                data.reason = record.reason;
            }

            if (record.verified) {
                data.verified = record.verified;
            }
            code = 200;
        }
    }
    reply.type('application/json').code(code);

    return data;
})

fastify.get('/verify/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;
    // if (!await checkIP(request, reply)) {
    //     return;
    // }

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    logger.info(request.ip, `verify ${id}`);

    if (id) {
        //let record = STATUS[id];
        let record = await cache.getP('mfa', id);
        if (record) {
            code = 200;
            if (record.status === 'sent') {
                data.verified = now;
                data.status = 'verified';

                if(record.request_reference) {
                    data.request_reference = record.request_reference;
                }

                if(record.redirect_url) {
                    data.redirect_url = record.redirect_url;
                }

                record.verified = now;
                record.status = data.status;
                //TODO!
                await cache.setP('mfa', id, record, undefined, true);
            } else if (record.status === 'verified') {
                data.status = 'used';
            } else {
                data.status = record.status;
                data.verified = record.verified;
            }
            //TODO: Expiration!
        }
    }

    reply.type('application/json').code(code);

    return data;
})

fastify.post('/generate-url', async (request, reply) => {
    if(!await authMain.checkHeaders(request, reply)) {
        return;
    }

    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    let body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'declined'
    };

    if (body && body.phone_number) {
        logger.silly(body);
        //TODO!
        let transaction_id = body.transaction_id || utils.getUUID();
        data.transaction_id = transaction_id;
        let send = typeof(body.send) === 'boolean' ? body.send : true;
        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            let lookup = {
                transaction_id: transaction_id,
                numbers: phone_number
            };

            //delete body.phone_number;
            let results = await twilioUtils.lookup(lookup);

            if (results) {
                //TODO!
                logger.silly(results);
                if (results instanceof Error) {
                    data.reason = results.status === 404 ? 'Invalid phone number or number not found.' : results.message;
                } else if (results.carrier !== null && typeof (results.carrier) === 'object') {
                    let carrier = results.carrier;

                    if (carrier.type === 'mobile') {
                        //TODO!
                        if(results.countryCode === 'US') {
                            if (send) {
                                data.url = `https://i.dev.fortifid.com/mfa-validate?ref=${encodeURIComponent(transaction_id)}`
                                let short = await utils.shortenUrl(data.url);
                                data.url = short || data.url;
    
                                lookup.text = utils.parseTemplate(sms_text, {
                                    '%URL%': data.url
                                });
    
                                handlerTwilioQ.add(lookup);
                            }
    
                            data.status = send ? 'sent' : 'lookup';

                            let save = {
                                customer_id: request.user.CustomerAccountID,
                                status: data.status,
                                created: data.created,
                            };

                            if(typeof(body.redirect_url) !== 'undefined') {
                                save.redirect_url = body.redirect_url;
                            }

                            if(typeof(body.request_reference) !== 'undefined') {
                                save.request_reference = body.request_reference;
                            }

                            await cache.setP('mfa', transaction_id, save, '1w', true);

                            // STATUS[transaction_id] = {
                            //     status: data.status,
                            //     created: data.created
                            // };
                        } else {
                            data.reason = `Unsupported country: ${results.countryCode}`;    
                        }
                    } else {
                        data.reason = 'Must use a valid mobile phone number (no VOIP or landlines accepted)';
                    }
                } else {
                    data.reason = 'Invalid or unknown carrier data.';
                }
            }

            if (results.moreInfo) {
                delete results.moreInfo;
            }

            if (results.url) {
                delete results.url;
            }

            delete results.addOns;
            delete results.level;
            //data.lookup = results;
        }
    } else {
        code = 422;
        data = {
            error: 'Missing parameter',
            code: code,
        }
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //authJWT.getAuth(request);
})


fastify.addHook('onResponse', async (request, reply) => {
    if(request.user) {

        // let log = {
        //     customer_id: user.
        // }
    }
})

fastify.listen(7997, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

// fastify.ready(err => {
//     if (err) throw err
//     fastify.swagger()
// })

(async () => {
    await loadParams();
    //logger.silly(IP_WHITELIST, IP_WHITELIST.length);

})();