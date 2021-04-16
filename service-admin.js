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

//TODO! SCRIPT_INFO.host
const HOSTS = ['i.dev.fortifid.com', 'i.prod.fortifid.com', 'z.prod.fortifid.com'];
const ALLOWED_COMMANDS = ['pwd', 'ls', 'date', 'df', 'free'];

const pm2 = require('pm2');

const awsClient = require('./aws-client');

let pm2Connected = false;

const execCommand = async (command, args) => {
    try {
        const data = {};

        data.start = Date.now();

        const {
            stdout,
            stderr
        } = await utils.execFile(command, args, {
            timeout: 30000
        });

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

//TODO!
const getHosts = (id) => {
    let hosts = [];

    if (!id || id === SCRIPT_INFO.host) {
        hosts.push(SCRIPT_INFO.host);
    } else if (id === 'all') {
        hosts = {
            ...HOSTS
        };
        hosts.push(CRIPT_INFO.host);
    } else {
        id.split(',').filter(Boolean).forEach(host => {

            if (HOSTS.indexOf(host) > -1) {
                hosts.push(host);
            }
        })
        //TODO! comma sep

    }

    return hosts;
}

const sendCommand = async (url, body, method, headers) => {

    headers = headers || {};

    let data;

    if (!method) {
        method = 'get';
    } else {
        method = method.toLowerCase();
    }

    //TODO
    const bodyType = typeof (body);

    // if (!headers['content-type'] && bodyType === 'object') {
    //     headers['content-type'] = 'application/json';
    // }

    if (bodyType === 'object') {
        if (headers['content-type'] === 'application/json') {
            body = JSON.stringify(body);
        } else {
            body = new URLSearchParams(body);
            url = `${url}${url.indexOf('?') > -1 ? '&' : '?'}${body}`;

        }
    }

    const options = {
        method,
        url,
        headers: headers,
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
        return {
            error: error.message
        };
    }
}

const getUrl = (host, endpoint) => {
    return `https://${host}${endpoint}`;
}

const sendHosts = async (hosts, endpoint, data, method) => {
    if (!axiosOptions.httpsAgent) {
        return;
    }

    const results = {};

    const funcs = [];
    hosts.forEach(host => {
        funcs.push(sendCommand(getUrl(host, endpoint), data, method));
    });

    try {
        results.start = Date.now();
        results.output = await Promise.all(funcs);
        if (results.output) {
            results.output.forEach((output, index) => {
                if (output.error) {
                    output.host = hosts[index];
                }
            })
        }
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

const restart = () => {
    if (pm2Connected) {
        if (typeof (process.env.NO_RESTART) === 'undefined') {
            pm2.restart("all", (err, val) => {
                if (err) {
                    logger.error(err)
                } else {
                    //logger.info(val);
                }
            });
            return {
                status: 'Restarting all services.'
            }
        }
    }
    return {
        error: 'Unable to restart.'
    };
}

const importAccount = () => {
    // let id = 'A99E264A82E3F746123C68098F2D116B6E483F289FB77DF3725314EFD30D258F';
    // let data = await getAuthz(id);
    // await utils.fileWrite( `./tmp/${id}.json`, JSON.stringify(data, null, 2));
    // let json = JSON.parse(await utils.fileRead('./uploads/tmp.json'));
    // awsClient.putDDBItem('USER_AUTHZ_TABLE', json);
}


fastify.get('/push-updates', async (request, reply) => {
    let results = await sendHosts(HOSTS, '/admin/v1/update');

    reply.type('application/json').code(200).send(results);
})


const getInfo = () => {
    return {
        ...SCRIPT_INFO,
        time: Date.now(),
        uptime: Math.round(process.uptime()),
    };
}

const getCommandData = async (command, data) => {
    try {
        switch (command) {
            case 'info': {
                return getInfo();
            }
            case 'health': {
                return {
                    status: 'OK'
                };
            }
            case 'restart': {
                return restart();
            }
            case 'update': {
                let results = await update();
                restart();
                return results;
            }
            case 'cmd': {
                let results;
                if (data && data._args) {
                    let command = data._args.trim();
                    let args;
                    let ndx = command.indexOf(' ');
                    if (ndx > -1) {
                        args = [command.substr(ndx + 1)];
                        command = command.substr(0, ndx);
                    }

                    //TODO! Whitelist commands!!!!!            
                    if(command.length > 0 && ALLOWED_COMMANDS.indexOf(command) > -1) {
                        results = await execCommand(command, args);
                    } else {
                        results = {error: `Command ${command} not allowed.`}
                    }
                }

                if (typeof (results) === 'undefined') {
                    results = {};
                }

                return results;
            }
            default:
                return {
                    error: 'Invalid command'
                };
        }
    } catch (error) {
        return error.message;
    }
}

const getData = async (request, reply) => {
    let command = request.routerPath.split('/')[1];
    const endpoint = `/admin/v1/${command}`;

    const body = request.body || request.query;

    let results = [];
    const id = request.params.id;
    //TODO: post-execute
    if (!id || id === 'all' || id === SCRIPT_INFO.host) {
        let data = await getCommandData(command, body);
        if(data && !data.host) {
            data.host = SCRIPT_INFO.host;
        }

        if (id === 'all') {
            results = await sendHosts(HOSTS, endpoint, body);
            
            if (results && results.output) {
                results.output.push(data);
            } else {
                results = data;
            }
        } else {
            results = data;
        }
    } else {
        //TODO: split!
        if (HOSTS.indexOf(id) > -1) {
            results = await sendCommand(getUrl(id, endpoint), request.query, 'get');
            if (results && results.error) {
                results.host = id;
            }
        }
    }

    reply.type('application/json').code(200);
    return results;
}

fastify.get('/update', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/update/:id', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/info', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/info/:id', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/cmd', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/cmd/:id', async (request, reply) => {
    return getData(request, reply);
})


fastify.get('/restart', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/restart/:id', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/health', async (request, reply) => {
    return getData(request, reply);
})

fastify.get('/health/:id', async (request, reply) => {
    return getData(request, reply);
})


fastify.get('/hosts', async (request, reply) => {
    const hosts = [SCRIPT_INFO.host, ...HOSTS];
    reply.type('application/json').code(200);

    return hosts;
})

fastify.get('/host', async (request, reply) => {
    reply.type('application/json').code(200);

    return {
        host: SCRIPT_INFO.host
    };
})

fastify.addHook("onRequest", async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply, 0, true)) {
        return;
    }
    //console.log(request.routerPath, request.routerMethod);
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