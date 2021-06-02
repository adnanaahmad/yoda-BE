'use strict';
/*jshint esversion: 8 */
const NAME = 'Synthetic Fraud';
const TABLE = 'synthetic-id';
const CONFIG_PATH = '/config/equifax/synthetic-id-test';

//TODO: Helper function for logger and params
const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const cache = require('./cache');

const authMain = require('./auth-main');
const oauth2 = require('./auth-oauth2');
const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);
const axios = require('axios');

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const TEMPLATES = {};

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');

const doOPAL = (data) => {
    // const SAMEPLE_INPUT = {
    //     flags: {
    //         finalAssessment: 'N',
    //         assessmentLevel: '0',
    //         sharedSsn: 'N',
    //         verifiedSsn: 'Y',
    //         invalidSsn: 'Y',
    //         sharedAddress: 'N',
    //         identityConfirmation1: 'N',
    //         identityConfirmation2: 'U',
    //         inquiry: 'N',
    //         deathMasterHit: 'N'
    //     },
    //     transactionId: '89500437-c3f1-4c3b-9d5c-2ae38fd0fcd0',
    //     statusCode: '000',
    //     statusMsg: 'Success',
    //     customer_id: '34cddf4d-4e74-434f-8665-597ccae7a761'
    // }

    const MAP = {
        finalAssessment: 'FID-SFID-FINAL-ASSESSMENT-FLAG',
        assessmentLevel: 'FID-SFIS-ASSESSMENT-LEVEL',
        sharedSsn: 'FID-SFIS-SHARED-SSN-FLAG',
        verifiedSsn: 'FID-SFIS-VERIFIED-SSN-FLAG',
        //invalidSsn?
        deathMasterHit: 'FID-SFIS-DEATHMASTER-HIT-FLAG',
        //'FID-SFIS-AUTHORIZED-USER-VELOCITY-FLAG'
        //'FID-SFIS-ID-DISCREPANCY-FLAG'
        //'FID-SFIS-ACTIVE-AUTHORIZED-USERS'
        //'FID-SFIS-TERMINATED-USERS'
        //'FID-SFIS-ID-CONFIRMATION-BEHAVIOR-FLAG'
        sharedAddress: 'FID-SFIS-SHARED-ADDRESS-FLAG',
        identityConfirmation1: 'FID-SFIS-ID-CONFIRMATION-FLAG-1',
        identityConfirmation2: 'FID-SFIS-ID-CONFIRMATION-FLAG-2',
        inquiry: 'FID-SFIS-INQUIRY-FLAG'
    }

    //todo: make sure input is valid
    if(!data || !data.flags) {
        //TODO!
        return;
    }

    const flags = data.flags;
    //result = Needs-Review | Verified | Not-Verified

    let results = {
        result: '',
        details: []
    };
    
    //Logic based on YAML file.
    const level = parseInt(flags.assessmentLevel);
    if((flags.finalAssessment === 'Y'  && level >=2 && level <=5) || flags.sharedSsn === 'Y' || flags.invalidSsn === 'Y' ||  flags.deathMasterHit === 'Y') {
        results.result = 'Not-Verified';
    }else if((flags.finalAssessment !== 'Y' || (flags.finalAssessment === 'Y' && (level <2 || level > 5))) && flags.sharedSsn !== 'Y') {
        results.result = 'Verified';
    } else {
        results.result = 'Needs-Review';
    }

    const addDetail = (code, message)=> {
        results.details.push({detail_code: code, detail_message: message});
    }

    Object.keys(MAP).forEach(key=> {
        const value = flags[key];
        if(typeof(value)!== 'undefined') {
            addDetail(MAP[key], value);
        }else {
            //TODO: What to do when the flag is missing?
            addDetail(MAP[key], 'MISSING');
        }
    });

    return results;
}

