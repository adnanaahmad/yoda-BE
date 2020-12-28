'use strict';
/*jshint esversion: 8 */

const http = require('http');
const pm2 = require('pm2');
let pm2Connected = false;

const utils = require('./utils');
const SCRIPT_INFO = utils.getFileInfo(__filename, true);
console.info(SCRIPT_INFO);

const url = require('url');
const fetch = require("node-fetch");

const awsClient = require('./aws-client');

const TOKENS = {};
const TEMPLATES = {};
const PARAMS = {};

const DONE = {};
const META = {};
const OPAL = {};

//TODO!
const paramList = require('./params.json');
const paramKeys = Object.keys(paramList);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let consents = {};

const TOKEN_IDS = {
    data: 'data',
    consent: 'consent'
}

Object.freeze(TOKEN_IDS);

// TODO: Swap for next version
// const Q = require('./utils-q');
// const handlerTwilioQ = Q.getQ(Q.names.handler_twilio);
// const handlerEmailQ = Q.getQ(Q.names.handler_email);
// const handlerWebhookQ = Q.getQ(Q.names.handler_webhook);

const handlerTwilioQ = require('./handler-twilio');
const handlerEmailQ = require('./handler-email');
const handlerWebhookQ = require('./handler-webhook');

const incomeDirectIDResponseStatus = {
    incomeDirectIDRequestSent: 'incomeDirectIDRequestSent',
    incomeDirectIDRequestSentFail: 'incomeDirectIDRequestSentFail',
    incomeDirectIDRequestInProgress: 'incomeDirectIDRequestInProgress',
    incomeDirectIDRequestSuccess: 'incomeDirectIDRequestSuccess',
    incomeDirectIDRequestFail: 'incomeDirectIDRequestFail'
}

Object.freeze(incomeDirectIDResponseStatus);

let renewTimer;

