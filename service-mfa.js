'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-mfa');
utils.setLogger(logger);

const cache = require('./cache');

const authMain =  require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if(!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const TABLE = 'mfa';

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

const loadParams = async () => {

}

//TODO! params!
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
        let record = await cache.getP(TABLE, id);

        if (record) {
            data.status = record.status;
            if (record.reason) {
                data.reason = record.reason;
            }

            if (record.verified) {
                data.verified = record.verified;
            }

            if(record.redirect_url) {
                data.redirect_url = record.redirect_url;
            }

            if(record.request_reference) {
                data.request_reference = record.request_reference;
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

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    logger.info(request.ip, `verify ${id}`);

    if (id) {
 
        let record = await cache.getP(TABLE, id);
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
  
                await cache.updateP(TABLE, id, {
                    verified: now,
                    status: data.status
                }, undefined, true);
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
    logger.silly(data);
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
                                data.url = `https://${SCRIPT_INFO.host}/api/mfa?ref=${encodeURIComponent(transaction_id)}`
                                let short = await utils.shortenUrl(data.url);
                                data.url = short || data.url;
    
                                lookup.text = utils.parseTemplate(sms_text, {
                                    '%URL%': data.url
                                });
    
                                handlerTwilioQ.add(lookup);
                            }
    
                            data.status = send ? 'sent' : 'lookup';

                            let save = {
                                status: data.status,
                                created: data.created,
                            };

                            if(request.user) {
                                save.customer_id =  request.user.CustomerAccountID;
                            }

                            let redirect_url = body.redirect_url;
                            if(typeof(redirect_url) === 'string' && redirect_url.length > 0) {
                                save.redirect_url = redirect_url;
                            }
                    
                            let request_reference = body.request_reference;
                            if(typeof(request_reference) === 'string' && request_reference.length > 0) {
                                save.request_reference = request_reference;
                            }
                    
                            await cache.setP(TABLE, transaction_id, save, '1w', true);
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
        }
    } else {
        code = 422;
        data.error =  'Missing parameter';
    }

    data.code = code;
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

(async () => {
    await loadParams();
})();