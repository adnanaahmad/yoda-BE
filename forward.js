const http = require('http');

const utils = require('./utils');
const SCRIPT_INFO = utils.getFileInfo(__filename, true);
console.info(SCRIPT_INFO);

const url = require('url');

const PARAMS = { http_port: 8997};
const handlerWebhookQ = require('./handler-webhook');

const httpHandler = async (req, res) => {
    const startTimer = utils.time();
    let logRequest = true;
    let method;
    let path;
    let ip;
    let referer;

    const doLog = ()=> {
        const duration = utils.time() - startTimer;
        let log = {
            method: method,
            path: path,
            ip: ip,
            duration: utils.toFixedPlaces(duration, 2)
        }
        
        if(referer) {
            log.referer = referer;
        }
        console.info(log);
    }

    try {
        method = req.method.toUpperCase();
        const now = Date.now();
        let resource;
        ip = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);

        try {
            

            let parsed = url.parse(req.url, true);
            path = parsed.pathname;
            if (!path || path.length < 2) {
                path = '/';
            }

            if (path.endsWith('/')) {
                path = path.substring(0, path.length - 1);
            }

            path = path.toLowerCase();

            referer = req.headers['referer'];
            let origin = req.headers['origin'];

            //TODO!!!!! This is just so the demo site will work for now.
            // if (!referer || referer !== 'https://dev.barbarians.com/demo/fortifid/') {
            //     if (PARAMS.api_whitelist.indexOf(ip) === -1) {
            //         utils.sendText(res, 'IP address not allowed.', 403);
            //         console.log('IP address not allowed.');
            //         return;
            //     }
            // }

            let parts = path.substr(1).split('/');
            let count = parts.length;
            resource = parts[0];
            let action = count > 1 ? parts[1] : undefined;

            console.log(req.url, parsed);
            let bodyData;
            let bodyLength = req.headers["content-length"];
            //let contentType = req.headers['content-type'];
            if (bodyLength && ((bodyLength = parseInt(bodyLength)) > 0)) {
                try {
                    //let parse =  contentType && contentType.indexOf('json') > 0;
                    bodyData = await utils.getBody(req); //, parse);
                } catch (error) {
                    console.error(error);
                    utils.sendData(res, error, 400);
                    return;
                }
            }
            utils.sendData(res, 'OK');

            let d = {
                data: bodyData,
                url: 'https://webhook.site/998784e8-227e-4246-8a85-05e63d6bcb0f',
                method: method
            }
            if(parsed.search) {
                d.query = parsed.search 
            }
            
            handlerWebhookQ.add(d);

        } catch (e) {
            console.error(e);
            try {
                res.end(e.message);
            } catch (error) {}
        }
    } catch (error) {
        console.error(error.message);
    }
    
    //TODO!
    // if(!res.writableFinished) {
    //     try {
    //         res.end();
    //     } catch (error) {}
    // }

    if (logRequest) {
        doLog();
    }
}

(async () => {
    http.createServer(httpHandler).listen(PARAMS.http_port, (err) => {
        if (err) {
            return console.error(err);
        }
        console.log(`HTTP server is listening on ${PARAMS.http_port}`);
    });
})();

