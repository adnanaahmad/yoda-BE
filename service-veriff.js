'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-veriff');
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

fastify.register(require('fastify-raw-body'), {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true
})

const handlerTwilioQ = require('./handler-twilio');
const handlerEmailQ = require('./handler-email');

const TEMPLATES = {};
const STATUS = {};
const VERIFIED = {};

const validateUser = async () => {
    // let verified = await utils.comparePassword(code, hash);

    // let hash = await utils.hashPassword(code);
}


//TODO!

const RESTRICTED_ROUTES = [
    '/generate-id-url',
    '/check-request'
]

let IP_WHITELIST = [];

const KEYS = {};

const shortenUrl = async (url, token, full = false) => {
    const data = {
        "long_url": url
    };

    const headers = {
        //"Authorization": `Bearer ${token}`
    };

    const start = utils.time();
    try {
        const results = await utils.fetchData('https://i.dev.fortifid.com/s/', data, headers);
        const duration = utils.time() - start;
        logger.info(`Url shortened to [${results.link}] in ${utils.toFixedPlaces(duration, 2)}ms`);

        return full ? results : results.link;
    } catch (error) {
        logger.error(error);
    }

}

const loadParams = async () => {
    KEYS[process.env.VERIFF_KEY] = process.env.VERIFF_PASSWORD;
    KEYS[process.env.VERIFF_KEY_TEST] = process.env.VERIFF_PASSWORD_TEST;
    IP_WHITELIST = JSON.parse(await utils.fileRead('./veriff-ips.json', 'utf-8'));
}

fastify.post('/webhook', {
    config: {
        rawBody: true
    }
}, async (request, reply) => {

    // TODO! https://developers.veriff.com/#handling-security
    const auth_client = request.headers['x-auth-client'];
    const signature = request.headers['x-signature'];
    //console.log(request.headers);
    //console.log(auth_client, signature);
    if (!auth_client || !signature) {
        logger.info('Authentication required.');
        reply.type('application/json').code(401).send({
            error: 'Authentication required.'
        });
        return;
    }

    const key = KEYS[auth_client];
    if (!key) {
        logger.info('Invalid client id.');
        reply.type('application/json').code(401).send({
            error: 'Invalid client id.'
        });
        return;
    }

    const sig = utils.hash(`${request.rawBody}${key}`, 'sha256', 'hex');
    if (sig !== signature) {
        logger.info('Signature mismatch.');
        reply.type('application/json').code(401).send({
            error: 'Signature mismatch.'
        });
        return;
    }

    const body = request.body;
    if (body) {
        logger.silly(body);
        const v = body.verification;
        if (v) {
            //TODO!
            let data = {
                ...v
            };
            VERIFIED[v.id] = data;
        } else {
            STATUS[body.id] = body;
        }
    }
    reply.type('application/json').code(200);

    return {
        service: 'veriff'
    }
});

//TODO! params!
const email_subject = 'ID Verification Steps';
const sms_text = 'From FortifID: please use the following link to complete the ID verification steps: %URL%'

const checkIP = async (request, reply) => {
    try {
        if (IP_WHITELIST.indexOf(request.ip) === -1) {
            let data = {
                status: 'error',
                reason: `IP address not allowed. ${request.ip}`,
                code: 403
            }
            reply.type('application/json').code(403).send(data);
            logger.warn(data);
            return false;
        } else {
            return true;
        }
    } catch (err) {
        reply.send(err)
    }

}

fastify.get('/add-ip/:ip', async (request, reply) => {
    const ip = request.params.ip || request.ip;
    logger.info(ip);
    if (process.env.IP_KEY !== request.query.key) {
        reply.type('application/json').code(401);
        return {
            error: 'Authentication required.'
        };
    }

    if(!net.isIP(ip)) {
        reply.type('application/json').code(422);
        return {
            error: `Invalid IP address format. ${ip}`
        };
    }
    
    if(IP_WHITELIST.indexOf(ip) > -1) {
        reply.type('application/json').code(422);
        return {
            error: `IP address ${ip} already whitelisted.`
        };
    }
    
    IP_WHITELIST.push(ip);
    reply.type('application/json').code(200).send({ status: 'sucess', message: `IP address ${ip}whitelisted.`});
    await fileWrite(`./veriff-ips.json`, JSON.stringify(IP_WHITELIST, null, 2));
})

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    if (!await checkIP(request, reply)) {
        return;
    }

    const id = request.params.id;
    const data = {
        status: 'waiting'
    };

    logger.info(request.ip, `check-request ${id}`);

    if (id) {
        let record;
        if (id.startsWith(':')) {
            record = utils.findObjectByFieldValue(VERIFIED, 'vendorData', id);
            if (!record) {
                record = utils.findObjectByFieldValue(STATUS, 'vendorData', id);
            }
            if (record) {
                data.id = record.id;
            }
        } else {
            record = VERIFIED[id];
            if (!record) {
                record = STATUS[id];
            }
        }

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

fastify.post('/generate-id-url', async (request, reply) => {
    if (!await checkIP(request, reply)) {
        return;
    }

    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    const body = request.body;
    if (body) {
        logger.silly(body);
        body.start = Date.now();
        //TODO!
        let transaction_id = body.transaction_id;
        body.url = `https://i.dev.fortifid.com/demo/veriff?ref=${encodeURIComponent(transaction_id)}`

        let short = await shortenUrl(body.url);
        body.url = short || body.url;

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            let data = {
                transaction_id: transaction_id,
                numbers: phone_number,
                text: utils.parseTemplate(sms_text, {
                    '%URL%': body.url
                })
            };
            handlerTwilioQ.add(data);

            delete body.phone_number;
        }

        let email_address = body.email_address;

        if (utils.validateEmail(email_address)) {
            let full_name = body.full_name;
            let subject = email_subject;

            let replacements = {
                "%EMAIL%": email_address,
                "%LINK%": body.url
            };

            let data = {
                transaction_id: transaction_id,
                email: email_address,
                subject: subject,
                template: 'veriff_email',
                replacements: replacements
            };

            if (full_name) {
                data.name = full_name;
                delete body.full_name;
            }

            handlerEmailQ.add(data);

            delete body.email_address;
        }

    }

    reply.type('application/json').code(200);
    return body;
})

fastify.addHook("onRequest", async (request, reply) => {
    //console.log(request.routerPath); 
})

fastify.listen(8004, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    await loadParams();
    console.log(IP_WHITELIST, IP_WHITELIST.length);

})();