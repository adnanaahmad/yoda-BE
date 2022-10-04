'use strict';
/*jshint esversion: 8 */

const NAME = 'OPAL';
const TABLE = 'service-opal';
const PORT = 1971;

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

fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');

const loadParams = async () => {

}

fastify.listen(PORT, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    await loadParams();
    await handler.init();
})();