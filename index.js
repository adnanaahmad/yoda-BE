'use strict';
/*jshint esversion: 8 */

const http = require('http');
const https = require('https');
const logger = require('./logger').logger;
const utils = require('./utils');
const nameMatch = require('./name-match');

const SCRIPT_INFO = utils.getFileInfo(__filename, true);

logger.info('Startup', SCRIPT_INFO);

const url = require('url');
const sanitize = require("sanitize-filename");
const pm2 = require('pm2');

const awsClient = require('./aws-client');

let pm2Connected = false;
let renewTimer;

// TODO: Just for testing and demos
///////////////////////////////////////////////////////////////
const base_dir = `${__dirname}/demo/`
const serve_http = true;
const WWW = {
    '/': 'index.html',
    '/favicon.ico': 'cropped-FortidID-logo-square-32x32.jpg',
    '/loader.gif': '/loader.gif'
}
///////////////////////////////////////////////////////////////

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

// TODO:
// Note: According to DirectID this is the only IP address source that they use for their hooks.
// May want to use the parameter store for this in the future.
const DIRECTID_SOURCE_IP = '51.11.21.163';

const consents = {};

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
//const handlerWebhookQ = require('./handler-webhook');

const incomeDirectIDResponseStatus = {
    incomeDirectIDRequestSent: 'incomeDirectIDRequestSent',
    incomeDirectIDRequestSentFail: 'incomeDirectIDRequestSentFail',
    incomeDirectIDRequestInProgress: 'incomeDirectIDRequestInProgress',
    incomeDirectIDRequestSuccess: 'incomeDirectIDRequestSuccess',
    incomeDirectIDRequestFail: 'incomeDirectIDRequestFail'
}

Object.freeze(incomeDirectIDResponseStatus);


const shortenUrl = async (url, token, full = false) => {

    const data = {
        "long_url": url
    };

    const headers = {
        "Authorization": `Bearer ${token}`
    };
    const start = utils.time();
    try {
        const results = await utils.fetchData('https://api-ssl.bitly.com/v4/shorten', data, headers);
        const duration = utils.time() - start;
        logger.info(`Url shortened to [${results.link}] in ${utils.toFixedPlaces(duration, 2)}ms`);
        return full ? results : results.link;
    } catch (error) {
        logger.error(error);
    }
}

