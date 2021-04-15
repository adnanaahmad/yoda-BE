'use strict';
/*jshint esversion: 8 */

const fastify = require('fastify')({
    logger: false,
    trustProxy: true,
    ignoreTrailingSlash: true
})

const URLS = require('./urls.json')
const DEFAULT = '_default_';

const objectToQueryString = (params) => Object.keys(params).map((key) => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
}).join('&');

// fs.watch(buttonPressesLogFile, (event, filename) => {
//     if (filename && event === 'change') {
//         console.log(`${filename} file Changed`);
//     }
// });

const handleRequest = async (id, request, reply) => {
    const now = Date.now();
    try {
        let body = request.body;
        const query = request.query;
        const method = request.method.toUpperCase(); 
        const search = objectToQueryString(query);
        let code = (request.method === 'GET' || request.method === 'HEAD') ? 302 : 307;
        let url;
        let sub;
        let urlId;

        //console.log(query, request.method, search);

        const checkBody = () => {
            if (typeof (body) === 'string') {
                try {
                    body = JSON.parse(body);
                } catch (error) {
                    //TODO!
                }
            }
        }

        if (typeof (id) === 'string' && id.length > 0) {
            const subs = URLS[id];
            if (subs) {
                url = subs[DEFAULT];
                switch (id) {
                    case 'directid': {
                        checkBody();
                        if (body && body.customerReference) {
                            const customerReference = body.customerReference;
                            const parts = customerReference.split(':');
                            if (parts.length === 3) {
                                sub = 'webhook';
                                urlId= parts[0];
                            }
                        } else if(method === 'GET' && query && query.customer_ref) {
                            const customerReference = query.customer_ref;
                            const parts = customerReference.split(':');
                            if (parts.length === 3) {
                                sub = 'redirect';
                                urlId= parts[0];
                            }
                        }
                        break;
                    }
                }

                if(sub && urlId) {
                    const urls = subs[sub];
                    if(urls) {
                        if(urls[urlId]) {
                            url = urls[urlId];
                        } else {
                            if(urls[DEFAULT]) {
                                url = urls[DEFAULT];
                            } 
                        }
                    }
                }
            }
        }

        if (url) {
            if (search && search.length > 0) {
                url = `${url}?${search}`;
            }
            //console.log(url);

            reply.redirect(code, url);
            let log = {
                method: method,
                ip: request.ip,
                ts: now,
                id: id,
                sub: sub,
            }

            if (urlId) {
                log.url_id = urlId;
            }

            console.log(log);
        } else {
            let data = {
                code: 422,
                error: 'Missing or invalid parameter.'
            };
            reply.type('application/json').code(422).send(data);
        }

        // let data = { code: 200, query, url};
        // console.log(data);
        // reply.type('application/json').code(200).send(data);

    } catch (error) {
        let data = {
            code: 500,
            error: error.message
        };
        reply.type('application/json').code(500).send(data);
    }
}

fastify.post('/:id', async (request, reply) => {
    handleRequest(request.params.id, request, reply);
});

fastify.get('/:id', async (request, reply) => {
    handleRequest(request.params.id, request, reply);
});

fastify.listen(8997, (err, address) => {
    if (err) throw err
    console.log(`HTTP server is listening on ${address}`);
});