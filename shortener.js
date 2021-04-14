'use strict';
/*jshint esversion: 8 */
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

//TODO!
const storage = require('node-persist');

fastify.post('/', async (request, reply) => {
    const body = request.body;
    if (body && body.long_url) {
        if(body.long_url.indexOf('directid.co') == -1 && body.long_url.indexOf('fortifid.com') == -1) {o
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

        reply.type('application/json').code(200).send(data);
        //TODO: check if dupe
        storage.setItem(id, data);
    } else {
        let data = { code: 422, error: 'Missing parameter.'};
        reply.type('application/json').code(422).send(data);
    }
});

fastify.get('/:id', async (request, reply) => {
    const id = request?.params?.id;

    if(!id) {
        //let data = { code: 422, error: 'Missing parameter.'};
        //reply.type('application/json').code(422).send(data);
        reply.type('text/html').code(200).send('');
        return;
    }

    let data = await storage.getItem(id);
    //console.log(data, id);
    if (data) {
        reply.redirect(data.long_url);
        return;
    } else {
        let data = { code: 404, error: 'URL expired or not found.'};
        //reply.type('application/json').code(404).send(data);
        reply.redirect(`https://fortifid.com/?id=expired`);
    }
});

fastify.listen(8996, (err, address) => {
    if (err) throw err
    console.log(`HTTP server is listening on ${address}`);
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
        ttl: true,
        expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
        forgiveParseErrors: false
    });
})();