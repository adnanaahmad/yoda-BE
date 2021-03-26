'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-neustar');
const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false
})


const handlerTwilioQ = require('./handler-twilio');
const handlerEmailQ = require('./handler-email');

const TEMPLATES = {};
const STATUS = {};
const VERIFIED = {};


const shortenUrl = async (url, token, full = false) => {
    const data = {
        "long_url": url
    };

    const headers = {
        //"Authorization": `Bearer ${token}`
    };

    const start = utils.time();
    try {
        const results = await utils.fetchData('https://i.dev.fortifid.com/s/', data, headers);
        const duration = utils.time() - start;
        logger.info(`Url shortened to [${results.link}] in ${utils.toFixedPlaces(duration, 2)}ms`);

        return full ? results : results.link;
    } catch (error) {
        logger.error(error);
    }

}

fastify.post('/webhook', async (request, reply) => {
    const body = request.body;
    if(body) {
        console.log(body);
        const v = body.verification; 
        if(v) {
            //TODO!
            let data = {
                ...v

            };
            VERIFIED[v.id] = data;
        }else {
            STATUS[body.id] = body;
        }
    }
    reply.type('application/json').code(200);

    return {
        service: 'veriff'
    }
});

//TODO! params!
const email_subject = 'ID Verification Steps';
const sms_text = 'From FortifID: please use the following link to complete the ID verification steps: %URL%'


fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    const id = request.params.id;
    const data = {status: 'waiting'};
    if(id) {
        let record;
        if(id.startsWith(':')) {
            record = utils.findObjectByFieldValue(STATUS, 'vendorData', id);
            if(!record) {
                record = utils.findObjectByFieldValue(VERIFIED, 'vendorData', id);
            }
            if(record) {
                data.id = record.id;
            }
        }else {
            record = VERIFIED[id];
            if(!record) {
                record = STATUS[id];
            }
        }
        
        if(record) {
            data.status = record.status || record.action;
            if(record.reason !== null) {
                data.reason = record.reason;
            }
        }
    }
    reply.type('application/json').code(200);
    return data;
})

fastify.post('/generate-id-url', async (request, reply) => {
    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    const body = request.body;
    if(body) {

        console.log(body);
        body.start = Date.now();
        //TODO!
        let transaction_id = body.transaction_id ;
        body.url = `https://i.dev.fortifid.com/demo/veriff?ref=${encodeURIComponent(transaction_id)}`

        let short = await shortenUrl(body.url);
        body.url = short || body.url;

        let phone_number = body.phone_number;
        if (phone_number && phone_number.length > 0) {
            let data = {
                transaction_id: transaction_id,
                numbers: phone_number,
                text: utils.parseTemplate(sms_text, {
                    '%URL%': body.url
                })
            };
            handlerTwilioQ.add(data);

            delete body.phone_number;
        }

        let email_address = body.email_address;

        if (utils.validateEmail(email_address)) {
            let full_name = body.full_name;
            let subject = email_subject;

            let replacements = {
                "%EMAIL%": email_address,
                "%LINK%": body.url
            };

            let data = {
                transaction_id: transaction_id,
                email: email_address,
                subject: subject,
                template: 'veriff_email',
                replacements: replacements
            };

            if (full_name) {
                data.name = full_name;
                delete body.full_name;
            }

            handlerEmailQ.add(data);

            delete body.email_address;
        }

    }

    reply.type('application/json').code(200);
    return body;
})



fastify.listen(8004, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
});

(async () => {

})();