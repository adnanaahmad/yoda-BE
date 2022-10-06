'use strict';
/*jshint esversion: 8 */

const NAME = 'InterConnect';
const TABLE = 'interconnect';
const CONFIG_PATH = '/config/equifax/interconnect-sandbox';

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

fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');

const doOPAL = (data) => {

    const MAP = {
        finalAssessment: 'FID-SFID-FINAL-ASSESSMENT-FLAG',
        assessmentLevel: 'FID-SFID-ASSESSMENT-LEVEL',
        sharedSsn: 'FID-SFID-SHARED-SSN-FLAG',
        verifiedSsn: 'FID-SFID-VERIFIED-SSN-FLAG',
        invalidSsn: 'FID-SFID-INVALID-SSN-FLAG',
        deathMasterHit: 'FID-SFID-DEATHMASTER-HIT-FLAG',
        sharedAddress: 'FID-SFID-SHARED-ADDRESS-FLAG',
        identityConfirmation1: 'FID-SFID-ID-CONFIRMATION-FLAG-1',
        identityConfirmation2: 'FID-SFID-ID-CONFIRMATION-FLAG-2',
        inquiry: 'FID-SFID-INQUIRY-FLAG',
        //'FID-SFID-AUTHORIZED-USER-VELOCITY-FLAG'
        //'FID-SFID-ID-DISCREPANCY-FLAG'
        //'FID-SFID-ACTIVE-AUTHORIZED-USERS'
        //'FID-SFID-TERMINATED-USERS'
        //'FID-SFID-ID-CONFIRMATION-BEHAVIOR-FLAG'
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
    

    let notVerified = false;
    let verified = false;

    //Logic based on YAML file.
    const level = parseInt(flags.assessmentLevel);
    if((flags.finalAssessment === 'Y'  && level >=2 && level <=5) || flags.sharedSsn === 'Y' || flags.invalidSsn === 'Y' ||  flags.deathMasterHit === 'Y') {
        results.result = 'Not-Verified';
        notVerified = true;
    }

    if((flags.finalAssessment !== 'Y' || (flags.finalAssessment === 'Y' && (level <2 || level > 5))) && flags.sharedSsn !== 'Y') {
        results.result = 'Verified';
        verified = true;
    }

    if(verified === notVerified)  {
        results.result = 'Needs-Review';
    }

    //console.log(verified, notVerified, results.result);

    // if((flags.finalAssessment === 'Y'  && level >=2 && level <=5) || flags.sharedSsn === 'Y' || flags.invalidSsn === 'Y' ||  flags.deathMasterHit === 'Y') {
    //     results.result = 'Not-Verified';
    // }else if((flags.finalAssessment !== 'Y' || (flags.finalAssessment === 'Y' && (level <2 || level > 5))) && flags.sharedSsn !== 'Y') {
    //     results.result = 'Verified';
    // } else {
    //     results.result = 'Needs-Review';
    // }

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
        //logger.info(result.headers)
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
            error: error.response.data
        };
        //console.log(error.response.headers);
        //if(error.response.data) {
        //    data.data = error.response.data; 
        //}
        //console.log(data);
        //logger.info(error);
        //logger.info(JSON.stringify(error.response.data));
        return data;
    }
}

