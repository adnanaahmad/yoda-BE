'use strict';
/*jshint esversion: 8 */

const NAME = 'Secure MFA';
const TABLE = 'mfa';
const CONFIG_PATH = '/config/twilio/mfa';

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const cache = require('./cache');
const authMain = require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/mfa/?ref=%URL%`;

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/mfa`,
    serve: true,
    prefix: '/',
})

const twilioUtils = require('./handler-twilio');

const handler = require('./utils-handlers');

// fastify.get('/', function (request, reply) {
//     return reply.sendFile('index.html'); // serving path.join(__dirname, 'public', 'myHtml.html') directly
// })

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();

    let code = 404;
    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    if (id) {
        let record = await cache.getP(TABLE, id);

        if (record) {
            if(record.created) {
                data.created = record.created; 
            }

            if(record.finished) {
                data.completed = record.finished; 
            }

            data.status = record.status;
            if (data.status === 'verified') {
                logger.silly(request.ip, `check-request ${id}`, record);
            }

            if (record.reason) {
                data.reason = record.reason;
            }

            if (record.redirect_url) {
                data.redirect_url = record.redirect_url;
            }

            if (record.request_reference) {
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
            
            if(record.created) {
                data.created = record.created; 
            }

            if (record.finished) {
                data.completed = record.finished;
            }

            if (record.status === 'sent') {
                data.completed = now;
                data.status = 'verified';

                if (record.request_reference) {
                    data.request_reference = record.request_reference;
                }

                if (record.redirect_url) {
                    data.redirect_url = record.redirect_url;
                }

                await cache.updateP(TABLE, id, {
                    finished: now,
                    duration: now - record.created,
                    status: data.status
                }, '10y', true);

            } else if (record.status === 'verified') {
                data.status = 'used';
            } else {
                data.status = record.status;
            }
            //TODO: Expiration!
        }
    }

    reply.type('application/json').code(code);
    //logger.silly(data);
    return data;
})

fastify.post('/generate-url', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
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
        //logger.silly(body);
        //TODO!
        //let transaction_id = body.transaction_id || utils.getUUID();
        let transaction_id = utils.getUUID();
        data.transaction_id = transaction_id;
        let doLookup = typeof (body.lookup) === 'boolean' ? body.lookup : true; 
        let shorten = typeof (body.shorten_url) === 'boolean' ? body.shorten_url : false; 
        let send = typeof (body.send) === 'boolean' ? body.send : true;
        let allow_voip = typeof (body.allow_voip) === 'boolean' ? body.allow_voip : true;
        let url = typeof(body.link_url) === 'string'  && body.link_url.length > 0 ? body.link_url : DEFAULT_URL;
        let text = typeof(body.sms_text) === 'string' && body.sms_text.length > 0 ? body.sms_text : params.sms_text;

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            const pn = utils.parsePhoneNumber(phone_number);
            if (pn.isValid()) {
                phone_number = pn.getNumber();
                let lookup = {
                    transaction_id: transaction_id,
                    numbers: phone_number
                };

                let results = doLookup ?  await twilioUtils.lookup(lookup) : { carrier: { type: "mobile" }, countryCode: "US" };
      
                if (results) {
                    if(doLookup) {
                        logger.silly(results);
                    }
                    if (results instanceof Error) {
                        data.reason = results.status === 404 ? 'Invalid phone number or number not found.' : results.message;
                        code = 404;
                    } else if (results.carrier !== null && typeof (results.carrier) === 'object') {
                        let carrier = results.carrier;
                        if(doLookup) {
                            data.country_code = results.countryCode;
                            
                            if(carrier) {
                                if(carrier.name) {
                                    data.carrier = carrier.name; 
                                }
    
                                data.type = carrier.type;
                                if(carrier.mobile_country_code) {
                                    data.mobile_country_code = parseInt(carrier.mobile_country_code); 
                                }
        
                                if(carrier.mobile_network_code) {
                                    data.mobile_network_code = parseInt(carrier.mobile_network_code); 
                                }
                            }
                        }
                        if (!doLookup || carrier.type === 'mobile' || (allow_voip && carrier.type === 'voip')) {
                            //TODO!
                            if (!lookup || results.countryCode === 'US') {
                                if (send) {
                                    data.url = url.replace("%URL%", encodeURIComponent(transaction_id));
                                    if(shorten) {
                                        let short = await utils.shortenUrl(data.url);
                                        data.url = short || data.url;
                                    }

                                    lookup.text = utils.parseTemplate(text, {
                                        '%URL%': data.url
                                    });
                                    handler.twilio(lookup);
                                }

                                data.status = send ? 'sent' : 'lookup';

                                let save = {
                                    status: data.status,
                                    created: data.created,
                                };

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

                                if(send) {
                                    await cache.setP(TABLE, transaction_id, save, '1w', true);
                                }
                            } else {
                                data.reason = `Unsupported country: ${results.countryCode}`;
                            }
                        } else {
                            data.reason = 'Must use a valid mobile phone number (no VOIP or landlines accepted)';
                            code = 404;
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
            } else {
                data.reason = 'Invalid phone number.';
                code = 404;
            }
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //authJWT.getAuth(request);
})

fastify.addHook('onResponse', async (request, reply) => {
    if (request.user) {

        // let log = {
        //     customer_id: user.
        // }
    }
})
const start = async () => {
    params = await require('./params')(CONFIG_PATH, logger);

    fastify.listen(params.port, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
}

(async () => {
    await start();
    await handler.init();
})();