const saveFile = async (type, id, data) => {
    if (!data) {
        return;
    }

    try {
        await utils.fileWrite(`./${type}/${id}.json`, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error(error);
    }
}

const loadFile = async (type, id) => {
    try {
        let data = await utils.loadFile(`./${type}/${id}.json`);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error(error);
    }
}

const checkToken = async (scope) => {
    let cached = TOKENS[scope];
    if (!cached && PARAMS.cache_tokens) {
        cached = await loadFile('secure', scope);
        if (cached) {
            TOKENS[scope] = cached;
            logger.debug(`Loaded cached ${scope} token.`);
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

    logger.debug(`Requesting did.${scope} token...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded'
    };

    const body = {
        grant_type: 'client_credentials',
        client_id: PARAMS.client_id,
        client_secret: PARAMS.client_secret,
        scope: `directid.${scope}`
    }

    try {
        const start = utils.time();
        const response = await utils.fetchData(PARAMS.token_url, body, headers);

        const duration = utils.time() - start;

        if (response && response.access_token && response.expires_in) {
            TOKENS[scope] = response;
            response.expires = Date.now() + response.expires_in * 1000;
            logger.debug(`Retrieved did.${scope} token. Expires on ${new Date(response.expires).toLocaleString()}. ${utils.toFixedPlaces(duration, 2)}ms`);
            if (PARAMS.cache_tokens) {
                await saveFile('secure', scope, response);
            }
        } else {
            logger.error(`requestDIDToken - [${scope}] invalid response`, response);
        }
    } catch (error) {
        logger.error(`requestDIDToken - [${scope}] error`, error);
    }
}

const requestBankData = async (consentId, customerReference) => {
    logger.info(`${customerReference} - Requesting bank data...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${TOKENS[TOKEN_IDS.data].access_token}`
    };

    let data;
    try {

        const start = utils.time();

        data = await utils.fetchData(utils.parseTemplate(PARAMS.bank_data_url, {
            '%CONSENT_ID%': consentId
        }), undefined, headers, 'get');

        const duration = utils.time() - start;

        logger.info(`${customerReference} - Retrieved bank data. ${utils.toFixedPlaces(duration, 2)}ms`);
        if (data) {
            //await saveFile('res', `${consentId}-bank-data`, data);
            // let d = {
            //     data: data,
            //     url: 'https://webhook.site/19139114-62f9-43a3-b9cb-7e028338b9a3'
            // }
            // alertWebhookQ.add(d);
        }
    } catch (error) {
        logger.error(`requestBankData - error`, error);
    }
    return data;
}

const loadTemplates = async () => {
    logger.debug('Loading templates...');
    const start = utils.time();
    await utils.loadTemplates('./templates/', TEMPLATES);
    const duration = utils.time() - start;
    logger.debug(`Templates loaded. ${utils.toFixedPlaces(duration, 2)}ms`);
}

const updateIncomeVerification = async (data) => {
    if (typeof (data) !== 'object') {
        logger.warn('updateIncomeVerification - invalid data', data);
        return;
    }

    logger.info('updateIncomeVerification', data);

    try {
        const keys = {};

        if (!data[PARAMS.ddb_partition_income]) {
            logger.warn('updateIncomeVerification - missing partition key.', data);
            return;
        }

        keys[PARAMS.ddb_partition_income] = data[PARAMS.ddb_partition_income];

        if (PARAMS.ddb_sort_income) {
            keys[PARAMS.ddb_sort_income] = data[PARAMS.ddb_sort_income];
            if (!data[PARAMS.ddb_sort_income]) {
                logger.warn('updateIncomeVerification - missing sort key.', data);
                return;
            }
        }

        delete data[PARAMS.ddb_partition_income];
        delete data[PARAMS.ddb_sort_income];

        const dataKeys = Object.keys(data);
        const dataKeyLength = dataKeys.length;
        const values = {};
        const names = {};

        let updateExpression = 'SET';

        for (let index = 0; index < dataKeyLength; index++) {
            const key = dataKeys[index];
            const value = data[key];
            const char = utils.baseAlpha.encode(index);

            const paramName = `#${char}`;
            const paramKey = `:${char}`;

            if (index > 0) {
                updateExpression += ',';
            }

            updateExpression += ` ${paramName}=${paramKey}`;
            names[paramName] = key;
            values[paramKey] = value;
        }

        const params = {
            TableName: PARAMS.ddb_table_income,
            Key: keys,
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: values,
            ExpressionAttributeNames: names,
            ReturnValues: "ALL_NEW"
        };

        logger.debug('updateIncomeVerification - params', params);
        let result = await awsClient.updateDDBItem(params);

        logger.debug('updateIncomeVerification - result', result);
        if (result && result.Attributes) {
            result = result.Attributes;
            DONE[keys[PARAMS.ddb_sort_income]] = result;
        }
        return result;
    } catch (error) {
        logger.error(error);
    }
}

const requestIncomeVerification = async (consentId, customerReference) => {
    if (!customerReference || !consentId) {
        //TODO!
        logger.error('requestIncomeVerification - Invalid customer reference.', customerReference);
        return;
    }

    const parts = customerReference.split(':');
    if (parts.length !== 2) {
        logger.error('requestIncomeVerification - Invalid customer reference.', customerReference);
        return;
    }

    const transaction_id = parts[0];
    const customer_id = parts[1];

    const meta = META[transaction_id];
    if (!meta) {
        //TODO!
        logger.error('requestIncomeVerification - Missing meta', customerReference);
        //output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestFail;
        return;
    }

    if (customer_id !== meta.customer_id) {
        logger.error('requestIncomeVerification - Invalid customer Id.', {
            customer_id,
            meta
        });
        return;
    }

    const output = {};

    output[PARAMS.ddb_partition_income] = meta.customer_id;
    if (PARAMS.ddb_sort_income) {
        output[PARAMS.ddb_sort_income] = transaction_id;
    }

    //output.RequestTimestamp = meta.request_time;
    output.requestComplete = Date.now();
    output.consentId = consentId;
    output.requestDuration = output.requestComplete - meta.request_timestamp;

    logger.info(`${customerReference} - Requesting income verification...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${TOKENS[TOKEN_IDS.data].access_token}`
    };

    const start = utils.time();
    let data;

    try {

        const url = utils.parseTemplate(PARAMS.income_verification_url, {
            '%CONSENT_ID%': consentId
        });

        data = await utils.fetchData(url, undefined, headers, 'get');

        const duration = utils.time() - start;

        logger.info(`${customerReference} - Retrieved income verification. ${utils.toFixedPlaces(duration, 2)}ms`);

        output.apiRequestDuration = Math.round(duration);
    } catch (error) {
        logger.error(error, customerReference);
    }

    if (data) {
        try {

            // let d = {
            //     data: data,
            //     url: 'https://webhook.site/19139114-62f9-43a3-b9cb-7e028338b9a3'
            // }
            // handlerWebhookQ.add(d);

            //TODO: Array? Can have more than one incomes stream summary?
            let summary;

            if (Array.isArray(data)) {
                summary = data[0].incomeStreamsSummary;
            }

            if (summary) {
                output.estimatedIncome = summary.estimatedIncome;
                output.confidenceScore = summary.confidenceScore;
                output.confidenceScoreFlags = {
                    ...summary.confidenceScoreFlags
                };

                //TODO: How about accounts with multiple parties?
                let accountName = data[0].accountDetails?.accountHolderNames;
                output.nameMatchScore = PARAMS.match_name ? nameMatch.compare(meta.full_name, accountName) : 0;

                logger.info(`${customerReference} - requestIncomeVerification - Saving response.`);
                output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestSuccess;

                await updateIncomeVerification(output);
            } else {
                logger.warn(`${customerReference} - requestIncomeVerification - Invalid response`, data);
                output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestFail;

                updateIncomeVerification(output);
            }
        } catch (error) {
            logger.error(error, customerReference);
        }
    } else {
        output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestSentFail;

        updateIncomeVerification(output);
    }

    delete META[transaction_id];
    return data;
}

const sendFile = async (res, filename) => {
    if (!serve_http) {
        utils.sendText(res, 'HTTP Server not enabled.', 503);
    } else {

        filename = sanitize(filename);
        let file = base_dir + filename;
        if (await utils.fileExists(file)) {
            let content = await utils.fileRead(file);

            if (content) {
                let ext = utils.geExtension(filename).toLowerCase();
                utils.sendText(res, content, 200, utils.contentTypes[ext]);
            } else {
                utils.sendText(res, 'Not found.', 404);
            }
        } else {
            utils.sendText(res, 'Not found.', 404);
        }
    }
}

const restart = () => {
    if (pm2Connected) {
        pm2.restart("index", (err, val) => {
            if (err) {
                logger.error(err)
            } else {
                logger.info(val);
            }
        });
    }
}

const update = async () => {
    try {
        const {
            stdout,
            stderr
        } = await utils.execFile(`${__dirname}/data/install.sh`);
        logger.debug(stdout, stderr);
    } catch (error) {
        logger.error(error);
    }
}

const httpHandler = async (req, res) => {
    const startTimer = utils.time();
    const now = Date.now();

    let logRequest = true;


    let method;
    let path;
    let ip;
    let action;
    let key;
    let bodyData;
    let referer;
    let origin;
    let parsed;

    const logExtras = {};

    const doLog = () => {
        const duration = utils.time() - startTimer;
        let log = {
            method: method,
            path: path,
            ip: ip,
            ts: now,
            duration: utils.toFixedPlaces(duration, 2)
        }

        if (referer) {
            log.referer = referer;
        }

        if (origin) {
            log.origin = origin;
        }

        if (Object.keys(logExtras).length > 0) {
            log.extras = logExtras;
        }

        logger.http(log);
    }

    const addLogExtra = (key, name) => {
        logExtras[key] = name;
    }

    try {
        method = req.method.toUpperCase();

        let resource;
        ip = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : undefined);

        if (ip) {
            ip = ip.replace('::ffff:', '');
        }

        try {
            parsed = url.parse(req.url, true);

            path = parsed.pathname;
            if (!path || path.length < 2) {
                path = '/';
            }

            let web = WWW[path];
            if (web) {
                if (PARAMS.demo_enabled) {
                    if (method === 'GET') {
                        await sendFile(res, web);
                    } else {
                        utils.sendData(res, 'Method not allowed', 405);
                    }
                } else {
                    utils.sendData(res, 'Forbidden', 403);
                }

                doLog();
                return;
            }

            if (path.endsWith('/')) {
                path = path.substring(0, path.length - 1);
            }

            path = path.toLowerCase();

            referer = req.headers['referer'];
            origin = req.headers['origin'];

            let parts = path.substr(1).split('/');
            let count = parts.length;
            resource = parts[0];

            action = count > 1 ? parts[1] : undefined;
            key = parsed.query.key;

            let bodyLength = req.headers["content-length"];
            //let contentType = req.headers['content-type'];
            if (bodyLength && ((bodyLength = parseInt(bodyLength)) > 0)) {
                try {
                    //let parse =  contentType && contentType.indexOf('json') > 0;
                    bodyData = await utils.getBody(req); //, parse);
                } catch (error) {
                    logger.error(error);
                    utils.sendData(res, error, 400);
                    return;
                }
            }

            /*
            The standard best practice for REST APIs is to have a hyphen, not camelcase or underscores.
            This comes from Mark Masse's "REST API Design Rulebook" from Oreilly.
            */

            if (typeof (action) === undefined) {
                utils.sendData(res, 'Missing parameter', 422);
            } else {
                try {
                    switch (resource) {
                        case 'directid': {
                            await handleDirectID(action, bodyData, key);
                            break;
                        }
                        case 'system': {
                            await handleSystem(action, bodyData, key);
                            break;
                        }
                    }
                } catch (e) {
                    logger.error(e);
                    try {
                        res.end(e.message);
                    } catch (error) {
                        // ignore
                    }
                }
            }
        } catch (e) {
            logger.error(e);
            try {
                res.end(e.message);
            } catch (error) {
                // ignore
            }
        }
        //TODO: res.headersSent
    } catch (error) {
        logger.error(error);
    }

    //TODO!
    // if(!res.writableFinished) {
    //     try {
    //         res.end();
    //     } catch (error) {}
    // }

    if (logRequest) {
        doLog();
    }

    //TODO: Extract these to separate files
    async function handleSystem(action, bodyData, key) {
        if (key !== PARAMS.system_secret) {
            utils.sendData(res, 'Invalid key', 401);
            return;
        }

        switch (action) {
            case 'restart': {
                utils.sendData(res, 'OK');
                restart();
                break;
            }
            case 'update': {
                utils.sendData(res, 'OK');
                update();
                break;
            }
            default: {
                utils.sendData(res, 'Not found.', 404);
            }
        }
    }

    async function handleDirectID(action, bodyData, key) {
        switch (action) {
            case 'check-request':
            case 'checkrequest': {
                checkRequest();
                break;
            }
            case 'generate-income-url':
            case 'generateincomeurl': {
                await generateIncomeUrl();
                break;
            }
            case 'webhook': {
                webhook();
                break;
            }
            case 'code-submit':
            case 'codesubmit': {
                codeSubmit();
                break;
            }
            case 'code-run':
            case 'coderun': {
                await codeRun();
                break;
            }
            default: {
                utils.sendData(res, 'Endpoint not found.', 404);
                break;
            }
        }

        function checkRequest() {
            let transaction_id = parsed.query.transaction_id;
            if (transaction_id) {
                let found = DONE[transaction_id];
                if (found) {
                    utils.sendData(res, found);
                } else {
                    logRequest = false;
                    utils.sendData(res, 'Not found or not ready.', 404);
                }
            }
        }

        async function codeRun() {
            if (bodyData) {
                let id = parsed.query.id;
                let data = OPAL[id];
                if (data) {
                    const start = utils.time();
                    let results;
                    let error;
                    try {
                        if (data.async) {
                            results = await data.func(bodyData);
                        } else {
                            results = data.func(bodyData);
                        }
                    } catch (err) {
                        error = err;
                        logger.warn('codeRun', err);
                    }

                    const duration = utils.time() - start;
                    let returnData = {
                        results: results,
                        duration: duration
                    };

                    if (error) {
                        returnData.error = error;
                    }
                    utils.sendData(res, returnData);

                    addLogExtra('results', returnData);
                    //fun({a: 10, b: 20}).then(response => { console.log(response) });
                } else {
                    utils.sendData(res, 'Function not found.', 404);
                }
            } else {
                utils.sendData(res, 'Missing parameter', 422);
            }
        }

        function codeSubmit() {
            if (bodyData) {
                let id = parsed.query.id;
                let async = typeof (parsed.query.async) !== 'undefined' ? parsed.query.async : false;

                let data = {
                    id: id,
                    code: utils.compressString(bodyData),
                    hash: utils.hash(bodyData, 'sha256'),
                    created: Date.now(),
                    status: 0,
                    size: bodyData.length,
                    async
                };

                try {
                    utils.sendData(res, data);
                    const func = async ?new AsyncFunction('data', bodyData): new Function('data', bodyData);
                    OPAL[id] = {
                        ...data,
                        func
                    };
                    logger.debug('codeSubmit', data);
                } catch (error) {
                    utils.sendData(res, error);
                    logger.warn('codeSubmit', error);
                }
            } else {
                utils.sendData(res, 'Missing parameter', 422);
            }
        }

        function webhook() {
            // if (PARAMS.api_whitelist.indexOf(ip) === -1) {
            // }
            if (DIRECTID_SOURCE_IP !== ip) {
                utils.sendText(res, 'IP address not allowed.', 403);
                logger.warn('IP address not allowed.');
                return;
            }

            if (method === 'POST') {
                //TODO!
                if (key === PARAMS.webhook_secret) {
                    if (bodyData && bodyData.consentId) {
                        //if(bodyData.dataAvailability === 'Complete') {
                        let consentId = bodyData.consentId;

                        utils.sendData(res, 'OK');

                        logger.info(`${consentId} - dataAvailability: ${bodyData.dataAvailability}.`);

                        let consent = consents[consentId];

                        if (!consent) {
                            consent = bodyData;
                            consents[consentId] = consent;

                            let customerReference = consent.customerReference;

                            logger.info(`${consentId} - Webhook verified.`);

                            const funcs = [];
                            //funcs.push(saveWebhook(consent));
                            logger.debug('Webhook consent received', consent);
                            funcs.push(requestIncomeVerification(consentId, customerReference));

                            if (PARAMS.request_bank_data) {
                                funcs.push(requestBankData(consentId, customerReference));
                            }

                            Promise.all(funcs).then((values) => {
                                if (values) {
                                    // TODO:
                                }
                            }).catch(error => {
                                logger.error(error);
                            });
                        } else {
                            consentId = undefined;
                        }
                    } else {
                        utils.sendData(res, 'Invalid or missing body.', 422);
                    }
                } else {
                    utils.sendData(res, 'Invalid key', 401);
                }
            } else {
                utils.sendData(res, 'Method not allowed', 405);
            }
        }

        async function generateIncomeUrl() {
            let request_id = bodyData.request_id;
            let customer_id = bodyData.customer_id;
            let transaction_id = bodyData.transaction_id;

            if (request_id && request_id.length > 0 && customer_id && customer_id.length > 0 && transaction_id && transaction_id.length > 0) {

                const output = {};
                try {
                    let url_ref = encodeURIComponent(`${transaction_id}:${customer_id}`);
                    let url = `${PARAMS.connect_url}?client_id=${PARAMS.client_id}&customer_ref=${url_ref}`;
    

                    let short_url = true;
                    if (typeof (bodyData.shorten_url) !== 'undefined') {
                        short_url = bodyData.shorten_url;
                    }

                    if (short_url && PARAMS.bitly) {
                        let short = await shortenUrl(url, PARAMS.bitly);
                        url = short || url;
                    }

                    let returnData = {
                        transaction_id: transaction_id,
                        customer_id: bodyData.customer_id,
                        request_id: bodyData.request_id,
                        email_address: bodyData.email_address,
                        full_name: bodyData.full_name,
                        phone_number: bodyData.phone_number,
                        //status: incomeDirectIDResponseStatus.incomeDirectIDRequestInProgress,
                        url: url,
                        request_timestamp: Date.now()
                    };
                    utils.sendData(res, returnData);

                    //TODO! This SHOULD be temporarily saved somewhere.
                    META[transaction_id] = returnData;

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

                        // let replacements = {
                        //     // "%EMAIL%": email,
                        // };

                        let data = {
                            email: email_address,
                            subject: subject,
                            html: utils.parseTemplate(PARAMS.email_text, {
                                '%URL%': returnData.url
                            }),
                        };

                        if (full_name) {
                            data.name = full_name;
                        }

                        handlerEmailQ.add(data);
                    }

                    output[PARAMS.ddb_partition_income] = customer_id;
                    if (PARAMS.ddb_sort_income) {
                        output[PARAMS.ddb_sort_income] = transaction_id;
                    }

                    output.RequesterRef = request_id;
                    output.requestStart = returnData.request_timestamp;
                    output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestInProgress;

                    awsClient.putDDBItem(PARAMS.ddb_table_income, output);
                } catch (error) {
                    logger.error(error);
                }
                logger.info(`Generated income url`, output);
            } else {
                utils.sendData(res, 'Missing parameter', 422);
            }
        }
    }
}