const doRequest = async (data, customerId) => {

    //TODO: check to make sure the access token is ready; repeat otherwise.
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oauth2.getToken(TABLE)}`,
        'efx-client-correlation-id': customerId
    };

    const options = {
        method: 'post',
        url: params.url,
        headers,
        data,
        timeout: 10000,
        maxContentLength: Infinity
    };

    try {
        const result = await axios(options);
        //console.log(result.headers)
        let d = result.data;
        if (d) {

            delete d.disclaimer;
            delete d.billingProdCode;
            //utils.camelToSnakeCaseObject(d);
            //utils.camelToSnakeCaseObject(d.flags);
            d.customer_id = customerId;
        }
        return d;
    } catch (error) {
        const data = {
            error: error.response
        };
        console.log(error);
        //console.log(JSON.stringify(error.response.data));
        return data;
    }
}

fastify.post('/query', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = utils.flattenObject2(request.body);
    //console.log(JSON.stringify(body, null, 2));
    let code = 200;
    let data = {
        created: Date.now(),
    };
    if (body) {
        const transaction_id = body.transaction_id || utils.getUUID();
        //logger.silly(body);
        try {
            const identity = {
                firstName: body.first_name,
                middleName: (body.middle_name || ''),
                lastName: body.last_name,
                ssn: ((body.social_security_number || '') + '').replace(/-/g, ''),
                dob: utils.formatDate(body.birth_date, 'YYYYMMDD'),
                address: {
                    addressLine1: body.line1,
                    addressLine2: body.line2 || '',
                    city: body.city,
                    state: body.state,
                    zip: (body.zip_code || '') + ''
                },
                email: body.email_address,
                //phone: utils.numbersOnly(body.phone_number, true)
            };

            console.log(identity);
            const payload = {
                transactionId: transaction_id,
                transactionTimestamp: Date.now(),
                ipAddress: body.ip_addr,
                deliveryChannel: "SyntheticID",
                //cnx: "732876906117",
                //cid: "01D43FAA9C6E5684CE",
                query: "WNC", //or WNC means With credit card
                memberNumber: "999ZB15585", //Have to get this from EQ
                synthetic2RulesCategory: "Default", //Credit Card, Auto, Personal Loan, Communications/Utilities, Default 
                hitCode: "1",
                identity
            };

            data = await doRequest(payload, utils.getUUID());
            //await cache.setP(TABLE, transaction_id, data, undefined, true);
            code = 200;
        } catch (error) {
            console.log(error);
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    reply.type('application/json').code(code);
    if(code === 200) {
        return doOPAL(data);
    }else {
        data.code = code;
        return data;
    }
})

const start = async () => {
    params = await require('./params')(CONFIG_PATH, logger);

    oauth2.addRequest(TABLE, params.token_url, params.client_id, params.client_secret, params.scopes);
    await oauth2.start();

    fastify.listen(params.port, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });

    await handler.init();
}

const test = async () => {
    try {
        console.log('Loading and preparing test data...');

        let data = utils.csvToArray(await utils.fileRead('./data/test-synthetic-id.csv', 'utf-8'));

        const columns = data[0].length;
        const groupLine = data[0];
        const headerLine = data[1];
        const groups = [];
        const splits = [];

        groupLine.forEach((g, index) => {
            if (g.trim().length > 0) {
                groups.push(g.trim());
                splits.push(index);
            }
        })

        const groupCount = groups.length;
        // /console.log(groups, splits, headerLine);

        const records = [];
        for (let index = 2; index < data.length; index++) {
            const element = data[index];
            let record = {};
            let groupIndex = 0;
            let chunk;
            for (let j = 0; j < columns; j++) {
                if (j === splits[groupIndex]) {
                    chunk = {};
                    record[groups[groupIndex]] = chunk;
                    groupIndex++;
                }
                chunk[headerLine[j]] = element[j];
            }
            records.push(record);
        }

        //Records are ready to use.
        //console.log(data.length, data[0].length, records.length);

        const doTest = async (index) => {

            let record = records[index];
            const info = record[groups[0]];
            const pii = record[groups[1]];
            const expected = record[groups[2]];

            const transaction_id = utils.getUUID();
            const identity = {
                firstName: pii.Firstname,
                //middleName: (body.middle_name || ''),
                lastName: pii.Lastname,
                ssn: pii.SSN,
                //dob:  utils.formatDate(body.birth_date, 'YYYYMMDD'),
                address: {
                    addressLine1: pii.Addressline1,
                    //addressLine2: body.line2 || '',
                    city: pii.City,
                    state: pii.State,
                    zip: pii.Zip
                },
                //email: body.email_address,
                //phone: utils.numbersOnly(body.phone_number, true)
            };

            const payload = {
                transactionId: transaction_id,
                transactionTimestamp: Date.now(),
                ipAddress: '4.4.2.2',
                deliveryChannel: info['Delivery channel'],
                //cnx: "732876906117",
                //cid: "01D43FAA9C6E5684CE",
                query: info.Query, //or WNC means With credit card o
                memberNumber: info['Member Number'], //Have to get this from EQ
                synthetic2RulesCategory: info['rules_category'], //Credit Card, Auto, Personal Loan, Communications/Utilities, Default 
                hitCode: "1",
                identity
            };

            let result = await doRequest(payload, utils.getUUID());
            console.log(result);
            if (result && result.flags) {
                const flags = result.flags;
                result.expected = expected;
                let results = {
                    _fail: 0
                };

                //Compare function
                Object.keys(expected).forEach((key, index) => {
                    if (typeof (flags[key]) === 'undefined') {
                        results._fail++;
                        results[key] = 0;
                    } else if (flags[key] === expected[key]) {
                        results[key] = 1;
                    } else {
                        results._fail++;
                        results[key] = -1;
                    }
                });

                result.results = results;
                return result;
            } else {
                console.log('Invalid results:', result);
            }
        }

        console.log('Test data loaded...');
        const doTests = async (batch = false, testCount = 10) => {
            console.log(`Starting ${testCount} tests... (batch mode: ${batch})`);
            if (batch) {
                const funcs = [];

                for (let index = 0; index < testCount; index++) {
                    funcs.push(doTest(index));
                }

                console.log(`Starting all tests...`);
                let start = utils.time();
                let results;
                try {
                    results = await Promise.all(funcs);
                } catch (error) {
                    console.log(error);
                }
                let duration = utils.time() - start;
                if (results) {
                    results.forEach((result, index) => {
                        let passed = false;
                        if (result && result.results && result.results._fail === 0) {
                            passed = true;
                        }

                        console.log(`Test #${((index + 1)+"").padStart(2, '0')} ${passed ? 'Passed' : 'Failed' }.`);
                    });
                }
                console.log(`Tests complete. ${utils.toFixedPlaces(duration, 2)}ms. ${utils.toFixedPlaces((duration / testCount), 2)}s/test`);
            } else {
                let start = utils.time();

                for (let index = 0; index < testCount; index++) {
                    console.log(`Starting test #${((index + 1)+"").padStart(2,'0')}...`);
                    let start = utils.time();
                    let result = await doTest(index);
                    let duration = utils.time() - start;
                    let passed = false;
                    if (result && result.results && result.results._fail === 0) {
                        passed = true;
                    }
                    console.log(JSON.stringify(doOPAL(result), null, 2));
                    console.log(`Test #${((index + 1)+"").padStart(2, '0')} ${passed ? 'Passed' : 'Failed' }. ${utils.toFixedPlaces(duration, 2)}ms`);
                }

                let duration = utils.time() - start;
                console.log(`Tests complete. ${utils.toFixedPlaces(duration, 2)}ms. ${utils.toFixedPlaces((duration / testCount), 2)}s/test`);
            }
        }

        console.log(records[0]);
        await doTests(false, 1);

    } catch (error) {
        console.log(error);
    }
}


(async () => {
    await start();
    //await test();
})();