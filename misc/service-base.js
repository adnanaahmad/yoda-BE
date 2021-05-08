'use strict';
/*jshint esversion: 8 */
const NAME = 'Base';
const TABLE = 'base';
const PORT = 5678;

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

const cache = require('./cache');

const authMain = require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

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

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');
handler.init();

const loadParams = async () => {

}

fastify.get('/check-request/:id', async (request, reply) => {
    let data = {};
    return data;
})

fastify.get('/verify/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    logger.info(request.ip, `verify ${id}`);

    if (id) {
        let record = await cache.getP(TABLE, id);
        if (record) {
            code = 200;
        }
    }

    reply.type('application/json').code(code);
    logger.silly(data);
    return data;
})

fastify.post('/generate-url', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    let body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
    };

    if (body && body.phone_number) {
        logger.silly(body);
        
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    data.code = code;
    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //authJWT.getAuth(request);
})

fastify.addHook('onResponse', async (request, reply) => {

})

fastify.listen(PORT, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    await loadParams();
})();