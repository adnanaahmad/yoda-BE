'use strict';
/*jshint esversion: 8 */

const NAME = 'OPAL';
const TABLE = 'opal';
const PORT = 1971;

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

const cache = require('./cache');

const authMain = require('./auth-main');
const vm = require('vm');
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);
const OPALS = {};

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

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

fastify.post('/submit', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = request.body;
    let id = body.id ? body.id.trim().toLowerCase() : undefined;
    if (!id || id.trim().length < 4) {
        return reply.type('application/json').code(422).send({ code: 422, error: 'ID required' });
    }

    let data = OPALS[id];
    let isNew = false;
    if (!data) {
        isNew = true;
        data = { id: '', version: 1, uuid: utils.getUUID(), created: new Date(Date.now()).toISOString(), status: 0, ...body, instance_id: SCRIPT_INFO.instance,  duration: 0, execs: 0, avg: 0, total: 0 };
        data.func = data.async ? new AsyncFunction('data', data.code) : new Function('data', data.code);
        if (request.user) {
            data.user_id = request.user.CustomerAccountID;
        }
        OPALS[id] = data;
    } else {
        if (request.user && data.user_id !== request.user.CustomerAccountID) {
            return reply.type('application/json').code(422).send({ code: 401, error: 'Not allowed.' });
        }
    }

    // let script;
    // try {
    //     script = new vm.Script(data.code);

    // } catch (error) {
    //     data.error = error.message;     
    //     return data;   
    // }
    
    const code_hash = utils.hash(body.code, 'sha256'); 
    if(isNew || data.code_hash !== code_hash) {
        data.code_compressed = utils.compressString(body.code);
        data.code_hash = code_hash;
        data.code_size = body.code.length;
        if(!isNew) {
            data.version++;
            data.modified = new Date(Date.now()).toISOString();
        }
    }
    
    data.samples = [];
    data.samples.push({ data: JSON.parse(body.data), hash: utils.hash(body.data, 'sha256'), size: body.data.length })

    const sample = data.samples[0];
    data.last_run = new Date(Date.now()).toISOString();
    
    const start = utils.time();
    try {
        if (data.async) {
            sample.results = await data.func(sample.data);
        } else {
            sample.results = data.func(sample.data);
        }
        
    } catch (error) {
        data.error = error.message;
    }

    data.execs++;
    data.duration = utils.time() - start;
    //TODO: Overflow, anyone?
    data.total += data.duration;
    data.avg = data.total / data.execs;
    //data.avg = ((data.avg * data.execs) + data.duration) / (data.duration + 1)
    //data.avg = (data.avg * (data.execs-1) + data.duration) / data.execs;

    delete data.data;
    delete data.code;
    return data;
})


fastify.post('/run', async (request, reply) => {
    // if (!await authMain.checkHeaders(request, reply)) {
    //     return;
    // }

    let body = request.body;
})


const start = async () => {
    //params = await require('./params')(CONFIG_PATH, logger, true);
    await utils.addFastifyConfig(fastify, SCRIPT_INFO);

    fastify.listen({ port: PORT }, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
}


(async () => {
    await start();
    await handler.init();
})();