//TODO: Use the one in utils.
const fetchData = async (url = '', data = undefined, headers = {}, method = 'POST') => {
    try {
        let config = {
            method: method,
            headers: headers
        }

        if (typeof (data) !== 'undefined') {
            config.body = data;
        }

        const response = await fetch(url, config);

        return response;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

const saveFile = async (type, id, data) => {
    if (!data) {
        return;
    }

    try {
        await utils.fileWrite(`./${type}/${id}.json`, JSON.stringify(data, null, 2));
    } catch (error) {
        console.log(error.message);
    }
}

const loadFile = async (type, id) => {
    try {
        let data = await utils.loadFile(`./${type}/${id}.json`);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        console.log(error.message);
    }
}

const checkToken = async (scope) => {
    let cached = TOKENS[scope];
    if (!cached && PARAMS.cache_tokens) {
        cached = await loadFile('secure', scope);
        if (cached) {
            TOKENS[scope] = cached;
            console.log(`Loaded cached ${scope} token.`);
        }
    }

    if (cached) {
        cached.checking = false;
        if (cached.expires - 300000 - Date.now() > 0) {
            return true;
        }
    }
}

const requestDIDToken = async (scope) => {
    if (await checkToken(scope)) {
        return;
    }

    console.log(`Requesting did.${scope} token...`);
    let headers = {
        'content-type': 'application/x-www-form-urlencoded'
    };

    //TODO!
    let body = `grant_type=client_credentials&client_id=${PARAMS.client_id}&client_secret=${PARAMS.client_secret}&scope=directid.${scope}`;
    let start = utils.time();
    let response = await fetchData(PARAMS.token_url, body, headers);
    let duration = utils.time() - start;
    let head = response.headers;
    let data = await response.json();
    let token;
    if (data && data.access_token) {
        token = data.access_token;
        TOKENS[scope] = data;
        data.expires = Date.now() + data.expires_in * 1000;
        console.log(`Retrieved did.${scope} token. Expires on ${new Date(data.expires).toLocaleString()}. ${utils.toFixedPlaces(duration, 2)}ms`);
        if (PARAMS.cache_tokens) {
            await saveFile('secure', scope, data);
        }
    } else {

    }
}

const saveWebhook = async (consent) => {
    if (!consent) {
        return;
    }
    let consentId = consent.consentId;

    if (consentId) {
        console.log(`${consentId} - Saving webhook data...`);
        //await saveFile('res', consentId, consent);
        console.log(`${consentId} - Webhook data saved`);
        return true;
    }
}

const requestBankData = async (consentId, customerReference) => {
    console.log(`${consentId} - Requesting bank data...`);
    let headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${TOKENS[TOKEN_IDS.data].access_token}`
    };


    let start = utils.time();

    let response = await fetchData(utils.parseTemplate(PARAMS.bank_data_url, {
        '%CONSENT_ID%': consentId
    }), undefined, headers, 'GET');
    let duration = utils.time() - start;

    let data = await response.json();
    console.log(`${consentId} - Retrieved bank data. ${utils.toFixedPlaces(duration, 2)}ms`);
    if (data) {
        //await saveFile('res', `${consentId}-bank-data`, data);
        // let d = {
        //     data: data,
        //     url: 'https://webhook.site/19139114-62f9-43a3-b9cb-7e028338b9a3'
        // }
        // alertWebhookQ.add(d);
    }
    return data;
}

const loadTemplates = async () => {
    console.log('Loading templates...');
    let start = utils.time();
    await utils.loadTemplates('./templates/', TEMPLATES);
    let duration = utils.time() - start;
    console.log(`Templates loaded. ${utils.toFixedPlaces(duration, 2)}ms`);
}

const requestIncomeVerification = async (consentId, customerReference) => {
    console.log(`${consentId} - Requesting income verification...`);
    let headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${TOKENS[TOKEN_IDS.data].access_token}`
    };

    let start = utils.time();

    let response = await fetchData(utils.parseTemplate(PARAMS.income_verification_url, {
        '%CONSENT_ID%': consentId
    }), undefined, headers, 'GET');

    let duration = utils.time() - start;

    let data = await response.json();
    console.log(`${consentId} - Retrieved income verification. ${utils.toFixedPlaces(duration, 2)}ms`);
    if (data) {
        try {
            let id = customerReference.split(':')[0];
            //saveFile('res', `${id}-income-verification`, data);
            // let d = {
            //     data: data,
            //     url: 'https://webhook.site/19139114-62f9-43a3-b9cb-7e028338b9a3'
            // }
            // handlerWebhookQ.add(d);

            //TODO: Array? Can have more than one incomes stream summary?
            let summary = data[0].incomeStreamsSummary;
            if (summary) {
                let meta = META[id];

                let output = {
                    estimatedIncome: summary.estimatedIncome,
                    confidenceScore: summary.confidenceScore,
                    confidenceScoreFlags: {...summary.confidenceScoreFlags},
                    requestStart : 0,
                    requestComplete : Date.now(),
                    requestDuration: 0,
                    apiRequestDuration: Math.round(duration),
                }

                if (meta) {
                    output.requestStart = meta.request_timestamp;
                    output.requestDuration = output.requestComplete - output.requestStart;
                    delete META[id];
                }

                output[PARAMS.ddb_partition_income] = id;

                DONE[id] = output;

                awsClient.putDDBItem(PARAMS.ddb_table_income, output);
                //saveFile('done', `${customerReference}`, results);
            }
        } catch (error) {
            console.log(error.message);
        }
        //await saveFile('res', `${consentId}-income-verification`, data);
    } else {
        DONE[customerReference] = {
            status: -1,
            message: 'Nothing returned'
        };
    }

    return data;
}

const restart = ()=> {
    if (pm2Connected) {
        pm2.restart("index", (err, val) => {
            if (err) {
                console.log(err)
            } else {
                console.log(val);
            }
        });
    }
}

const startServer = () => {
    try {
        http.createServer(async (req, res) => {
            const startTimer = utils.time();
            let path;
            let resource;
            let method = req.method.toUpperCase();

            let statusCode = 400;
            let statusText = 'Invalid key or data.';
            let logRequest = true;

            const now = Date.now();

            let ip = req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                (req.connection.socket ? req.connection.socket.remoteAddress : null);

            try {
                let parsed = url.parse(req.url, true);
                path = parsed.pathname;
                if (!path || path.length < 2) {
                    utils.sendText(res, 'FortifID DirectID API');
                    return;
                }

                let referer = req.headers['referer'];
                let origin = req.headers['origin'];

                //TODO!!!!! This is just so the demo site will work for now.
                // if (!referer || referer !== 'https://dev.barbarians.com/demo/fortifid/') {
                //     if (PARAMS.api_whitelist.indexOf(ip) === -1) {
                //         utils.sendText(res, 'IP address not allowed.', 403);
                //         console.log('IP address not allowed.');
                //         return;
                //     }
                // }

                let passed = false;
                let key = parsed.query.key;

                let parts = path.substr(1).split('/');
                let count = parts.length;
                resource = parts[0].toLowerCase();

                let bodyData;
                let bodyLength = req.headers["content-length"];
                //let contentType = req.headers['content-type'];
                if (bodyLength && ((bodyLength = parseInt(bodyLength)) > 0)) {
                    try {
                        //let parse =  contentType && contentType.indexOf('json') > 0;
                        bodyData = await utils.getBody(req); //, parse);
                    } catch (error) {
                        console.error(error);
                        utils.sendData(res, error, 400);
                        return;
                    }
                }

                let consentId;
                let consent;
                let returnData;
                //TODO! AUTH!
                switch (path) {
                    case '/restart': {
                        passed = true;
                        break;
                    }
                    case '/update': {
                        passed = true;
                        break;
                    }
                    //This endpoint is the webhook endpoint for DID
                    case '/directid/': {
                        if (method === 'POST') {
                            //TODO!
                            if (bodyData && key === PARAMS.webhook_secret) {
                                passed = true;
                                //if(bodyData.dataAvailability === 'Complete') {
                                consentId = bodyData.consentId;
                                console.log(`${consentId} - dataAvailability: ${bodyData.dataAvailability}.`);

                                consent = consents[consentId];
                                if (!consent) {
                                    consent = bodyData;
                                    consents[consentId] = consent;
                                } else {
                                    consentId = undefined;
                                }
                                //}
                            }
                        } else {
                            let request_id = parsed.query.request_id;
                            if (request_id) {
                                let found = DONE[request_id];
                                if (found) {
                                    passed = true;
                                    returnData = found;
                                } else {
                                    logRequest = false;
                                    statusText = 'Not found or not ready.';
                                    statusCode = 404;
                                }
                            }
                        }
                        break;
                    }

                    case '/DirectID/codeSubmit': {
                        if (bodyData) {
                            passed = true;
                            let id = parsed.query.id;

                            returnData = {
                                id: id,
                                code: utils.compressString(bodyData),
                                hash: utils.hash(bodyData, 'sha256'),
                                created: Date.now(),
                                status: 0,
                                size: bodyData.length
                            }
                            //TODO: for later.
                            //let func =  new AsyncFunction("data", bodyData);
                            let func = new Function("data", bodyData);
                            OPAL[id] = func;
                        }
                        break;
                    }
                    case '/DirectID/codeRun': {
                        if (bodyData) {
                            let id = parsed.query.id;
                            let fun = OPAL[id];
                            if (fun) {
                                passed = true;
                                const start = utils.time();
                                let results = fun(bodyData);
                                const duration = utils.time() - start;
                                returnData = {
                                    results: results,
                                    duration: duration
                                }
                                //fun({a: 10, b: 20}).then(response => { console.log(response) });
                            }
                        }
                        break;
                    }
                    case '/DirectID/generateIncomeUrl': {
                        let request_id = bodyData.request_id;
                        if (request_id) {
                            passed = true;
                            //TODO
                            request_id = encodeURIComponent(`${request_id}:${utils.randomString(16)}`);
                            //'&provider_id=3184'
                            let url = `${PARAMS.connect_url}?client_id=${PARAMS.client_id}&customer_ref=${request_id}`;

                            let short_url = true;
                            if (typeof (bodyData.shorten_url) !== 'undefined') {
                                short_url = bodyData.shorten_url;
                            }

                            if (short_url) {
                                //TODO
                                url = await utils.shortenUrl(url, PARAMS.bitly);
                            }

                            returnData = bodyData;
                            returnData = {
                                email_address: bodyData.email_address,
                                full_name: bodyData.full_name,
                                request_id: bodyData.request_id,
                                phone_number: bodyData.phone_number,
                                request_timestamp: Date.now(),
                                //status: incomeDirectIDResponseStatus.incomeDirectIDRequestInProgress,
                                url: url
                            }
                            META[bodyData.request_id] = returnData;
                        }
                        break;
                    }
                }

                if (logRequest) {
                    console.log(`[${method}] ${path} ${ip}`);
                }

                if (passed) {
                    returnData = returnData || 'OK';
                    utils.sendData(res, returnData);

                    switch (path) {
                        case '/restart': {
                            restart();
                            break;
                        }
                        case '/update': {
                            const { stdout, stderr } = await utils.execFile('./update.sh');
                            console.log(stdout, stderr);
                            break;
                        }
                        case '/directid/': {
                            if (consentId) {
                                let customerReference = consent.customerReference;

                                console.log(`${consentId} - Webhook verified.`);

                                const funcs = [];

                                funcs.push(saveWebhook(consent));

                                funcs.push(requestIncomeVerification(consentId, customerReference));

                                if (PARAMS.request_bank_data) {
                                    funcs.push(requestBankData(consentId, customerReference));
                                }

                                Promise.all(funcs).then((values) => {
                                    console.log(`${consentId} - Processing results...`);

                                    console.log(`${consentId} - Finished.`);
                                }).catch(error => {
                                    console.error(error.message)
                                });
                            }
                            break;
                        }
                        case '/DirectID/generateIncomeUrl': {
                            const funcs = [];

                            let phone_number = returnData.phone_number;

                            if (phone_number && phone_number.length > 0) {
                                let data = {
                                    numbers: phone_number,
                                    text: utils.parseTemplate(PARAMS.sms_text, {
                                        '%URL%': returnData.url
                                    })
                                };
                                handlerTwilioQ.add(data);
                            }

                            let email_address = returnData.email_address;

                            if (utils.validateEmail(email_address)) {
                                let full_name = returnData.full_name;
                                let subject = PARAMS.email_subject;

                                let replacements = {
                                    // "%EMAIL%": email,
                                };

                                let data = {
                                    email: email_address,
                                    subject: subject,
                                    html: utils.parseTemplate(PARAMS.email_text, {
                                        '%URL%': returnData.url
                                    }),
                                    //template: 'invitation',
                                    //replacements: replacements
                                }

                                if (full_name) {
                                    data.name = full_name;
                                }

                                handlerEmailQ.add(data);
                            }
                            console.log(`Done.`);
                            break;
                        }
                    }
                } else {
                    utils.sendText(res, statusText, statusCode);
                }
            } catch (e) {
                console.error(e);
                try {
                    res.end(e.message);
                } catch (error) {}
            }

        }).listen(PARAMS.api_port, (err) => {
            if (err) {
                return console.error(err);
            }
            console.log(`API server is listening on ${PARAMS.api_port}`);
        });

    } catch (error) {
        console.error(error.message);
    }
}


const checkTokens = async () => {
    //TODO
    if(!PARAMS.token_url || PARAMS.token_url.indexOf('http') !== 0) {
        console.log('Invalid token_url parameter.');
        return;
    }
    
    const tokenFuncs = [];

    tokenFuncs.push(requestDIDToken(TOKEN_IDS.data));
    tokenFuncs.push(requestDIDToken(TOKEN_IDS.consent));

    let wait = 30000;
    try {
        await Promise.all(tokenFuncs);
    } catch (error) {
        wait = 10000;
        console.log(error.message);
    }

    renewTimer = setTimeout(() => {
        checkTokens();
    }, wait);
}

const loadParams = async () => {
    console.log(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    const start = utils.time();

    //TODO: For later
    // try {
    //     paramList = await awsClient.getParameter('/config/directid/params');
    //     if (paramList) {
    //         paramList = utils.convertIfJSON(paramList);
    //         if (typeof (paramList) === 'object') {
    //             paramKeys = Object.keys(paramList);
    //             console.log('Loaded param list.')
    //         } else {
    //             console.log('Invalid param list.');
    //             return;
    //         }
    //     }
    // } catch (error) {
    //     console.log(error.message);
    //     return;
    // }

    paramKeys.forEach(key => {
        funcs.push(awsClient.getParameter(paramList[key]));
    });

    try {
        let results = await Promise.all(funcs);
        if (results) {
            let len = results.length;
            for (let index = 0; index < len; index++) {
                let value = results[index];
                if(value) {
                    PARAMS[paramKeys[index]] = value;
                }
            }
            const duration = utils.time() - start;
            console.log(`[${SCRIPT_INFO.name}] Loaded ${Object.keys(PARAMS).length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);

            //TODO!
            if (typeof (PARAMS.api_port) !== 'undefined') {
                PARAMS.api_port = parseInt(PARAMS.api_port);
            }

            if (typeof (PARAMS.cache_tokens) !== 'undefined') {
                PARAMS.cache_tokens = utils.parseBoolean(PARAMS.cache_tokens);
            }

            if (typeof (PARAMS.request_bank_data) !== 'undefined') {
                PARAMS.request_bank_data = utils.parseBoolean(PARAMS.request_bank_data);
            }

            if (typeof (PARAMS.match_name) !== 'undefined') {
                PARAMS.match_name = utils.parseBoolean(PARAMS.match_name);
            }
        }
    } catch (error) {
        console.log(error);
    }

}

(async () => {
    const funcs = [];
    await loadParams();

    funcs.push(checkTokens());
    funcs.push(loadTemplates());

    Promise.all(funcs).then(async (values) => {
        startServer();
        console.log(`Initialized.`);
    }).catch(error => {
        console.error(error.message)
    });

    try {
        pm2.connect((err) => {
            if (err) {
                console.error(err);
            } else {
                pm2Connected = true;
                console.log('pm2 connected.')
            }
        });
    } catch (error) {
        console.log(error.message);
    }
})();