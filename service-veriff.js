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

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const dayjs = require('dayjs');
const MIN_DATE = dayjs("1/1/1900");
const MAX_DATE = dayjs("1/1/2022");

const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const VALID_IMAGE_NAMES = ['document-back', 'document-front', 'face'];

//
const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/doc/?ref=%URL%`;

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
const { randomSrringCrypt } = require('./utils');

const KEYS = {};

fastify.get('/health', (request, reply) => {
    return utils.getHealth(SCRIPT_INFO, false);
})

fastify.get('/info', (request, reply) => {
    return utils.getHealth(SCRIPT_INFO, true);
})

const loadParams = async () => {
    params = await require('./params')(CONFIG_PATH, logger);
    KEYS[params.client_id] = params.client_secret;
    KEYS[params.client_id_test] = params.client_secret_test;
}

const getVeriffData = async (payload, method = 'GET', endpoint, output) => {

    let outtype = 0;
    if (output) {
        if (typeof output === 'string') {
            output = path.resolve(__dirname, 'images', output);
            outtype = 1;
        } else if (typeof output === 'object') {
            outtype = 2;
        }
    }

    if (payload.constructor === Object) {
        payload = JSON.stringify(payload);
    }

    if (payload.constructor !== Buffer) {
        payload = new Buffer.from(payload, 'utf8');
    }

    //TODO
    const signature = crypto
        .createHmac('sha256', params.client_secret)
        .update(Buffer.from(payload, 'utf8'))
        .digest('hex')
        .toLowerCase();

    const options = {
        method,
        url: `https://stationapi.veriff.com/v1${endpoint}`, //TODO: add this to param store
        headers:
        {
            'content-type': 'application/json',
            'x-hmac-signature': signature,
            'x-auth-client': params.client_id
        }
    };

    if (output) {
        options.responseType = 'stream';
    }


    let response = await axios(options);
    if (output) {
        if (outtype === 2) {
            output.send(response.data);
        } else {
            response.data.pipe(fs.createWriteStream(output));
        }

        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                resolve(true);
            })

            response.data.on('error', () => {
                reject()
            })
        })
    } else {
        return response.data;
    }

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

const getData = (record, data) => {
    try {
        data.status = record.status || record.action;
        if (record.created) {
            data.created = new Date(record.created).toISOString();
        }

        if (record.finished) {
            data.completed = new Date(record.finished).toISOString();
        }

        if (record._expiresAt) {
            data.expires_at = new Date(record._expiresAt * 1000).toISOString();
        }

        if (record.reason !== null && typeof (record.reason) !== 'undefined') {
            data.reason = record.reason;
        }

        if (typeof (record.name_match_score) !== 'undefined') {
            data.name_match_score = record.name_match_score;
        }

        if (typeof (record.dob_match) !== 'undefined') {
            data.dob_match = record.dob_match;
        }

        if (record.redirect_url) {
            data.redirect_url = record.redirect_url;
        }

        if (record.request_reference) {
            data.request_reference = record.request_reference;
        }

        if (record.raw_data) {
            data.raw_data = record.raw_data;
        }
    } catch (error) {

    }
}

