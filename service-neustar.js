'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-neustar');
const awsClient = require('./aws-client');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false
})

fastify.listen(8995, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
})

(async () => {


})();