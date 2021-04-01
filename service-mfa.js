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
    // if (!await checkIP(request, reply)) {
    //     return;
    // }

    const id = request.params.id;
    const data = {
        status: 'not found'
    };

    logger.info(request.ip, `check-request ${id}`);

    if (id) {
        let record = STATUS[id];
        if (record) {
            data.status = record.status || record.action;
            if (record.reason !== null) {
                data.reason = record.reason;
            }
        }
    }
    reply.type('application/json').code(200);

    return data;
})

fastify.post('/generate-mfa-url', async (request, reply) => {
    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    let body = request.body;
    let code = 200;
    const data = {
        start: Date.now(),
        sent: false
    };

    if (body && body.phone_number) {
        logger.silly(body);
        //TODO!
        let transaction_id = body.transaction_id || utils.getUUID();
        data.transaction_id = transaction_id;

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            let lookup = {
                transaction_id: transaction_id,
                numbers: phone_number
            };
            
            //delete body.phone_number;
            let results = await handlerTwilioQ.lookup(lookup);
            if (results) {
                if (results.countryCode === 'US' && results.carrier !== null && typeof (results.carrier) === 'object') {
                    let carrier = results.carrier;
                    if (carrier.type === 'mobile') {

                        data.url = `https://i.dev.fortifid.com/mfa-validate?ref=${encodeURIComponent(transaction_id)}`
                        let short = await utils.shortenUrl(data.url);
                        data.url = short || data.url;
                        lookup.text =  utils.parseTemplate(sms_text, {
                            '%URL%': data.url
                        })

                        handlerTwilioQ.add(lookup);
                        data.sent = true;
                    }
                }
            }

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