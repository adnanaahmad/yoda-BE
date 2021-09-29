'use strict';
/*jshint esversion: 8 */

const http = require('http');
const https = require('https');
const logger = require('./logger').logger;
const utils = require('./utils');
utils.setLogger(logger);

const nameMatch = require('./name-match');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info('Startup', SCRIPT_INFO);

const authMain = require('./auth-main');
const url = require('url');
const sanitize = require("sanitize-filename");
const oauth2 = require('./auth-oauth2');

const awsClient = require('./aws-client');
let CANNED_GOOD;
// TODO: Just for testing and demos
///////////////////////////////////////////////////////////////
const baseDir = `${__dirname}/public/income/`
const SERVE_HTTP = true;
const WWW = {
    '/': 'index.html',
    '/thanks': 'thanks.html',
    '/thanks.html': 'thanks.html',
    '/favicon.ico': 'favicon.ico',
    '/loader.gif': 'loader.gif',
    '/logo.png': 'logo.png'
}
///////////////////////////////////////////////////////////////

const PARAMS = {};
const DONE = {};
const META = {};

//TODO!
const paramList = require(`${__dirname}/data/params.json`);
const paramKeys = Object.keys(paramList);

const consents = {};

const TOKEN_IDS = {
    data: 'directid.data',
    consent: 'directid.consent',
    stored_data: 'directid.stored_data'
}

Object.freeze(TOKEN_IDS);

const handler = require('./utils-handlers');

const incomeDirectIDResponseStatus = require(`${__dirname}/data/response-status.json`);

Object.freeze(incomeDirectIDResponseStatus);

const requestStoredData = async (consentId) => {
    logger.info(`${consentId} - Requesting stored data...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${oauth2.TOKENS[TOKEN_IDS.stored_data].access_token}`
    };

    let data;
    try {
        const start = utils.time();

        data = await utils.fetchData(utils.parseTemplate(PARAMS.stored_data_url, {
            '%CONSENT_ID%': consentId
        }), undefined, headers, 'get');

        const duration = utils.time() - start;
        logger.info(`${customerReference} - Retrieved stored data. ${utils.toFixedPlaces(duration, 2)}ms`);
    } catch (error) {
        logger.error(`requestBankData - error`, error);
    }
    return data;
}