fastify.post('/webhook', {
    config: {
        rawBody: true
    }
}, async (request, reply) => {

    const now = Date.now();

    if (!verifySignature(request, reply)) {
        return;
    }

    const body = request.body;
    if (body && (body.verification || body.id)) {

        //logger.silly(body);
        try {
            let expiration = '1w';
            let customer_id;
            const v = body.verification;
            const id = v ? v.vendorData : body.vendorData;

            let record = await cache.getP(TABLE, id);

            const data = {};

            if (v) {

                //This means they're finished.
                expiration = '10y';
                data.status = v.status;
                const person = v.person;
                data.id = v.id;
                data.code = v.code;
                //TODO! They may retry.
                data.finished = now;

                if (record && record.created) {
                    data.duration = now - record.created;
                    customer_id = record.customer_id;
                }

                //TODO!
                //technicalData : { ip: '71.64.122.30' }
                if (v.reason !== null) {
                    data.reason = v.reason;
                }

                if (v.reasonCode !== null) {
                    data.reasonCode = v.reasonCode;
                }

                if (v.status === 'approved' && person) {
                    if (record) {
                        let pii = record.pii;
                        if (pii) {
                            pii = cache.crypt.decrypt(pii);
                            if (pii) {

                                if (pii.full_name) {
                                    data.name_match_score = nameMatch.compare(`${person.firstName} ${person.lastName}`, pii.full_name, true);
                                } else {
                                    data.name_match_score = -1;
                                }

                                if (pii.dob) {
                                    data.dob_match = utils.sameDate(pii.dob, person.dateOfBirth)
                                } else {
                                    data.dob_match = false;
                                }

                                if (record.strict) {
                                    if (!data.dob_match || data.name_match_score < 1) {
                                        data.status = 'declined';
                                        data.reason = 'Personal information mismatch.';
                                    }
                                }

                                data.pii = null;
                            }
                        }

                        if (record.raw) {
                            let verificationId = v.id;
                            try {
                                let results = await getVeriffData(verificationId, 'GET', `/sessions/${verificationId}/media`);
                                if (results && results.status === 'success') {
                                    const images = results.images;
                                    if (Array.isArray(images) && images.length > 0) {
                                        const media = [];
                                        data.raw_data = {};
                                        data.raw_hash = nanoid(32);
                                        for (let index = 0; index < images.length; index++) {
                                            const image = images[index];
                                            try {
                                                if (VALID_IMAGE_NAMES.indexOf(image.name) > -1) {
                                                    const pid = encodeURIComponent((await utils.hashPassword(`${image.id}${customer_id}${data.raw_hash}`, 1)).substring(7));
                                                    media.push({
                                                        id: image.id,
                                                        name: image.name,
                                                        type: image.mimetype,
                                                        pid
                                                    })
                                                }
                                            } catch (error) {
                                                logger.error(error);
                                            }
                                        }
                                        data.raw_data.media = media;
                                    }
                                }
                            } catch (error) {
                                logger.error(error);
                            }
                        }
                    }
                }
            } else {
                data.updated = now;
                data.status = body.action;
                data.id = body.id;
                data.code = body.code;
                data.feature = body.feature;
            }

            //logger.silly(data);
            const saved = await cache.updateP(TABLE, id, data, expiration, true);

            if (saved && saved.finished) {
                const payload = { transaction_id: saved.transaction_id };
                getData(saved, payload);
                await authMain.sendWebhook(customer_id, payload, TABLE, handler);
            }
        } catch (error) {
            logger.error(error);
        }
    }

    reply.type('application/json').code(200);

    return {
        service: TABLE
    }
});

//TODO
const processRaw = async (request, reply, id, mediaId, pid) => {

}

fastify.post('/raw', async (request, reply) => {

})