//TODO: Future use
// const setHeaders = (res) => {
//     //TODO
//     //HTTP Strict Transport Security.
//     // res.setHeader('Strict-Transport-Security', );
// }

const startServer = async () => {
    if (PARAMS.http_port && PARAMS.http_port > 0) {
        logger.info('Starting HTTP server...');
        http.createServer(httpHandler).listen(PARAMS.http_port, (err) => {
            if (err) {
                return logger.error(err);
            }
            logger.info(`HTTP server is listening on ${PARAMS.http_port}`);
        });
    }

    if (PARAMS.https_port && PARAMS.https_port > 0) {
        logger.info('Starting HTTPS server...');
        if (PARAMS.server_crt && PARAMS.server_key) {
            const httpsOptions = {
                cert: PARAMS.server_crt,
                key: PARAMS.server_key
            };

            https.createServer(httpsOptions, httpHandler).listen(PARAMS.https_port, (err) => {
                if (err) {
                    return logger.error(err);
                }
                logger.info(`HTTPS server is listening on ${PARAMS.https_port}`);
            });
        } else {
            logger.error('Unable to load certificates.');
        }
    }
}

const checkTokens = async () => {
    //TODO
    if (!PARAMS.token_url || PARAMS.token_url.indexOf('http') !== 0) {
        logger.error('Invalid token_url parameter.');
        return;
    }

    clearTimeout(renewTimer);

    const tokenFuncs = [];

    tokenFuncs.push(requestDIDToken(TOKEN_IDS.data));
    tokenFuncs.push(requestDIDToken(TOKEN_IDS.consent));

    //TODO : Param store?
    let wait = 30000;
    try {
        await Promise.all(tokenFuncs);
    } catch (error) {
        wait = 10000;
        logger.error('checkTokens', error);
    }

    renewTimer = setTimeout(() => {
        checkTokens();
    }, wait);
}

