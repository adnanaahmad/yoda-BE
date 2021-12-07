'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('shortener');
utils.setLogger(logger);
const ms = require('ms');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if(!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const fastify = require('fastify')({
    logger: false
})

//TODO!
const storage = require('node-persist');

fastify.post('/', async (request, reply) => {
    const body = request.body;
    if (body && body.long_url) {
        const now = Date.now();

        let url = utils.parseURL(body.long_url);
        if(url.hostname.indexOf('directid.co') == -1 && url.hostname.indexOf('fortifid.com') == -1 && url.hostname !== 'connect.direct.id') {
            let data = { code: 403, error: 'Domain not allowed.'};
            reply.type('application/json').code(403).send(data);
            return;
        }

        const id = utils.randomString(6);
        let data = {
            created_at: new Date().toISOString(),
            id: id,
            link: `https://${SCRIPT_INFO.host}/s/${id}`,
            long_url: body.long_url
        };

        let expires = 0;
        if(url.hostname.indexOf('fortifid.com') > -1) {
            const parts = url.pathname.split('/');
            if(parts.length > 1) {
                //for now.
                // switch(parts[1]) {
                //     case 'mfa': {
                //         expires = ms('4m');
                //         break;
                //     }
                //     case 'doc': {
                //         expires = ms('20m');
                //         break;
                //     }
                // }
            } 
        } else {

        }

        if(expires > 0) {
            data.expires = new Date(now + expires).toISOString(); 
        }
        reply.type('application/json').code(200).send(data);
        //console.log(data);
        //TODO: check if dupe
        storage.setItem(id, data);
    } else {
        let data = { code: 422, error: 'Missing parameter.'};
        reply.type('application/json').code(422).send(data);
    }
});

fastify.get('/:id', async (request, reply) => {
    const id = request?.params?.id;
    const now = new Date();

    if(!id) {
        //let data = { code: 422, error: 'Missing parameter.'};
        //reply.type('application/json').code(422).send(data);
        reply.type('text/html').code(200).send('');
        return;
    }

    let data = await storage.getItem(id);
    //console.log(data, id, );
    if (data) {
        let url = data.long_url;
        //console.log(data, now, request.headers, request.method, request.body);
        if(data.expires && new Date() > new Date(data.expires)) {
            //reply.type('text/html').code(200).send('Sorry, URL expired.');
            //return;
            url = 'https://api-uat.fortifid.com/misc/?expired'
        }    

        reply.redirect(url);
        return;
    } else {
        let data = { code: 404, error: 'URL expired or not found.'};
        //reply.type('application/json').code(404).send(data);
        reply.redirect(`https://api-uat.fortifid.com/misc/?not_found`);
    }
});

fastify.listen(8996, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {
    //Just for development/testing
    await storage.init(
    {
        dir: '.cache',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false, 
        ttl: ms('1w'),
        expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
        forgiveParseErrors: false
    });
})();