'use strict';
/*jshint esversion: 8 */

const TABLE = 'plaid-ach';
const CONFIG_PATH = '/config/plaid/service-plaid-ach';

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);
logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const fastify = require('fastify')({
    logger: false,
    trustProxy: true,
    ignoreTrailingSlash: true
})
fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/plaid-ach`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');
const authMain = require('./auth-main');
const cache = require('./cache');
const plaid = require('./plaid-api');

const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/bav?ref=%ID%`;

fastify.post('/ach', async (request, reply) => {
    const body = utils.flattenObject2(request.body);
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'unverified',
    };

    if (body && body.public_token && body.transaction_id) {

        const record = await cache.getP(TABLE, body.transaction_id);
        if (record && record.pii) {
            const pii = cache.crypt.decrypt(record.pii);

            try {
                // Plaid Access Token
                let res = await plaid.getAccessToken(body.public_token);
                if (res.access_token) {
                    let expire = "1w";

                    // Verify ACH
                    res = await plaid.getAch(res.access_token);
                    if (res.numbers.ach.length > 0) {
                        for (let obj of res.numbers.ach) {
                            if (obj.account === pii.account && obj.routing === pii.routing) data.status = 'verified';
                        }
                        expire = '7y';
                    } else {
                        code = (res.error && res.error.status_code) ? res.error.status_code : 422;
                        data.error = (res.error && res.error.error_message) ? res.error.error_message : 'Verification Failed';
                    }

                    const save = { ...data, ...pii };
                    save.updated = data.created;
                    delete save.created;                
                    const saved = await cache.updateP(TABLE, body.transaction_id, save, expire, true);

                    if (saved && saved._expiresAt) {
                        data.transaction_id = body.transaction_id;
                        data.updated =  new Date(data.created).toISOString();
                        data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
                    }

                    if (record.created) {
                        data.created = new Date(record.created).toISOString();
                    }

                    if (record.redirect_url) {
                        data.redirect_url = record.redirect_url;
                    }
                    
                    if (record.request_reference) {
                        data.request_reference = record.request_reference;
                    }
                } else {
                    code = (res.error && res.error.status_code) ? res.error.status_code : 422;
                    const error = (res.error && res.error.error_message) ? res.error.error_message : 'Access Failed';
                    return reply.type('application/json').code(code).send({ status: "error", code, error });
                }
            } catch (error) {
                logger.error(error);
            }
        } else {
            return reply.type('application/json').code(404).send({ status: "error", code: 404, error: 'Data not Found' });
        }
    } else {
        return reply.type('application/json').code(422).send({ status: "error", code: 422, error: 'Missing Parameter' });
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.post('/generate-link', async (request, reply) => {

    const body = request.body;
    let code = 200;
    const data = {
        created: new Date().toISOString(), // Date.now(),
        status: 'success',
    };

    if (body && body.transaction_id) {

        // Plaid Link Token
        const res = await plaid.createLinkToken(body.transaction_id);

        if (res.link_token) {
            data.link_token = res.link_token;
        } else {
            code = (res.error && res.error.status_code) ? res.error.status_code : 422;
            const error = (res.error && res.error.error_message) ? res.error.error_message : 'Link Failed';
            return reply.type('application/json').code(code).send({ status: "error", code, error });
        }
    } else {
        return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Missing Parameter" });
    }

    reply.type('application/json').code(code);
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
        status: 'sent',
    };

    if (body && (body.phone_number || body.email_address)) {

        // Input Check
        // Expiration
        let expire = "1w";
        if (body.expire && body.expire.length > 0) {
            expire = parseInt(body.expire);
            if (expire < 30 || expire > 2592000) { // 1 month!
                return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Expiration must be between 30 and 2592000" });
            }
        }

        // Account Number
        if (!'account' in body || !body.account || body.account.length < 1) {
            return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Account Number is Required" });
        }

        // Routing Number
        if (!'routing' in body || !body.routing || body.routing.length < 1) {
            return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Routing Number is Required" });
        }

        // Transaction ID
        const transaction_id = utils.getUUID();

        let url = typeof (body.link_url) === 'string' && body.link_url.length > 0 ? body.link_url : DEFAULT_URL;
        let text = typeof (body.sms_text) === 'string' && body.sms_text.length > 0 ? body.sms_text : params.sms_text;
        let shorten = typeof (body.shorten_url) === 'boolean' ? body.shorten_url : false;
        let send = typeof (body.send) === 'boolean' ? body.send : true;

        //TODO!
        if(url.indexOf('%URL%')  > -1) {
            url = url.replace('%URL%', '%ID%');
        }

        url = url.replace("%ID%", encodeURIComponent(transaction_id));
        if (shorten) {
            let short = await utils.shortenUrl(url);
            url = short || url;
        }

        data.url = url;

        if (body.phone_number && send) {
            let phone_number = utils.parsePhoneNumber(body.phone_number);

            // Send SMS Notification
            if (phone_number.isValid()) {
                phone_number = (((phone_number.getNumber('national')).replace(/[()]/g, '')).replace(/ /g, '-')).replace(/\s/g, '');
                const notification = {
                    transaction_id: transaction_id,
                    numbers: phone_number,
                    text: utils.parseTemplate(text, { '%URL%': url })
                };
                handler.twilio(notification);

            } else {
                return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Invalid Phone Number" });
            }
        }

        if (body.email_address && send) {

            // Send Email Notification
            if (utils.validateEmail(body.email_address)) {
                const email_address = body.email_address;
                const notification = {
                    transaction_id: transaction_id,
                    email: email_address,
                    subject: params.email_subject,
                    template: 'plaid_email',
                    replacements: { "%EMAIL%": email_address, "%LINK%": url },
                };
                handler.email(notification);
                logger.info(`${notification.email}, ${notification.subject}`);

            } else {
                return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Invalid Email Address" });
            }
        }

        const save = { ...data, pii: { account: body.account, routing: body.routing } };

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

        const saved = await cache.setP(TABLE, transaction_id, save, expire, true);
        if (saved && saved._expiresAt) {
            data.transaction_id = transaction_id;
            data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
        }

    } else {
        return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Missing Parameter" });
    }


    if (typeof (data.created) === "number") {
        data.created = new Date(data.created).toISOString();
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.get('/check-request/:id', async (request, reply) => {

    const transaction_id = request.params.id;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'found',
    };

    if (transaction_id) {
        const record = await cache.getP(TABLE, transaction_id);
        if (record) {
            data.transaction_id = transaction_id;
            if (record.created) {
                data.created = new Date(record.created).toISOString();
            }
            
            if (record.status || record.action) {
                data.status = record.status || record.action;
            }
            
            if (record.updated) {
                data.updated = new Date(record.updated).toISOString();
            }
            
            if (record._expiresAt) {
                data.expires_at = new Date(record._expiresAt * 1000).toISOString();
            }

            if (record.redirect_url) {
                data.redirect_url = record.redirect_url;
            }

            if (record.request_reference) {
                data.request_reference = record.request_reference;
            }
        } else {
            return reply.type('application/json').code(404).send({ status: "not_found", code: 404, error: "Data not Found" });
        }
    } else {
        return reply.type('application/json').code(422).send({ status: "error", code: 422, error: "Missing Parameter" });
    }

    reply.type('application/json').code(code);
    return data;
})

const start = async () => {
    params = await require('./params')(CONFIG_PATH, logger);

    fastify.listen({ port: params.port }, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
    params.plaid_remote_clients = String(params.plaid_remote_clients).split(',');
    await handler.init(true, true); // email, twilio
    await plaid.init(params);
}

(async () => {
    await start();
})();
