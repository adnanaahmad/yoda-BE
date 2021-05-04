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
const HOSTS = [
    'i.dev.fortifid.com',
    'i.prod.fortifid.com',
    //'z.prod.fortifid.com'
];

const ALLOWED_COMMANDS = ['pwd', 'ps', 'env',
    'pm2', 'ls', 'date', 'df', 'free', 'npm',
    'free', 'whoami', 'locate', 'find', 'du',
    'uname'
];

let haveLocalCerts = false;

//TODO! Do not allow certain commands for local
const COMMANDS = ['versions', 'help', 'commands', 'health', 'host', 'hosts', 'version',
    'restart', 'stop', 'start', 'reload', 'list', 'cmd', 'info', 'update', 'revert', 'trim', 'backups'
];

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
        let temp = utils.splitLines(error.message);
        return {
            error: temp
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

const trim = async () => {
    const dir = '/home/ec2-user/backups';
    let data;
    if(await utils.fileExists(dir)) {
        data = await execCommand(`${__dirname}/data/trim.sh`, args);
    } else {
        data = { error: 'No backups available.'}
    }

    return data;
    //return await execCommand(`rm`, "`ls /home/ec2-user/backups -t | awk 'NR>3'`");
}

const backups = async () => {
    const dir = '/home/ec2-user/backups/';
    let files;
    if(await utils.fileExists(dir)) {
        files = await utils.dirRead(dir);
    } else {
        files = [];
    }

    return {backups: files};
}

const revert = async(version)=> {
    const file = `/home/ec2-user/backups/${version}${version.endsWith('.tar.gz') ? '':'.tar.gz'}`;
    if(await utils.fileExists(file)) {
        let results = await execCommand(`${__dirname}/data/revert.sh`,  [file]);
        setTimeout(() => {
            execPM2Command('restart');
        }, 500);
        return results;
    }else {
        return {error: "Version not available."}
    }
    //return { exists: await utils.fileExists(file), file: file};

}

const execPM2Command = async (command, service = 'all') => {
    return new Promise((resolve, reject) => {
        if (pm2Connected) {
            if (typeof (service) === 'undefined' || service.length < 1) {
                service = 'all';
            }

            logger.info('execPM2Command', command, service);
            if (command === 'restart' && typeof (process.env.NO_RESTART) !== 'undefined') {
                resolve({status: 'error', error: 'Cannot restart services.' })
                return;
            }

            try {
                pm2[command](service, async (err, proc) => {
                    if (err) {
                        logger.error(err);
                        resolve({
                            status: 'error',
                            error: err.message
                        });
                        return;
                    }
                    //logger.silly(proc);
                    let data = {
                        status: 'success'
                    };
                    if (command === 'list') {
                        const list = [];
                        proc.forEach(item => {
                            const pm2_env = item.pm2_env;

                            let dat = {
                                pid: item.pid,
                                name: item.name,
                                memory: item.monit.memory,
                                cpu: item.monit.cpu,
                                created: pm2_env.created_at,
                                restarts: pm2_env.restart_time,
                                unstable_restarts: pm2_env.unstable_restarts,
                                status: pm2_env.status,
                            };
                            dat.uptime = (pm2_env.pm_uptime && pm2_env.status == 'online') ? (new Date() - pm2_env.pm_uptime) : 0;

                            list.push(dat);

                        })
                        data.procs = list;
                        //await utils.fileWrite('./tmp/list.json', JSON.stringify(proc));
                    }
                    //logger.info(data);
                    resolve(data);
                })
            } catch (error) {
                logger.error(error);
                resolve({
                    status: 'error',
                    error: error.message
                });
                //results = error.message;
            }
        } else {
            resolve({
                status: 'error',
                error: 'process manager not connected.'
            });
        }
    });
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
    const now = Date.now()
    return {
        ...SCRIPT_INFO,
        time: now,
        uptime: now - SCRIPT_INFO.start,

        //uptime: Math.round(process.uptime()),
    };
}

const getCommandData = async (command, data) => {
    try {
        let _args;
        if (data && typeof (data._args) === 'string') {
            _args = data._args.trim();
        }

        switch (command) {
            case 'info': {
                return getInfo();
            }
            case 'version': {
                return {
                    version: SCRIPT_INFO.version
                };
            }
            case 'versions': {
                return {
                    versions: process.versions
                };
            }
            case 'health': {
                return {
                    status: 'OK'
                };
            }
            case 'start':
            case 'stop':
            case 'reload':
            case 'list':
            case 'restart': {
                return await execPM2Command(command, _args);
            }
            case 'update': {
                let results = await update();

                setTimeout(() => {
                    execPM2Command('restart');
                }, 500);
                return results;
            }
            case 'trim': {
                return await trim();
            }
            case 'backups': {
                return await backups();
            }
            case 'revert': {
                return await revert(_args);
            }            
            case 'commands':
            case 'help': {
                return {
                    commands: COMMANDS,
                    cmd: ALLOWED_COMMANDS
                };
            }
            case 'host': {
                return {
                    host: SCRIPT_INFO.host
                };
            }
            case 'hosts': {
                return {
                    host: [SCRIPT_INFO.host, ...HOSTS]
                };
            }
            case 'cmd': {
                let results;
                if (_args) {
                    let command = _args;
                    let args;
                    let ndx = command.indexOf(' ');
                    if (ndx > -1) {
                        args = [command.substr(ndx + 1)];
                        command = command.substr(0, ndx);
                    }

                    if (command.length > 0 && ALLOWED_COMMANDS.indexOf(command) > -1) {
                        results = await execCommand(command, args);
                    } else {
                        results = {
                            error: `Command ${command} not allowed.`
                        }
                    }
                }

                if (typeof (results) === 'undefined') {
                    results = {};
                }

                return results;
            }
            default:
                return {
                    error: 'Invalid or command not ready/allowed.'
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
        if (data && !data.host) {
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

fastify.addHook("onRequest", async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply, 0, true)) {
        return;
    }
});

(async () => {

    if (process.env.CLIENT_CERT && await utils.fileExists(process.env.CLIENT_CERT) &&
        process.env.CLIENT_KEY && await utils.fileExists(process.env.CLIENT_KEY)) {

        haveLocalCerts = true;

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
            logger.error(error);
        }
    }

    ALLOWED_COMMANDS.sort();
    COMMANDS.sort();

    COMMANDS.forEach(command => {

        fastify.get(`/${command}`, async (request, reply) => {
            return getData(request, reply);
        })


        fastify.get(`/${command}/:id`, async (request, reply) => {
            return getData(request, reply);
        })
    })

    fastify.listen(9999, (err, address) => {
        if (err) {
            logger.error(err);
            return;
        }
        logger.info(`HTTP server is listening on ${address}`);
    });

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