fastify.post('/query', async (request, reply) => {
    // if (!await authMain.checkHeaders(request, reply)) {
    //     return;
    // }

    const body = utils.flattenObject2(request.body);
    //logger.info(JSON.stringify(body, null, 2));
    let code = 200;
    let data = {
        created: Date.now(),
    };
    if (body) {
        //TODO: Verify input
        const transaction_id = body.transaction_id;
        const persona = body.persona;
        if(!transaction_id || !persona) {
            reply.type('application/json').code(400);
            return 'Missing mandatory attibute(s)';
        }

        try {
            const identity = {
                firstName: body.first_name,
                middleName: (body.middle_name || ''),
                lastName: body.last_name,
                ssn: ((body.social_security_number || '') + '').replace(/-/g, ''),
                dob: utils.formatDate(body.birth_date, 'YYYYMMDD'),
                address: {
                    addressLine1: body.line1,
                    city: body.city,
                    state: body.state,
                    zip: (body.zip_code || '') + ''
                },
                email: body.email_address,
                phone: utils.numbersOnly(body.phone_number, true)
            };

            if(typeof(body.line2) !== 'undefined') {
                identity.address.addressLine2 = body.line2 || '';
            }

            //logger.silly(identity);
            const payload = {
                transactionId: transaction_id,
                transactionTimestamp: Date.now(),
                deliveryChannel: "SyntheticID",
                //cnx: "732876906117",
                //cid: "01D43FAA9C6E5684CE",
                query: "WNC", //or WNC means With credit card
                memberNumber: params.member_number, //Have to get this from EQ
                synthetic2RulesCategory: "Default", //Credit Card, Auto, Personal Loan, Communications/Utilities, Default 
                //hitCode: "1",
                identity
            };

            if(typeof(body.ip_address) !== 'undefined') {
                payload.ipAddress = body.ip_address;
            }

            data = await doRequest(payload, `${persona}:${transaction_id}`);
            //await cache.setP(TABLE, transaction_id, data, undefined, true);
            code = 200;
        } catch (error) {
            logger.error(error);
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

    fastify.listen({ port: params.port }, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });

    await handler.init();
}

const testProd = async ()=> {
    let data = utils.csvToArray(await utils.fileRead('./tmp/vista-pii.csv', 'utf-8'));
    const columns = data[0].length;
    const headerLine = data[0];
    const results = [];
    //console.log(columns, headerLine, data[1]);
    const records = [];
    for (let index = 1; index < data.length; index++) {
        const element = data[index];
        let record = {};
        for (let j = 0; j < columns; j++) {
            let val = element[j];
            if(val === 'N/A' || val === 'MISSING') {
                val = '';
            }
            record[headerLine[j]] = val;
        }
        records.push(record);
    }
    
    //console.log(records[0]);

    const doTest = async (index) => {

        const pii = records[index];
        //console.log(pii);
        const transaction_id = utils.getUUID();
        const identity = {
            firstName: pii['First Name'],
            middleName: pii['Middle Name'],
            lastName: pii['Last Name'],
            ssn: utils.numbersOnly(pii['SSN'], true),
            dob:  utils.formatDate(pii['Date of Birth'], 'YYYYMMDD'),
            address: {
                addressLine1: pii['Current Street Address Line 1'],
                addressLine2: pii['Current Address Line 2'],
                city: pii['Current City'],
                state: pii['Current State'],
                zip: pii['Current Zip Code']
            },
            email: pii['Email'],
            phone: utils.numbersOnly(pii['Phone Number'], true)
        };

        const payload = {
            transactionId: transaction_id,
            transactionTimestamp: Date.now(),
            ipAddress: '4.4.2.2',
            deliveryChannel: "SyntheticID",
            query: 'WNC', 
            memberNumber: params.member_number, 
            synthetic2RulesCategory: 'Default', //Credit Card, Auto, Personal Loan, Communications/Utilities, Default 
            //hitCode: "1",
            identity
        };

        //console.log(payload);
        let result = await doRequest(payload, utils.getUUID());
        if (result && result.flags) {
            let out = doOPAL(result);
            //results.push(out);
            logger.info(out);
        } else {
            logger.info('Invalid results:', result);
        }
    }

    //let index = 6;
    for (let index = 0; index < records.length; index++) {
        logger.info(`Record #${index}:`);
        try {
            await doTest(index);
        } catch (error) {
            
        }
    }
}

const test = async () => {
    try {
        logger.info('Loading and preparing test data...');

    } catch (error) {
        logger.info(error);
    }
}


(async () => {
    await start();
    //await test();
    //await testProd();
})();