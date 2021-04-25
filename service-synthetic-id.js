'use strict';
/*jshint esversion: 8 */
const NAME = 'Synthetic Fraud';
const TABLE = 'synthetic-id';
const CONFIG_PATH = '/config/equifax/synthetic-id';

//TODO: Helper function for logger and params
const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

const params = require('./params')(CONFIG_PATH);
if(!params) {
    logger.error('No parameters defined.');
    process.exit(1);
}

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
handler.init();

const doRequest = async (data, customerId) => {

    //TODO: check to make sure the access token is ready; repeat otherwise.
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oauth2.getToken(TABLE)}`,
        'efx-client-correlation-id': customerId
      };

      const options = {
        method: 'post',
        url: 'https://api.sandbox.equifax.com/business/syntheticid/v1/flags',
        headers,
        data,
        timeout: 10000,
        maxContentLength: Infinity
      };
    
      try {
        const result = await axios(options);
        let d  = result.data;
        if(d) {
            
            delete d.disclaimer;
            delete d.billingProdCode;
            utils.camelToSnakeCaseObject(d);
            utils.camelToSnakeCaseObject(d.flags);
            //d.customer_id = customerId;
        }
        return d;
      } catch (error) {
        const data =  {error: error.response};

        console.log(JSON.stringify(error.response.data));
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
    if (body && body.phone_number) {
        const transaction_id =  body.transaction_id || utils.getUUID();
        //logger.silly(body);
        try {
            const identity = {
                firstName: body.first_name,
                middleName: (body.middle_name || ''),
                lastName: body.last_name,
                ssn: ((body.social_security_number || '')  + '').replace(/-/g, '' ),
                dob:  utils.formatDate(body.birth_date, 'YYYYMMDD'),
                address: {
                  addressLine1: body.line1,
                  addressLine2: body.line2 || '',
                  city: body.city,
                  state: body.state,
                  zip: (body.zip_code || '')   + ''
                },
                email: body.email_address,
                phone: utils.numbersOnly(body.phone_number, true)
            };

            const payload = {
                transactionId: transaction_id,
                transactionTimestamp: Date.now(),
                ipAddress: body.ip_addr,
                deliveryChannel: "IDFS",
                //cnx: "732876906117",
                //cid: "01D43FAA9C6E5684CE",
                query: "WC", //or WNC means With credit card o
                memberNumber: "327CG12345", //Have to get this from EQ
                synthetic2RulesCategory: "Credit Card", //Credit Card, Auto, Personal Loan, Communications/Utilities, Default 
                hitCode: "1",
                identity
            };
            
            data = await doRequest(payload, utils.getUUID());
            await cache.setP(TABLE, transaction_id, data, undefined, true);
            code = 200;
        } catch (error) {
            console.log(error);    
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    data.code = code;
    reply.type('application/json').code(code);
    return data;
})

fastify.listen(params.port, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    oauth2.addRequest(TABLE, params.token_url, params.client_id , params.client_secret, params.scopes);
    await oauth2.start();
    init();
    //await utils.loadTemplates('./templates/syntheticid/', TEMPLATES, true);
})();