const requestBankData = async (consentId, customerReference) => {
    logger.info(`${customerReference} - Requesting bank data...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Bearer ${oauth2.TOKENS[TOKEN_IDS.data].access_token}`
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

const revokeConsent = async (consentId) => {
    logger.info(`${consentId} - Revoking consent...`);
    const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${oauth2.TOKENS[TOKEN_IDS.consent].access_token}`
    };

    let data;
    try {
        const start = utils.time();

        data = await utils.fetchData(utils.parseTemplate(PARAMS.revoke_consent_url, {
            '%CONSENT_ID%': consentId
        }), undefined, headers, 'post');

        const duration = utils.time() - start;

        logger.info(`${consentId} - Revoked consent. ${utils.toFixedPlaces(duration, 2)}ms`);
        logger.silly('revokeConsent results', data);
    } catch (error) {
        logger.error(`revokeConsent - error`, error);
    }
    return data;
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
            //TODO! This is just a workaround for the redirect_url
            if (result && result.TransactionID) {
                let meta = META[result.TransactionID];
                if (meta) {
                    if (meta.redirect_url) {
                        result.redirect_url = meta.redirect_url;
                    }
                }
            }
            DONE[keys[PARAMS.ddb_sort_income]] = result;
        }
        return result;
    } catch (error) {
        logger.error(error);
    }
}

const setCanned = async (output) => {
    if (!output || !CANNED_GOOD || !PARAMS.DEMO_MODE) {
        return;
    }

    logger.info("Using canned response.");
    output.apiRequestDuration = utils.getRandomIntInclusive(500, 1500);
    await utils.timeout(output.apiRequestDuration);

    output.estimatedIncome = CANNED_GOOD.estimatedIncome;
    output.confidenceScore = CANNED_GOOD.confidenceScore;
    output.confidenceScoreFlags = {
        ...CANNED_GOOD.confidenceScoreFlags
    };
    output.nameMatchScore = CANNED_GOOD.nameMatchScore;
    output.status = CANNED_GOOD.status;
}

const requestIncomeVerification = async (consentId, customerReference) => {
    if (!customerReference || !consentId) {
        //TODO!
        logger.error('requestIncomeVerification - Invalid customer reference.', customerReference);
        return;
    }


    let transaction_id;
    let customer_id;

    const parts = customerReference.split(':');
    if (parts.length === 3) {
        transaction_id = parts[1];
        customer_id = parts[2];
    } else if (parts.length === 2) {
        transaction_id = parts[0];
        customer_id = parts[1];
    } else {
        logger.error('requestIncomeVerification - Invalid customer reference.', customerReference);
        return;
    }

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
    let data;

    if (PARAMS.DEMO_MODE) {
        await setCanned(output);
        await updateIncomeVerification(output);
    }
    else {
        logger.info(`${customerReference} - Requesting income verification...`);
        const headers = {
            'content-type': 'application/x-www-form-urlencoded',
            'authorization': `Bearer ${oauth2.TOKENS[TOKEN_IDS.data].access_token}`
        };

        const start = utils.time();


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

                    const getNameMatchScore = (accountName) => {
                        let score = PARAMS.match_name ? nameMatch.compare(meta.full_name, accountName) : 0;
                        if (score > 0) {
                            score = utils.toFixedPlaces(score, 3);
                        }
                        //TODO!!!! ONLY FOR TESTING! REMOVE before production
                        logger.silly(`Name match: "${accountName}" ~ "${meta.full_name}" = ${score}`);
                        return score;
                    }

                    let nameMatchScore = 0;
                    let details = data[0].accountDetails;
                    //REMOVE!
                    logger.silly(`Account details`, details, meta);
                    if (details && PARAMS.match_name) {
                        const parties = details.parties;
                        if (parties && Array.isArray(parties)) {
                            for (let index = 0; index < parties.length; index++) {
                                let score = getNameMatchScore(parties[index].accountHolderName);
                                if (score > nameMatchScore) {
                                    nameMatchScore = score;
                                }
                            }
                        } else {
                            nameMatchScore = getNameMatchScore(details.accountHolderNames);
                        }
                    }

                    output.nameMatchScore = nameMatchScore;

                    logger.info(`${customerReference} - requestIncomeVerification - Saving response.`);
                    output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestSuccess;

                    await updateIncomeVerification(output);

                } else {
                    logger.warn(`${customerReference} - requestIncomeVerification - Invalid response`, data);
                    output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestFail;

                    await updateIncomeVerification(output);
                }
            } catch (error) {
                logger.error(error, customerReference);
            }
        } else {
            output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestSentFail;
            await updateIncomeVerification(output);
        }
    }

    delete META[transaction_id];
    return data;
}

const sendFile = async (res, filename) => {
    if (!SERVE_HTTP) {
        utils.sendText(res, 'HTTP Server not enabled.', 503);
    } else {

        filename = sanitize(filename);
        let file = baseDir + filename;

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

const httpHandler = async (req, res) => {
    const startTimer = utils.time();
    const now = Date.now();

    let logRequest = true;

    let method;
    let path;
    let isLocalCall = false;
    let ip;
    let action;
    let key;
    let bodyData;
    let referer;
    let origin;
    let parsed;
    let param1;
    let reqUrl;
    let useNew = false;

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

        req.ip = ip;
        isLocalCall = ip === '127.0.0.1';

        try {

            reqUrl = req.url;
            //TODO!
            if (reqUrl.startsWith('/income/v1/')) {
                useNew = true;
                reqUrl = reqUrl.replace('/income/v1/', '/directid/');
            } else if (reqUrl.startsWith('/generate-url') || reqUrl.startsWith('/check-request') ||
                reqUrl.startsWith('/webhook') || reqUrl.startsWith('/redirect') || reqUrl.startsWith('/get-raw-data')) {
                useNew = true;
                reqUrl = `/directid${reqUrl}`;
            }

            parsed = url.parse(reqUrl, true);

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

            param1 = count > 2 ? parts[2] : undefined;

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
                        case 'admin': {
                            await handleAdmin(action, bodyData, key);
                            break;
                        }
                    }
                } catch (e) {
                    logger.error(e);
                    try {
                        if (!res.writableEnded) {
                            res.end(e.message);
                        }
                    } catch (error) {
                        // ignore
                    }
                }
            }
        } catch (e) {
            logger.error(e);
            try {
                if (!res.writableEnded) {
                    res.end(e.message);
                }
            } catch (error) {
                // ignore
            }
        }

    } catch (error) {
        logger.error(error);
    }

    //console.log(res.headersSent,res.writableFinished, res.finished)
    if (!res.writableEnded) {
        try {
            res.end();
        } catch (error) { }
    }

    if (logRequest) {
        doLog();
    }

    async function handleAdmin(action, bodyData, key) {
        const now = Date.now();
        if (key !== PARAMS.system_secret) {
            utils.sendText(res, 'Missing or invalid key.', 401);
            logger.warn(`System command not allowed. [${action}]`);
            return;
        }

        if (await utils.hasGit()) {
            utils.sendText(res, 'System command not allowed on dev system.', 403);
            logger.warn(`System command not allowed on dev system. [${action}]`);
            return;
        }

        switch (action) {
            case 'update': {
                utils.sendData(res, {
                    output: ['Update initiated.']
                });
                await utils.execCommand(`${__dirname}/scripts/update.sh`, ['reload']);
                break;
            }
            case 'info': {
                utils.sendData(res, {
                    ...SCRIPT_INFO,
                    time: now,
                    uptime: now - SCRIPT_INFO.start,
                });
                break;
            }
            case 'version': {
                utils.sendData(res, {
                    version: SCRIPT_INFO.version
                });
                break;
            }
            default: {
                utils.sendData(res, 'Endpoint not found.', 404);
                break;
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
            case 'generate-url': {
                await generateIncomeUrl();
                break;
            }
            case 'get-raw-data': {
                await getRawData();
                break;
            }
            case 'webhook': {
                webhook();
                break;
            }
            case 'redirect': {
                redirect();
                break;
            }
            default: {
                utils.sendData(res, 'Endpoint not found.', 404);
                break;
            }
        }

        function checkRequest() {
            let transaction_id = parsed.query.transaction_id || param1;

            if (transaction_id) {
                let found = DONE[transaction_id];
                if (found) {
                    utils.sendData(res, found);
                } else {
                    logRequest = false;
                    found = META[transaction_id];
                    if (found) {
                        found = { status: found.status };
                        utils.sendData(res, found);
                    } else {
                        utils.sendData(res, 'Not found or not ready.', 404);
                    }
                }
            }
        }

        async function redirect() {
            const query = parsed.query;
            //TODO! 
            let redirectUrl;
            if (query && query.customer_ref) {
                addLogExtra('query', query);
                const customerReference = query.customer_ref;
                const parts = customerReference.split(':');
                if (parts.length === 3) {
                    const transaction_id = parts[1];
                    //TODO: Check for error?
                    let record = META[transaction_id];
                    if (!record) {
                        record = DONE[transaction_id];
                    }

                    if (record && record.redirect_url) {
                        redirectUrl = record.redirect_url;
                    }
                }
            }

            if (typeof (redirectUrl) === 'undefined' || redirectUrl.length < 1) {
                redirectUrl = useNew ? 'thanks' : '/thanks';
            }

            //const otherParams = utils.queryStringToObject(redirectUrl, true);
            //console.log(otherParams)
            //const newQuery = {...query};
            redirectUrl = `${redirectUrl}${(redirectUrl.indexOf('?') > -1 ? '&' : '?')}${new URLSearchParams(query)}`;
            //console.log(redirectUrl);
            const headers = {
                'Location': redirectUrl
            }
            utils.sendMessage(res, 302, headers, 'Found');
        }

        async function webhook() {
            if (PARAMS.api_whitelist.indexOf(ip) === -1) {
                utils.sendText(res, 'IP address not allowed.', 403);
                logger.warn('IP address not allowed.');
                return;
            }

            if (method === 'POST') {
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
                            logger.silly('Webhook consent received', consent);
                            funcs.push(requestIncomeVerification(consentId, customerReference));

                            if (PARAMS.request_bank_data) {
                                funcs.push(requestBankData(consentId, customerReference));
                            }

                            Promise.all(funcs).then(async (values) => {
                                if (PARAMS.revoke_consent_url) {
                                    //await revokeConsent(consentId);
                                }

                                if (values) {
                                    //TODO
                                }
                            }).catch(error => {
                                logger.error(error);
                            });
                        } else {
                            consentId = undefined;
                        }
                    } else {
                        utils.sendData(res, 'Invalid or missing body.', 422);
                        logger.warn('Invalid or missing body.');
                    }
                } else {
                    utils.sendData(res, 'Invalid key', 401);
                    logger.warn('Invalid key.');
                }
            } else {
                utils.sendData(res, 'Method not allowed', 405);
                logger.warn('Method not allowe.');
            }
        }

        async function getRawData() {
            let consent_id = param1;
            if (!consent_id || consent_id.length < 1) {
                utils.sendData(res, 'Missing parameter', 422);
                return;
            }
            try {
                let data = await requestStoredData(consent_id);
                utils.sendData(res, data);
            } catch (error) {
                logger.error(error.stack);
                return;
            }
        }

        async function generateIncomeUrl() {
            //TODO!

            // if (!isLocalCall && !await authMain.checkHeaders(req, res)) {
            //     return;
            // }

            //console.log(bodyData);
            let request_id = bodyData.request_id;
            let customer_id = bodyData.customer_id;
            let transaction_id = bodyData.transaction_id;
            let account = bodyData.account;
            const output = {};

            // if(!isLocalCall) {
            //     if(req.user) {
            //         customer_id = req.user.CustomerAccountID;
            //     } else {
            //         customer_id = undefined;
            //     }
            //     transaction_id = utils.getUUID();
            // }

            if (account && account.length > 0) {
                account = `${account}:`
            } else {
                account = '';

            }

            if (request_id && request_id.length > 0 && customer_id && customer_id.length > 0) {


                try {
                    if (account.length === 0 && PARAMS.url_prefix && PARAMS.url_prefix.length > 0) {
                        account = `${PARAMS.url_prefix}:`;
                    }

                    let url_ref = encodeURIComponent(`${account}${transaction_id}:${customer_id}`);
                    let url = `${PARAMS.connect_url}?client_id=${PARAMS.client_id}&customer_ref=${url_ref}`;
                    let short_url = true;
                    if (typeof (bodyData.shorten_url) !== 'undefined') {
                        short_url = bodyData.shorten_url;
                    }

                    if (short_url) {
                        let short = await utils.shortenUrl(url);
                        url = short || url;
                    }

                    let returnData = {
                        transaction_id: transaction_id,
                        customer_id: customer_id,
                        request_id: bodyData.request_id,
                        email_address: bodyData.email_address,
                        full_name: bodyData.full_name,
                        phone_number: bodyData.phone_number,
                        redirect_url: bodyData.redirect_url,
                        url: url,
                        request_timestamp: Date.now()
                    };
                    utils.sendData(res, returnData);

                    //TODO! This SHOULD be temporarily saved somewhere.
                    META[transaction_id] = returnData;

                    let phone_number = returnData.phone_number;

                    if (phone_number && phone_number.length > 0) {
                        let data = {
                            transaction_id: transaction_id,
                            numbers: phone_number,
                            text: utils.parseTemplate(PARAMS.sms_text, {
                                '%URL%': returnData.url
                            })
                        };
                        handler.twilio(data);

                        delete returnData.phone_number;
                    }

                    let email_address = returnData.email_address;

                    if (utils.validateEmail(email_address)) {
                        let full_name = returnData.full_name;
                        let subject = PARAMS.email_subject;

                        let replacements = {
                            "%EMAIL%": email_address,
                            "%LINK%": returnData.url
                        };

                        let data = {
                            transaction_id: transaction_id,
                            email: email_address,
                            subject: subject,
                            template: 'directid_email',
                            replacements: replacements
                        };

                        if (full_name) {
                            data.name = full_name;
                        }

                        handler.email(data);
                        delete returnData.email_address;
                    }

                    output[PARAMS.ddb_partition_income] = customer_id;
                    if (PARAMS.ddb_sort_income) {
                        output[PARAMS.ddb_sort_income] = transaction_id;
                    }

                    output.RequesterRef = request_id;
                    output.requestStart = returnData.request_timestamp;
                    output.status = incomeDirectIDResponseStatus.incomeDirectIDRequestInProgress;
                    returnData.status = output.status;

                    awsClient.putDDBItem(PARAMS.ddb_table_income, output);
                } catch (error) {
                    logger.error(error.stack);
                    return;
                }
                logger.info(`Generated income url`, output);
            } else {
                utils.sendData(res, 'Missing parameter', 422);
                logger.warn(`Missing parameter`, output);
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

const initTokens = async () => {
    //TODO
    if (!PARAMS.token_url || PARAMS.token_url.indexOf('http') !== 0) {
        logger.error('Invalid token_url parameter.');
        return;
    }

    oauth2.cacheTokens = PARAMS.cache_tokens;
    oauth2.addRequest(TOKEN_IDS.data, PARAMS.token_url, PARAMS.client_id, PARAMS.client_secret, TOKEN_IDS.data);
    oauth2.addRequest(TOKEN_IDS.consent, PARAMS.token_url, PARAMS.client_id, PARAMS.client_secret, TOKEN_IDS.consent);
    //oauth2.addRequest(TOKEN_IDS.stored_data, PARAMS.token_url, PARAMS.client_id, PARAMS.client_secret, TOKEN_IDS.stored_data);
    await oauth2.start();

    //TODO!
    //PARAMS.stored_data_url = 'https://uk.api.directid.co/stored-data/v1/consents/%CONSENT_ID%/provider-details';
    PARAMS.stored_data_url = 'https://uk.api.directid.co/stored-data/v1/consents/%CONSENT_ID%/income-verifications??includeFlags=true'
}

const loadParams = async () => {
    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    try {
        if (typeof (process.env.LOCAL_CERT) === 'string' && typeof (process.env.LOCAL_KEY) === 'string') {
            logger.debug("Loading env certificates...");
            delete PARAMS.apigw_cfg;
            PARAMS.server_crt = await utils.loadFile(process.env.LOCAL_CERT);
            PARAMS.server_key = await utils.loadFile(process.env.LOCAL_KEY);
        } else if (process.env.APIGWCMD) {
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
    } catch (error) {
        logger.error(error);
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

    try {
        paramKeys.forEach(key => {
            funcs.push(awsClient.getParameter(paramList[key]));
        });

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

            PARAMS.DEMO_MODE = CANNED_GOOD && PARAMS.DEMO_MODE ? parseInt(PARAMS.DEMO_MODE) !== 0 : false;
            logger.debug(`Demo mode: ${PARAMS.DEMO_MODE}`);

            if (typeof (PARAMS.server_crt) === 'undefined' && typeof (PARAMS.apigw_cfg) === 'object') {
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
    CANNED_GOOD = await utils.loadJSONAsync(`${__dirname}/data/canned-DID.json`);

    try {
        await loadParams();
        await handler.init();

        funcs.push(initTokens());
    
        Promise.all(funcs).then(async (values) => {
            await startServer();
            logger.info(`Initialized.`);
            if (values) {
                //TODO
            }
        }).catch(error => {
            logger.error(error.message)
        });
    } catch (error) {
        logger.error(error);        
    }
})();