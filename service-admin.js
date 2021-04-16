'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

const logger = require('./logger').createLogger('service-admin');
utils.setLogger(logger);

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info('Startup', SCRIPT_INFO);

const authMain = require('./auth-main');

const https = require('https');
const axios = require('axios');

const axiosOptions = {};

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

const HOSTS = ['i.dev.fortifid.com', 'i.prod.fortifid.com', 'z.prod.fortifid.com'];

const pm2 = require('pm2');

const awsClient = require('./aws-client');

let pm2Connected = false;

const execCommand = async (file, args) => {
    try {
        const data = {};

        if (SCRIPT_INFO.host) {
            data.host = SCRIPT_INFO.host
        }

        data.start = Date.now();

        const {
            stdout,
            stderr
        } = await utils.execFile(file, args);

        data.end = Date.now();
        data.duration = data.end - data.start;

        let temp = utils.splitLines(stdout);
        if (temp) {
            data.output = temp;
        }

        temp = utils.splitLines(stderr);
        if (temp) {
            data.error = temp;
        }

        return data;
    } catch (error) {
        logger.error(error);
        return {
            error: error.message
        };
    }
}

const sendCommand = async (url, method, data) => {
    const options = {
        method,
        url,
        //headers: headers,
        //data,
        timeout: 10000,
        maxContentLength: Infinity,

    };

    if (axiosOptions.httpsAgent) {
        options.httpsAgent = axiosOptions.httpsAgent;
    }

    try {
        const result = await axios(options);
        return result.data;
    } catch (error) {
        return error.message;
    }
}

const sendHosts = async (hosts, endpoint, method, data) => {
    if (!axiosOptions.httpsAgent) {
        return;
    }

    const results = {};

    if (SCRIPT_INFO.host) {
        results.host = SCRIPT_INFO.host
    }

    const funcs = [];
    hosts.forEach(host => {
        funcs.push(sendCommand(`https://${host}${endpoint}`, method, data));
    });

    try {
        results.start = Date.now();
        results.output = await Promise.all(funcs);
    } catch (error) {
        results.error = error.message;
    }
    results.end = Date.now();
    results.duration = results.end - results.start;

    return results;
}


const update = async (args) => {
    return await execCommand(`${__dirname}/data/update.sh`, args);
}

const pushUpdates = async (args) => {
    return await execCommand(`${__dirname}/tmp/push-updates.sh`, args);
}

const restart = () => {
    if (pm2Connected) {
        pm2.restart("all", (err, val) => {
            if (err) {
                logger.error(err)
            } else {
                //logger.info(val);
            }
        });
    }
}

const importAccount = () => {
    // let id = 'A99E264A82E3F746123C68098F2D116B6E483F289FB77DF3725314EFD30D258F';
    // let data = await getAuthz(id);
    // await utils.fileWrite( `./tmp/${id}.json`, JSON.stringify(data, null, 2));
    // let json = JSON.parse(await utils.fileRead('./uploads/tmp.json'));
    // awsClient.putDDBItem('USER_AUTHZ_TABLE', json);
}

fastify.get('/update', async (request, reply) => {
    let results = await update(['all']);

    reply.type('application/json').code(200).send(results);
    restart();
})

fastify.get('/push-updates', async (request, reply) => {
    let results = await sendHosts(HOSTS, '/admin/v1/update');

    reply.type('application/json').code(200).send(results);
})

fastify.get('/info', async (request, reply) => {
    const now = Date.now();
    const data = {
        ...SCRIPT_INFO,
        time: now,
        uptime: Math.round(process.uptime()),
    };
    
    reply.type('application/json').code(200).send(data);
})


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
    if (process.env.CLIENT_CERT && await utils.fileExists(process.env.CLIENT_CERT) &&
        process.env.CLIENT_KEY && await utils.fileExists(process.env.CLIENT_KEY)) {
        try {
            const httpsAgent = new https.Agent({
                cert: await utils.fileRead(process.env.CLIENT_CERT),
                key: await utils.fileRead(process.env.CLIENT_KEY),
                //  ca: fs.readFileSync('ca.crt'),
            });

            if (httpsAgent) {
                axiosOptions.httpsAgent = httpsAgent
            }
        } catch (error) {
            console.log(error);
        }
    }

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