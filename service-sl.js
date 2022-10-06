'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-sl');
const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false
});

const TEMPLATES = {};
const ACCOUNT= process.env.SL_ACCOUNT;
const TOKEN = process.env.SL_TOKEN;

const auth = Buffer.from(ACCOUNT + ":" + TOKEN).toString("base64");;
console.log(auth);

fastify.get('/:params', async (request, reply) => {
    reply.type('application/json').code(200);
    return {
        service: 'sentilink'
    }
})

fastify.post('/user', async (request, reply) => {
    const body = request.body;
    
    let data = '';
    if (data) {
        reply.type('application/json').code(200);
        return data;
    } else {

    }
});

fastify.listen({ port: 8111 }, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
})


const loadParams = async () => {
    //TODO:

    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    const start = utils.time();

    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.soap-user'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.soap-password'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.account'));

    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.service-location'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.soap-action'));

    try {
        let results = await Promise.all(funcs);
        const duration = utils.time() - start;
        logger.debug(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);
        if (results) {
            logger.debug(results);
        } else {
            logger.warn(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        logger.error(error);
    }
}

const request = async (endpoint, data) => {

    console.log(endpoint, data);
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      };

      const options = {
        method: 'post',
        url: `https://api.sandbox-sentilink.com/v1/query/${endpoint}`,
        //url: `https://api.sentilink.com/v1/query/${endpoint}`,
        headers: headers,
        data: data,
        timeout: 40000,
        maxContentLength: Infinity
      };

      try {
        const result = await axios(options);
        let d  = result.data;
        if(d) {
            console.log(JSON.stringify(d, null, 2));
        }
        return d;
      } catch (error) {
        const data = error.response;
        console.log(error.message);
        //console.log(error.toJSON());
        console.log(JSON.stringify(error.response.data));
      }
}

const getUser = async(manifest = false, clustering = false)=> {
    let data = {...TEMPLATES['user']};

    //401:  "Missing rate limit for manifest. Please contact support@sentilink.com to enable this product
    if(manifest) {
        // Manifest: InfoSec approval
        data.extra_data.push({'type': 'consumer_history'});
    }

    //Clustering
    if(clustering) {
        data.extra_data.push({'type': 'clusters'});
    }

    data.scores.push({score_name: 'sentilink_id_theft_score'}); //400 error: "Malformed Request: Invalid score <sentilink_id_theft_score> of version <>"
    //ssn:
    //111111100 : all 100
    // last 4: 1100 - 1999 = 100 - 999
    data.application.ssn = '012345678';
    return await request('user', data);
}

const getEcbsv = async()=> {
    let data = {...TEMPLATES['ecbsv']};
    data.application_created = new Date().toISOString();
    return await request('ecbsv', data);
}

const getUserComplete = async()=> {
    let data = {...TEMPLATES['user']};
    
    delete data.scores;
    delete data.extra_data;
    //delete any fields you want completed
    delete data.first_name;
    return await request('user/complete', data);
}

const loadTemplates = async () => {
    logger.debug('Loading templates...');
    const start = utils.time();
    await utils.loadTemplates('./templates/sentilink/', TEMPLATES, true);
    const duration = utils.time() - start;
    logger.debug(`Templates loaded. ${utils.toFixedPlaces(duration, 2)}ms`);
}

(async () => {
    await loadTemplates();

    await getUser(true, true);

    await getEcbsv(); //401: "Missing rate limit for ecbsv. Please contact support@sentilink.com to enable this product."
    //await getUserComplete();
    //Device fingerprinting

})();