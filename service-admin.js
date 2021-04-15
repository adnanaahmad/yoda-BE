'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

const logger = require('./logger').createLogger('service-admin');
utils.setLogger(logger);

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info('Startup', SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const authMain = require('./auth-main');

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/admin`,
    serve: true,
    prefix: '/',
})

const pm2 = require('pm2');

const awsClient = require('./aws-client');

let pm2Connected = false;

const update = async () => {
    try {
        const {
            stdout,
            stderr
        } = await utils.execFile(`${__dirname}/data/install.sh`);
        logger.debug(stdout, stderr);
    } catch (error) {
        logger.error(error);
    }
}

const restart = () => {
    if (pm2Connected) {
        pm2.restart("service-did", (err, val) => {
            if (err) {
                logger.error(err)
            } else {
                logger.info(val);
            }
        });
    }
}

// //TODO: Extract these to separate files
// async function handleSystem(action, bodyData, key) {
//     if (key !== PARAMS.system_secret) {
//         utils.sendData(res, 'Invalid key', 401);
//         return;
//     }

//     switch (action) {
//         case 'restart': {
//             utils.sendData(res, 'OK');
//             restart();
//             break;
//         }
//         case 'update': {
//             utils.sendData(res, 'OK');
//             update();
//             break;
//         }
//         case 'server': {
//             const data = {
//                 ...SCRIPT_INFO,
//                 start: utils.startTime,
//                 time: now,
//                 uptime: (now - utils.startTime),
//             };
//             utils.sendData(res, data);
//             break;
//         }
//         default: {
//             utils.sendData(res, 'Not found.', 404);
//         }
//     }
// }

(async () => {
    try {
        pm2.connect((err) => {
            if (err) {
                logger.error(err);
            } else {
                pm2Connected = true;
                logger.debug('pm2 connected.')
            }
        });
    } catch (error) {
        logger.error(error.message);
    }
})();