'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

const logger = require('./logger').createLogger('service-admin');
utils.setLogger(logger);

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info('Startup', SCRIPT_INFO);

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
        } = await utils.execFile(`${__dirname}/data/update.sh`);

        return {
            output: stdout,
            error: stderr
        }
    } catch (error) {
        logger.error(error);
        return {error: error.message};
    }
}

const restart = () => {
    if (pm2Connected) {
        pm2.restart("all", (err, val) => {
            if (err) {
                logger.error(err)
            } else {
                logger.info(val);
            }
        });
    }
}

fastify.get('/update', async (request, reply) => {
    let results = await update(request, reply);
    
    reply.type('application/json').code(200).send(results);
    restart();
})

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

fastify.addHook("onRequest", async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply, 0, true)) {
        return;
    }
});

fastify.listen(9999, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    //await loadParams();
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