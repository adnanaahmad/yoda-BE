'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-mfa');
utils.setLogger(logger);

const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');
const net = require('net');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

const handlerTwilioQ = require('./handler-twilio');

const TEMPLATES = {};
const STATUS = {};
const VERIFIED = {};

//TODO!
const WHITELISTING = true;

const RESTRICTED_ROUTES = [
    '/generate-id-url',
    '/check-request'
]

let IP_WHITELIST = [];

const KEYS = {};

const loadParams = async () => {
    //IP_WHITELIST = JSON.parse(await utils.fileRead('./veriff-ips.json', 'utf-8'));
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
        status: 'not found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        let record = STATUS[id];
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
        status: 'not found'
    };

    logger.info(request.ip, `verify ${id}`);

    if (id) {
        let record = STATUS[id];
        if (record) {
            code = 200;
            if (record.status === 'sent') {
                data.verified = now;
                data.status = 'verified';

                record.verified = now;
                record.status = data.status;
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

fastify.post('/generate-mfa-url', async (request, reply) => {
    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    let body = request.body;
    let code = 200;
    const data = {
        start: Date.now(),
        status: 'declined'
    };

    if (body && body.phone_number) {
        logger.silly(body);
        //TODO!
        let transaction_id = body.transaction_id || utils.getUUID();
        data.transaction_id = transaction_id;
        let send = body.send;
        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            let lookup = {
                transaction_id: transaction_id,
                numbers: phone_number
            };

            //delete body.phone_number;
            let results = await handlerTwilioQ.lookup(lookup);

            if (results) {
                //TODO!
                logger.silly(results);
                if (results instanceof Error) {
                    data.reason = results.status === 404 ? 'Invalid phone number or number not found.' : results.message;
                } else if (results.countryCode === 'US' && results.carrier !== null && typeof (results.carrier) === 'object') {
                    let carrier = results.carrier;
                    if (carrier.type === 'mobile') {

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
                        STATUS[transaction_id] = {
                            status: data.status,
                            start: data.start
                        };

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
            data.lookup = results;
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
    //console.log(request.routerPath); 
})

fastify.listen(7997, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    await loadParams();
    //logger.silly(IP_WHITELIST, IP_WHITELIST.length);

})();