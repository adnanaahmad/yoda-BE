'use strict';
/*jshint esversion: 8 */
const TABLE = 'shortener';

const utils = require('./utils');
const logger = require('./logger').createLogger('shortener');
utils.setLogger(logger);

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if(!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const fastify = require('fastify')({
    logger: false
})

const cache = require('./cache');

fastify.post('/', async (request, reply) => {
    const body = request.body;
    if (body && body.long_url) {
        const now = Date.now();

        let url = utils.parseURL(body.long_url);
        //TODO
        if(url.hostname.indexOf('directid.co') == -1 && url.hostname.indexOf('fortifid.com') == -1 && url.hostname !== 'connect.direct.id') {
            let data = { code: 403, error: 'Domain not allowed.'};
            return reply.type('application/json').code(403).send(data);
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

        await cache.setP(TABLE, id, data, '1y', true);
    } else {
        let data = { code: 422, error: 'Missing parameter.'};
        reply.type('application/json').code(422).send(data);
    }
});

fastify.get('/:id', async (request, reply) => {
    const id = request?.params?.id;
    const now = new Date();

    if(!id) {
        let data = { code: 422, error: 'Missing parameter.'};
        return reply.type('application/json').code(422).send(data);
    }

    let data = await cache.getP(TABLE, id);
    if (data) {
        let url = data.long_url;
        if(data.expires && new Date() > new Date(data.expires)) {
            return reply.type('text/html').code(404).send('Sorry, URL expired.');
        }    

        return reply.redirect(url);
    } else {
        let data = { code: 404, error: 'URL expired or not found.'};
        return reply.type('application/json').code(404).send(data);
    }
});

fastify.listen(8996, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {

})();