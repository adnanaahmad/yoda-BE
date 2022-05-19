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
fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/plaid-ach`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');
const authMain = require('./auth-main');
const cache = require('./cache');
const plaid = require('./plaid-api');

const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/plaid-ach?ref=%URL%`;

fastify.post('/ach', async (request, reply) => {
    const body = utils.flattenObject2(request.body);
    let code = 200;
    const data = {
        updated: new Date().toISOString(), // Date.now(),
        status: 'unverified',
        code: code,
    };

    if (body && body.public_token && body.transaction_id) {

        const record = await cache.getP(TABLE, body.transaction_id);
        if (record && record.pii) {
            const pii = cache.crypt.decrypt(record.pii);

            try {
                // Plaid Access Token
                let res = await plaid.getAccessToken(body.public_token);
                if (res.access_token) {
                    let expiration = "1w";

                    // Verify ACH
                    res = await plaid.getAch(res.access_token);
                    if (res.numbers.ach.length > 0) {
                        for (let obj of res.numbers.ach) {
                            if (obj.account === pii.account && obj.routing === pii.routing) data.status = 'verified';
                        }
                        expiration = '7y';
                    } else {
                        code = (res.error && res.error.status_code)? res.error.status_code : 422;
                        data.code = code;
                        data.error = (res.error && res.error.error_message)? res.error.error_message : 'Verification Failed';
                    }

                    // Update Table
                    const save = {...data, ...pii};
                    const saved = await cache.updateP(TABLE, body.transaction_id, save, expiration, true);

                    if (saved && saved._expiresAt) {
                        data.transaction_id = body.transaction_id;
                        data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
                    }

                } else {
                    code = (res.error && res.error.status_code)? res.error.status_code : 422;
                    const error = (res.error && res.error.error_message)? res.error.error_message : 'Access Failed';
                    return reply.type('application/json').code(code).send({status: "error", code: code, error: error});
                }
            } catch (error) {
                logger.error(error);
            }
        } else {
            return reply.type('application/json').code(404).send({status: "error", code: 404, error: 'Data not Found'});
        }
    } else {
        return reply.type('application/json').code(422).send({status: "error", code: 422, error: 'Missing Parameter'});
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
        code: code,
    };

    if (body && body.transaction_id) {

        // Plaid Link Token
        const res = await plaid.createLinkToken(body.transaction_id);

        if (res.link_token) {
            data.link_token = res.link_token;
        } else {
            code = (res.error && res.error.status_code)? res.error.status_code : 422;
            const error = (res.error && res.error.error_message)? res.error.error_message : 'Link Failed';
            return reply.type('application/json').code(code).send({status: "error", code: code, error: error});
        }
    } else {
        return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Missing Parameter"});
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.post('/send-notification', async (request, reply) => {

    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = request.body;
    let code = 200;
    const data = {
        created: new Date().toISOString(), // Date.now(),
        status: 'sent',
        code: code,
    };

    if (body && (body.phone_number || body.email_address)) {

        // Input Check
        // Expiration
        let expiration = "1w";
        if (body.expiration && body.expiration.length > 0) {
            expiration = parseInt(body.expiration);
            if (expiration < 30 || expiration > 2592000){ // 1 month!
                return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Expiration must be between 30 and 2592000"});
            }
        }

        // Account Number
        if (!'account' in body || !body.account || body.account.length < 1) {
            return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Account Number is Required"});
        }

        // Routing Number
        if (!'routing' in body || !body.routing || body.routing.length < 1) {
            return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Routing Number is Required"});
        }

        // Transaction ID
        const transaction_id = utils.getUUID();
        const url = DEFAULT_URL.replace("%URL%", encodeURIComponent(transaction_id));

        // DEBUG
        data.link = url;

        if (body.phone_number) {
            let phone_number = utils.parsePhoneNumber(body.phone_number);

            // Send SMS Notification
            if (phone_number.isValid()) {
                phone_number = (((phone_number.getNumber('national')).replace(/[()]/g,'')).replace(/ /g,'-')).replace(/\s/g,'');
                const notification = {
                    transaction_id: transaction_id,
                    numbers: phone_number,
                    text: utils.parseTemplate(params.sms_text, {'%URL%': url})
                };
                handler.twilio(notification);

            } else {
                return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Invalid Phone Number"});
            }
        }

        if (body.email_address) {

            // Send Email Notification
            if (utils.validateEmail(body.email_address)) {
                const email_address = body.email_address;
                const notification = {
                    transaction_id: transaction_id,
                    email: email_address,
                    subject: params.email_subject,
                    template: 'plaid_email',
                    replacements: {"%EMAIL%": email_address, "%LINK%": url},
                };
                handler.email(notification);
                logger.info(`${notification.email}, ${notification.subject}`);

            } else {
                return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Invalid Email Address"});
            }
        }

        // Insert into Table
        const save = {...data, pii: {account: body.account, routing: body.routing}};
        const saved = await cache.setP(TABLE, transaction_id, save, expiration, true);
        if (saved && saved._expiresAt) {
            data.transaction_id = transaction_id;
            data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
        }

    } else {
        return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Missing Parameter"});
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
        code: code,
    };

    if (transaction_id) {
        const record = await cache.getP(TABLE, transaction_id);
        if (record) {
            if (record.status || record.action) data.status = record.status || record.action;
            if (record.created) data.created = new Date(record.created).toISOString();
            if (record.updated) data.updated = new Date(record.updated).toISOString();
            if (record._expiresAt) data.expires_at = new Date(record._expiresAt * 1000).toISOString();

        } else {
            return reply.type('application/json').code(404).send({status: "not_found", code: 404, error: "Data not Found"});
        }
    } else {
        return reply.type('application/json').code(422).send({status: "error", code: 422, error: "Missing Parameter"});
    }

    reply.type('application/json').code(code);
    return data;
})

const start = async () => {
    params = await require('./params')(CONFIG_PATH, logger);

    fastify.listen(params.port, (err, address) => {
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