const loadParams = async () => {
    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];

    if (process.env.APIGWCMD) {
        //All we really care about is if it was launched with local config 
        let ARGS = utils.toArgs2(process.env.APIGWCMD);
        if (ARGS.localpath) {
            let index = paramKeys.indexOf('apigw_cfg');
            if (index > -1) {
                paramKeys.splice(index, 1);
            }
            PARAMS.apigw_cfg = await utils.loadJSONAsync(ARGS.localpath);
        }
    }

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
        const results = await Promise.all(funcs);
        if (results) {
            let len = results.length;
            for (let index = 0; index < len; index++) {
                let value = results[index];
                if (value) {
                    PARAMS[paramKeys[index]] = value;
                }
            }
            const duration = utils.time() - start;
            logger.debug(`[${SCRIPT_INFO.name}] Loaded ${Object.keys(PARAMS).length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);

            //TODO
            if (typeof (PARAMS.http_port) !== 'undefined') {
                PARAMS.http_port = parseInt(PARAMS.http_port);
            }

            if (typeof (PARAMS.https_port) !== 'undefined') {
                PARAMS.https_port = parseInt(PARAMS.https_port);
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

            if (typeof (PARAMS.demo_enabled) !== 'undefined') {
                PARAMS.demo_enabled = utils.parseBoolean(PARAMS.demo_enabled);
            }

            if (typeof (PARAMS.apigw_cfg) === 'object') {
                let transport = PARAMS.apigw_cfg.transport;
                if (transport) {
                    if (transport.local_certificate) {
                        logger.debug("Loading local certificates...");
                        PARAMS.server_crt = await utils.loadFile(transport.server_crt_path);
                        PARAMS.server_key = await utils.loadFile(transport.server_key_path);
                    } else {
                        logger.debug("Loading remote certificates...");
                        PARAMS.server_crt = await awsClient.getParameter(transport.server_crt_path);
                        PARAMS.server_key = await awsClient.getParameter(transport.server_key_path);
                    }
                    logger.debug("Finished loading certificates.", PARAMS.server_crt && PARAMS.server_key ? "Success" : "Failure");
                }
            }
        }
    } catch (error) {
        logger.error(error);
    }

}

(async () => {
    const funcs = [];

    await loadParams();

    funcs.push(checkTokens());
    //funcs.push(loadTemplates());

    Promise.all(funcs).then(async (values) => {
        await startServer();
        logger.info(`Initialized.`);
        if (values) {
            //TODO
        }
    }).catch(error => {
        logger.error(error.message)
    });

    try {
        pm2.connect((err) => {
            if (err) {
                logger.error(err);
            } else {
                pm2Connected = true;
                logger.debug('pm2 connected.')
            }
        });
    } catch (error) {
        logger.error(error.message);
    }
})();