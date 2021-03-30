'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-auth');
const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');
const jwt = require("jsonwebtoken");

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true   
})

const CACHE = {};
const TEMPLATES = {};

const validateUser = async () => {
    // let verified = await utils.comparePassword(code, hash);
    // let hash = await utils.hashPassword(code);
}

fastify.get('/create', async (request, reply) => {

    const data = {
        client_id: utils.randomString(32),
        client_secret: utils.randomSrringCrypt(32),
        created: Date.now()
    }

    const copy = {...data};
    copy.hash =  await utils.hashPassword(copy.client_secret);
    delete copy.client_secret;

    CACHE[data.client_id] = copy;

    reply.type('application/json').code(200);
    return data;

});

fastify.post('/token', async (request, reply) => {
    const body = request.body;
    let data = {};

    // const data = {
    //     grant_type: "client_credentials",
    //     client_id: utils.randomString(20),
    //     client_secret: utils.randomSrringCrypt(32),
    //     scope: "veriff"
    // }

    //let hash = await utils.hashPassword(data.client_secret);
    //console.log(hash);
    //console.log();
    if (body && body.client_id && body.client_secret) {
        let passed = false;
        let data ={};
        try {
            let record = CACHE[body.client_id];
            if(record) {
                passed = await utils.comparePassword(body.client_secret, record.hash);
     
                if(passed) {
                    let d = {
                        client_id: body.client_id,
                        created: Date.now()
                    };
                  

                    data.token = jwt.sign(d, process.env.JWT, {
                        expiresIn: '1d'
                    });
                    console.log('d', data);
                } else {
                    data.error = 'Invalid client_secret.';
                }
            }else {
                data.error = 'Invalid client_id';
            }            
        } catch (error) {
            data.error = error.message;
            console.log(error);
        }
    }
    reply.type('application/json').code(200);
    return data;
});

fastify.addHook("onRequest", async (request, reply) => {
    try {
        //console.log('HERE!');
        //reply.send('YOU WILL NOT PASS!!!!');
        //await request.jwtVerify()
    } catch (err) {
        reply.send(err)
    }
})

fastify.listen(7999, (err, address) => {
    if (err) throw err
    logger.info(`Auth server is listening on ${address}`);
});

(async () => {


})();