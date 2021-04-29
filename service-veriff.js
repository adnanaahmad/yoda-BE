'use strict';
/*jshint esversion: 8 */

const NAME = 'Document Verification';
const TABLE = 'veriff';

const CONFIG_PATH = '/config/veriff/doc';

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const nameMatch = require('./name-match');
const cache = require('./cache');
const authMain = require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if(!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/doc`,
    serve: true,
    prefix: '/',
})

fastify.register(require('fastify-raw-body'), {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true
})

const handler = require('./utils-handlers');
handler.init();

const RESTRICTED_ROUTES = [
    '/generate-url',
    '/check-request'
]

const KEYS = {};

const loadParams = async () => {
    params = await require('./params')(CONFIG_PATH, logger);
    KEYS[params.client_id] = params.client_secret;
    KEYS[params.client_id_test] = params.client_secret_test;
}

const verifySignature = (request, reply) => {
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
    return true;
}

fastify.post('/webhook', {
    config: {
        rawBody: true
    }
}, async (request, reply) => {

    if(!verifySignature(request, reply)) {
        return;
    }
    
    const body = request.body;
    if (body && (body.verification || body.id)) {
        
        logger.silly(body);
        try {
            let expiration = '1w';

            const v = body.verification;
            const id = v ? v.vendorData : body.vendorData;
    
            let record = await cache.getP(TABLE, id);
    
            const data = {
                updated: Date.now() 
            };
    
            if (v) {
                data.status = v.status;
                const person = v.person;
                data.id = v.id;
                data.code = v.code;
                //TODO!
                //technicalData : { ip: '71.64.122.30' }
                if(v.reason !== null) {
                    data.reason = v.reason;
                }
    
                if(v.reasonCode !== null) {
                    data.reasonCode = v.reasonCode;
                }
    
                if (v.status === 'approved' && person) {
                    expiration = '10y';
                    if (record) {
                        let pii = record.pii;
                        if (pii) {
                            pii = cache.crypt.decrypt(pii);
                            if (pii) {
                                if (pii.full_name) {
                                    data.nameMatchScore = nameMatch.compare(`${person.firstName} ${person.lastName}`, pii.full_name, true);
                                } else {
                                    data.nameMatchScore = -1;
                                }
    
                                if (pii.dob) {
                                    data.dobMatch = utils.sameDate(pii.dob, person.dateOfBirth)
                                } else {
                                    data.dobMatch = false;
                                }
                                data.pii = undefined;
                                //TODO!
                                delete data.pii;
                            }
                        }
                    }
                }
            } else {
                data.status = body.action;
                data.id = body.id;
                data.code = body.code;
                data.feature = body.feature;
            }
    
            await cache.updateP(TABLE, id, data, expiration, true);
        } catch (error) {
            console.log(error);            
        }
    }

    reply.type('application/json').code(200);

    return {
        service: TABLE
    }
});

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        let record = await cache.getP(TABLE, id);

        if (record) {
            code = 200;
            data.status = record.status || record.action;
            if (record.reason !== null) {
                data.reason = record.reason;
            }

            if (typeof (record.nameMatchScore) !== 'undefined') {
                data.nameMatchScore = record.nameMatchScore;
            }

            if (typeof (record.dobMatch) !== 'undefined') {
                data.dobMatch = record.dobMatch;
            }

            if(record.redirect_url) {
                data.redirect_url = record.redirect_url;
            }

            if(record.request_reference) {
                data.request_reference = record.request_reference;
            }

        } else {
            data.reason = 'Request not found.'
        }
    } else {
        data.status = 'Invalid';
        data.reason = 'Invalid or missing transaction ID.';
        code = 422;
    }

    reply.type('application/json').code(code);
    return data;
})

//TODO: REMOVE!!!
fastify.post('/generate-id-url', async (request, reply) => {
    const data =  {
        error: 'Deprecated endpoint. Please use /generate-url'
    }

    reply.type('application/json').code(200);
    return data;
})


fastify.post('/generate-url', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'declined'
    };

    if (body && (body.phone_number || body.email_address)) {
        logger.silly(body);
        //TODO: Sanitize body
        //let transaction_id = body.transaction_id || `:${utils.getUUID()}`;
        let transaction_id = utils.getUUID();

        data.transaction_id = transaction_id;

        let full_name = body.full_name;

        //TODO! Do this after validation
        data.url = `https://${SCRIPT_INFO.host}/doc/v1?ref=${encodeURIComponent(transaction_id)}`

        let short = await utils.shortenUrl(data.url);
        data.url = short || data.url;

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {

            const pn = utils.parsePhoneNumber(phone_number);
            if (pn.isValid()) {
                phone_number = pn.getNumber();
                let d = {
                    transaction_id: transaction_id,
                    numbers: phone_number,
                    text: utils.parseTemplate(params.sms_text, {
                        '%URL%': data.url
                    })
                };
                handler.twilio(d);
            } else {
                code = 422;
                data.error = 'Invalid phone number.';
            }
        }

        let email_address = body.email_address;

        if (utils.validateEmail(email_address) && code === 200) {
            let subject = params.email_subject;

            let replacements = {
                "%EMAIL%": email_address,
                "%LINK%": data.url
            };

            let d = {
                transaction_id: transaction_id,
                email: email_address,
                subject: subject,
                template: 'veriff_email',
                replacements: replacements
            };

            if (full_name) {
                d.name = full_name;
            }
            handler.email(d);
        }

        if(code === 200) {
            data.status = 'sent';
            let save = {
                created: data.created,
                status: data.status,
                pii: {}
            };
    
            let dob = body.birth_date;
            if (typeof (dob) === 'string' && dob.length > 0) {
                save.pii.dob = dob;
            }
    
            if (typeof (full_name) === 'string' && full_name.length > 0) {
                save.pii.name = full_name;
            }
    
            if (request.user) {
                save.customer_id = request.user.CustomerAccountID;
            }
    
            let redirect_url = body.redirect_url;
            if (typeof (redirect_url) === 'string' && redirect_url.length > 0) {
                save.redirect_url = redirect_url;
            }
    
            let request_reference = body.request_reference;
            if (typeof (request_reference) === 'string' && request_reference.length > 0) {
                save.request_reference = request_reference;
            }
            
            await cache.setP(TABLE, transaction_id, save, '1w', true);
        } else {
            delete data.transaction_id;
            delete data.url;
        }

    } else {
        code = 422;
        data.error = 'Missing parameter.';
    }

    if(code !== 200) {
        data.status = 'error';
    }

    data.code = code;
    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //console.log(request.routerPath); 
    //authJWT.getAuth(request);
})

const start = ()=> {
  
    fastify.listen(params.port, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
}

(async () => {
    await loadParams();
    start();
})();
