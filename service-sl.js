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
})

const TEMPLATES = {};
//TODO!
//-SANDBOX-
const ACCOUNT= '01F0HAQNBFR03ZAPKKKQFBHG1J';
const TOKEN = '5L9C5GA9BM7QU9TJ7B4L71IJR1DR4C9N';
const auth = Buffer.from(ACCOUNT + ":" + TOKEN).toString("base64");;
//

fastify.get('/:params', async (request, reply) => {
    console.log(request.body)
    console.log(request.query)
    console.log(request.params)
    console.log(request.headers)
    console.log(request.raw)
    console.log(request.id)
    console.log(request.ip)
    console.log(request.ips)
    console.log(request.hostname)
    console.log(request.protocol)
    request.log.info('some info')
    reply.type('application/json').code(200);

    return {
        service: 'samba'
    }
})

fastify.post('/order-interactive', async (request, reply) => {
    const body = request.body;
    let data = await orderInteractive(body.license, body.state);
    if(!body.full) {
        data = extractData(data) || data;
    }

    if (data) {
        reply.type('application/xml').code(200);
        return data;
    } else {

    }
});

fastify.listen(8111, (err, address) => {
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

    //data.scores.push({score_name: 'sentilink_id_theft_score'}); //400 error: "Malformed Request: Invalid score <sentilink_id_theft_score> of version <>"
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

    await awsClient.getParametersByPath('/config/');

    await loadTemplates();

    //await getUser(false, true);

    //await getEcbsv(); //401: "Missing rate limit for ecbsv. Please contact support@sentilink.com to enable this product."
    await getUserComplete();
    //Device fingerprinting

})();