fastify.get('/raw/:id/:media_id/:pid', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }
    const id = request.params.id

    if (id && id.length > 0) {
        const record = await cache.getP(TABLE, id);

        const mediaId = request.params.media_id;;
        if (record && mediaId && mediaId.length > 1) {
            if (record.customer_id !== request.user.CustomerAccountID) {
                reply.type('application/json').code(401);
                return {
                    message: 'unauthorized',
                    status: 'error'
                };
            }

            try {
                reply.header('Content-Type', 'image/jpeg');
                //reply.header('Content-Disposition', `attachment; filename=${mediaId}.jpg`);
                await getVeriffData(mediaId, 'GET', `/media/${mediaId}`, reply);
            } catch (error) {
                logger.error(error);
                reply.type('application/json').code(500);
                return {
                    message: error.message,
                    status: 'error'
                };
            }
            return;
        }
    }

    let code = 404;
    reply.type('application/json').code(code);
    return {
        status: 'not_found'
    };

})

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        if (utils.DEMO) {
            return utils.getTemplateResponse(reply, TEMPLATES, "check-request", id);
        }

        data.transaction_id = id;

        let record = await cache.getP(TABLE, id);

        if (record) {
            code = 200;
            getData(record, data);
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
        //logger.silly(body);
        //TODO: Sanitize body
        //let transaction_id = body.transaction_id || `:${utils.getUUID()}`;
        let transaction_id = utils.getUUID();

        data.transaction_id = transaction_id;

        let full_name = body.full_name;
        let dob = body.birth_date;
        let shorten = typeof (body.shorten_url) === 'boolean' ? body.shorten_url : false;
        let send = typeof (body.send) === 'boolean' ? body.send : true;
        let url = typeof (body.link_url) === 'string' && body.link_url.length > 0 ? body.link_url : DEFAULT_URL;
        let text = typeof (body.sms_text) === 'string' && body.sms_text.length > 0 ? body.sms_text : params.sms_text;

        let strict = typeof (body.strict) === 'boolean' ? body.strict : false;
        let raw = typeof (body.raw) === 'boolean' ? body.raw : false;

        let dobData = dayjs(dob);
        if (strict) {
            if (!full_name || !dob || full_name.length < 1 || !dobData.isValid() || dobData.isBefore(MIN_DATE) || dobData.isAfter(MAX_DATE)) {
                return reply.type('application/json').code(422).send({ status: "error", reason: "Valid full_name and birth_date required when strict is true." });
            }
        }

        let expire = "1w";
        if (body.expire && body.expire.length > 0) {
            let tmp = parseInt(body.expire);
            if (tmp < 30 || tmp > 2592000) { //1 month!
                return reply.type('application/json').code(422).send({ status: "error", reason: "expire must be between 30 and 2592000" });
            }
            expire = tmp;
        }

        //TODO! Do this after validation
        data.url = url.replace("%URL%", encodeURIComponent(transaction_id));
        if (shorten) {
            let short = await utils.shortenUrl(data.url);
            data.url = short || data.url;
        }

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {

            const pn = utils.parsePhoneNumber(phone_number);
            if (pn.isValid()) {
                phone_number = pn.getNumber();

                if (utils.DEMO) {
                    return utils.getTemplateResponse(reply, TEMPLATES, "generate-url", phone_number);
                }

                let d = {
                    transaction_id: transaction_id,
                    numbers: phone_number,
                    text: utils.parseTemplate(text, {
                        '%URL%': data.url
                    })
                };

                if (send) {
                    handler.twilio(d);
                }
            } else {
                code = 422;
                data.error = 'Invalid phone number.';
            }
        }

        if (utils.DEMO && code === 200) {
            return utils.getTemplateResponse(reply, TEMPLATES, "generate-url");
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

            if (send) {
                handler.email(d);
            }
        }

        if (code === 200) {
            data.status = 'sent';
            let save = {
                created: data.created,
                status: data.status,
                strict,
                raw
            };

            if (strict) {
                save.pii = {};

                if (typeof (dob) === 'string' && dob.length > 0) {
                    save.pii.dob = dob;
                }

                if (typeof (full_name) === 'string' && full_name.length > 0) {
                    save.pii.full_name = full_name;
                }
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

            if (send) {
                const saved = await cache.setP(TABLE, transaction_id, save, expire, true);
                if (saved && saved._expiresAt) {
                    data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
                }
            }
        } else {
            delete data.transaction_id;
            delete data.url;
        }

    } else {
        code = 422;
        data.error = 'Missing parameter.';
    }

    if (code !== 200) {
        data.status = 'error';
    }

    if (typeof (data.created) === "number") {
        data.created = new Date(data.created).toISOString();
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //console.log(request.routerPath); 
    //authJWT.getAuth(request);
})

const start = () => {
    fastify.listen(params.port, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
}

(async () => {
    await loadParams();
    start();
    await handler.init(true, true, true);
})();