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
const handlerEmailQ = require('./handler-email');

const TEMPLATES = {};
const STATUS = {};
const VERIFIED = {};

const validateUser = async () => {
    // let verified = await utils.comparePassword(code, hash);
    // let hash = await utils.hashPassword(code);
}


//TODO!
const WHITELISTING = true;

const RESTRICTED_ROUTES = [
    '/generate-id-url',
    '/check-request'
]

let IP_WHITELIST = [];

const KEYS = {};

const loadParams = async () => {
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

        if(!WHITELISTING) {
            return true;
        }

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

//Not REST standard but I wanted this to be easy to use
fastify.get('/ip-add/:ip', async (request, reply) => {
    const ip = request.params.ip || request.ip;
    logger.info('/ip-add', ip);
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
    reply.type('application/json').code(200).send({ status: 'sucess', message: `IP address ${ip} whitelisted.`});
    await utils.fileWrite(`./veriff-ips.json`, JSON.stringify(IP_WHITELIST, null, 2));
})

fastify.get('/ip-list', async (request, reply) => {
    if (process.env.IP_KEY !== request.query.key) {
        reply.type('application/json').code(401);
        return {
            error: 'Authentication required.'
        };
    }

    reply.type('application/json').code(200).send(IP_WHITELIST);
})


fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    // if (!await checkIP(request, reply)) {
    //     return;
    // }

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

        let short = await utils.shortenUrl(body.url);
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
    logger.silly(IP_WHITELIST, IP_WHITELIST.length);

})();