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

fastify.register(require('fastify-formbody'));
//fastify.register(require('fastify-multipart'))
//const fileUpload = require('fastify-file-upload')

//fastify.register(fileUpload)
//const qs = require('qs')
//fastify.register(require('fastify-formbody'), { parser: str => qs.parse(str) })

// if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
//     fastify.addContentTypeParser('application/x-www-form-urlencoded', function (
//         request,
//         payload,
//         done
//     ) {
//         var body = '';
//         request.on('data', function (data) {
//             body += data;
//         });
//         request.on('end', function () {
//             try {
//                 const parsed = qs.parse(body);
//                 done(null, parsed);
//             } catch (e) {
//                 done(e);
//             }
//         });
//         request.on('error', function () {
//             done();
//         });
//     });
// }

const CACHE = {};
const TEMPLATES = {};

const WHITELISTING = true;
let IP_WHITELIST = [];

const validateUser = async () => {
    // let verified = await utils.comparePassword(code, hash);
    // let hash = await utils.hashPassword(code);
}

fastify.post('/create', async (request, reply) => {
    
    if (process.env.API_KEY !== request.query.key) {
        reply.type('application/json').code(401);
        return {
            error: 'Authentication required.'
        };
    }
    const body = request.body;
    

    const data = {
        full_name: body.full_name,
        role: body.role,
        client_id: utils.randomString(32),
        client_secret: utils.randomSrringCrypt(32),
        created: Date.now()
    }

    const rate_limit = {
        credits_add_per_minute: 0,
        credits_available: 100,
        credits_max: 100
    } 

    const copy = {
        ...data,
        rate_limit
    };
    copy.hash = await utils.hashPassword(copy.client_secret);
    delete copy.client_secret;

    CACHE[data.client_id] = copy;
    awsClient.putDDBItem('AUTH', copy);

    reply.type('application/json').code(200);
    return data;
});

fastify.post('/token', async (request, reply) => {
    const body = request.body;
    //console.log(request.headers);

    let client_id;
    let client_secret;

    try {
        const authheader = request.headers.authorization;
        //TODO! //Check for "Basic"
        if(authheader) {
            const auth = new Buffer.from(authheader.split(' ')[1],
            'base64').toString().split(':');
            client_id = auth[0];
            client_secret = auth[1];
        }
    } catch (error) {
        
    }

    client_id = client_id || body.client_id;
    client_secret = client_secret || body.client_secret;

    let data = {};
    let error;
    let code = 200;
    // const data = {
    //     grant_type: "client_credentials",
    //     client_id: utils.randomString(20),
    //     client_secret: utils.randomSrringCrypt(32),
    //     scope: "veriff"
    // }

    //let hash = await utils.hashPassword(data.client_secret);
    //console.log(body);
    if (body && client_id && client_secret) {
        let passed = false;
        let data = {};
        try {
            let record = CACHE[client_id];
            if (!record) {
                var params = {
                    TableName: "AUTH",
                    KeyConditionExpression: "#client_id = :client_id",
                    ExpressionAttributeNames: {
                        "#client_id": "client_id"
                    },
                    ExpressionAttributeValues: {
                        ":client_id": client_id
                    }
                };
                let results = await awsClient.docQuery(params);
                if (results && results.Count > 0) {
                    record = results.Items[0];
                }
            }

            if (record) {
                passed = await utils.comparePassword(client_secret, record.hash);

                if (passed) {
                    let d = {
                        client_id: client_id,

                        created: Date.now()
                    };
                    try {
                        let token = jwt.sign(d, process.env.JWT, {
                            expiresIn: '1h'
                        });

                        data.token_type = 'Bearer';
                        data.expires_in = 3600;
                        data.access_token = token;
                        reply.type('application/json').code(200).send(data);
                    } catch (e) {
                        console.log(error);
                        code = 500;
                        error = e.message;
                    }
                } else {
                    error = 'Invalid client_secret.';
                    code = 401;
                }
            } else {
                error = 'Invalid client_id.';
                code = 401;
            }
        } catch (e) {
            error = e.message;
            code = 500;
        }
    } else {
        error = 'Invalid credentials.';
        code = 401;
    }

    if (error) {
        data.error = error;
        console.log(error);
    }

    reply.type('application/json').code(code);
    return data;
});


const checkIP = async (request, reply) => {
    try {

        if(!WHITELISTING) {
            return true;
        }

        if (IP_WHITELIST.indexOf(request.ip) === -1) {
            let data = {
                status: 'error',
                reason: `IP address not allowed. ${request.ip}`,
                code: 403
            }
            reply.type('application/json').code(403).send(data);
            logger.warn(data);
            return false;
        } else {
            return true;
        }
    } catch (err) {
        reply.send(err)
    }

}

//Not REST standard but I wanted this to be easy to use
fastify.get('/ip-add/:ip', async (request, reply) => {
    const ip = request.params.ip || request.ip;
    logger.info('/ip-add', ip);
    if (process.env.API_KEY !== request.query.key) {
        reply.type('application/json').code(401);
        return {
            error: 'Authentication required.'
        };
    }

    if(!net.isIP(ip)) {
        reply.type('application/json').code(422);
        return {
            error: `Invalid IP address format. ${ip}`
        };
    }
    
    if(IP_WHITELIST.indexOf(ip) > -1) {
        reply.type('application/json').code(422);
        return {
            error: `IP address ${ip} already whitelisted.`
        };
    }
    
    IP_WHITELIST.push(ip);
    reply.type('application/json').code(200).send({ status: 'sucess', message: `IP address ${ip} whitelisted.`});
    await utils.fileWrite(`./ip-whitelist`, JSON.stringify(IP_WHITELIST, null, 2));
})

fastify.get('/ip-list', async (request, reply) => {
    if (process.env.API_KEY !== request.query.key) {
        reply.type('application/json').code(401);
        return {
            error: 'Authentication required.'
        };
    }

    reply.type('application/json').code(200).send(IP_WHITELIST);
})

fastify.addHook("onRequest", async (request, reply) => {
    try {
        // console.log(request.headers);
        // console.log(request.body);
        // console.log('HERE!');
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
    IP_WHITELIST = JSON.parse(await utils.fileRead('./ip-whitelist.json', 'utf-8'));

})();