'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-veriff');
utils.setLogger(logger);

const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');
const net = require('net');

const nameMatch = require('./name-match');
const authJWT =  require('./auth-jwt');

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
const CACHE = {};

//TODO!
const WHITELISTING = true;
let IP_WHITELIST = [];

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

const RESTRICTED_ROUTES = [
    '/generate-id-url',
    '/check-request'
]

const KEYS = {};

const loadParams = async () => {
    KEYS[process.env.VERIFF_KEY] = process.env.VERIFF_PASSWORD;
    KEYS[process.env.VERIFF_KEY_TEST] = process.env.VERIFF_PASSWORD_TEST;

    IP_WHITELIST = JSON.parse(await utils.fileRead('./ip-whitelist.json', 'utf-8'));
}

const getRecord = (transaction_id)=> {
    return CACHE[transaction_id];
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
        logger.info('Invalid client ID.');
        reply.type('application/json').code(401).send({
            error: 'Invalid client ID.'
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
            const person = v.person;

            if(v.status === 'approved' && person) {

                let record = getRecord(v.vendorData);
                if(record) {
                    if(record.full_name) {
                        data.nameMatchScore = nameMatch.compare(`${person.firstName} ${person.lastName}`, record.full_name, true);
                    } else {
                        data.nameMatchScore = -1;  
                    }

                    if(record.dob) {
                        data.dobMatch = utils.sameDate(record.dob, person.dateOfBirth)
                    } else {
                        data.dobMatch = false;
                    }
                }
            }
            
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
const email_subject = 'ID Verification steps';
const sms_text = 'From FortifID: please use the following link to complete the ID verification steps: %URL%'

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;
    // if (!await checkIP(request, reply)) {
    //     return;
    // }

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        let record;
        if (id.startsWith(':')) {
            record = utils.findObjectByFieldValue(VERIFIED, 'vendorData', id);
            if (!record) {
                record = utils.findObjectByFieldValue(STATUS, 'vendorData', id);
            }

            if (record) {
                data.id = record.id;
            } else {
                record = getRecord(id);
            }

        } else {
            record = VERIFIED[id];
            if (!record) {
                record = STATUS[id];
            }
        }

        if (record) {
            code = 200;
            data.status = record.status || record.action;
            if (record.reason !== null) {
                data.reason = record.reason;
            }

            if(typeof(record.nameMatchScore) !== undefined) {
                data.nameMatchScore = record.nameMatchScore;
            }

            if(typeof(record.dobMatch) !== undefined) {
                data.dobMatch = record.dobMatch;
            }
        } else {
            data.reason = 'Request not found.'
        }
    } else {
        data.status = 'invalid';
        data.reason = 'Invalid or missing transaction ID.';
        code = 422;
    }

    reply.type('application/json').code(code);
    return data;
})

//TODO: REMOVE!!!
fastify.post('/generate-id-url', async (request, reply) => {
    if (!await checkIP(request, reply)) {
        return;
    }

    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    const body = request.body;
    if (body) {
        logger.silly(body);
        body.created = Date.now();
        //TODO!
        let transaction_id = body.transaction_id;
        let full_name = body.full_name;
  

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


fastify.post('/generate-url', async (request, reply) => {
    
    if(!request.user) {
        reply.type('application/json').code(401);

        return {error: 'Unauthorized', code: 401};
    }

    const body = request.body;
    if (body) {
        logger.silly(body);
        //TODO: Sanitize body
        body.created = Date.now();
        let transaction_id = body.transaction_id || `:${utils.getUUID()}`;

        body.transaction_id = transaction_id;
        let full_name = body.full_name;
        let dob = body.birth_date; 

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

        delete body.birth_date;
        
        body.status = 'sent';

        CACHE[transaction_id] =  {
            created: body.created,
            status: body.status,
            full_name:full_name,
            dob: dob
        }
    }

    reply.type('application/json').code(200);
    return body;
})

fastify.addHook("onRequest", async (request, reply) => {
    //console.log(request.routerPath); 
    authJWT.getAuth(request);
})

fastify.listen(8004, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    await loadParams();
    logger.silly(IP_WHITELIST, IP_WHITELIST.length);
})();