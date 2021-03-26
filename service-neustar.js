'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-neustar');
const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false
})

const TEMPLATES = {};

//const auth = Buffer.from(ACCOUNT + ":" + TOKEN).toString("base64");;
//console.log(auth);

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
        service: 'neustar'
    }
})

fastify.post('/meh', async (request, reply) => {
    const body = request.body;
});

fastify.listen(8990, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {

    //https://gwydemo.neustar.biz/v2/access/query
    //https://webgwy.neustar.biz/v2/access/query

    //let params = await awsClient.getParametersByPath('/config/neustar/');
    //console.log(params);

    const single = {
        "transid": "22859789",
        "timeoutms": 1000,
        "serviceid": "1234567890",
        "elems": ["510", "501"],
        "queries": [{
            "1": "5855987000"
        }]
    }

    const batch = {
        "transid": "22859789",
        "timeoutms": 1000,
        "serviceid": "1234567891",
        "elems": ["1390"],
        "queries": [{
            "1390": "295WoodcliffDrive",
            "1391": "Fairport",
            "1392": "NY",
            "1393": "14450"
        }, {
            "1390": "1600PennsylvaniaAve",
            "1391": "Washington",
            "1392": "DC",
            "1393": "20502"
        }]
    }

    let currTimeStamp = Math.round((new Date().getTime()) / 1000);
    let sig = utils.hash(apikey + secret + currTimeStam, 'md5', 'hex');

    //let path = service + version + method +'?apikey=' + apikey + '&sig=' + sig;

})();