'use strict';
/*jshint esversion: 8 */
const NAME = 'Railz';
const TABLE = 'railz';
const CONFIG_PATH = `/config/${TABLE}/settings`;

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const cache = require('./cache');

const authMain = require('./auth-main');
const oauth2 = require('./auth-oauth2');
const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/railz/?ref=%ID%`;

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

const validateWebhook = (headerSignature, requestBody, secret) => {
    try {
        // split the signature retrieved from the header
        const railzSignature = headerSignature.split(',');

        const splittedTimestamp = railzSignature[0];
        const splittedSignature = railzSignature[1];

        const timestamp = splittedTimestamp.split("=")[1];
        const signature = splittedSignature.split("=")[1];

        // generate the message string based on Railz instructions and encode the string so hmac.new can process it
        const messageString = `${timestamp}.${JSON.stringify(requestBody)}`;

        // generate your own signature based on the request payload
        const generatedSignature = crypto.createHmac('sha256', secret).update(messageString).digest('hex');

        // compare the header signature and the generated signature
        return signature === generatedSignature;
    } catch (e) {
        console.error(e);
        return false;
    }
}

fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');
const cleanRecord = (record) => {
    if (!record) {
        return;
    }

    delete record._expiresAt;
    delete record._created;
    delete record.customer_id;
    delete record._key;
    delete record._type;
    delete record._status;
    delete record._modified;

}

//TODO: Just a workaround
const checkRequest = async (request, reply) => {
    // if (!await authMain.checkHeaders(request, reply)) {
    //     return;
    // }

    let code = 404;
    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    if (id) {
        data.transaction_id = id;
        let record = await cache.getP(TABLE, id);
        if (record) {
            cleanRecord(record);
            Object.assign(data, record);
        }
    }

    reply.type('application/json').code(code);
    return data;
}

fastify.get('/check-request/:id', async (request, reply) => {
    return await checkRequest(request, reply);
})


fastify.post('/check-request/:id', async (request, reply) => {
    return await checkRequest(request, reply);
})

const getRailzData = async (endpoint, data) => {
    const headers = {
        accept: 'application/json',
        authorization: `Bearer ${oauth2.getToken(TABLE)}`,
        'content-type': "application/json; charset=utf-8"
    };

    let url = `https://api.railz.ai/${endpoint}`;
    let test = await utils.fetchData(url, data, headers, "GET");
    return { endpoint, test };
}

const test = async (data) => {
    // const data = {
    //     businessName: data.businessName,
    //     serviceName: 
    //     reportFrequency: 'year',
    //     Method:cash
    // }
    const report = [];

    report.push(await getRailzData('businesses', { businessName: data.businessName }));
    report.push(await getRailzData('businesses/info', { businessName: data.businessName, serviceName: data.serviceName }));
    // report.push(await getRailzData('reports/financialRatios', `startDate=2021-09-01&endDate=2022-09-30&reportFrequency=month&businessName=${data.businessName}&serviceName=${data.serviceName}`));
    // report.push(await getRailzData("reports/invoices", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}`));
    // report.push(await getRailzData("reports/bills", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}`));
    // report.push(await getRailzData('bankAccounts', { businessName: data.businessName, serviceName: 'plaid' }));
    // report.push(await getRailzData("reports/expenses", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));
    // report.push(await getRailzData("reports/revenue", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));
    // report.push(await getRailzData("reports/cashflowStatements", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));
    // report.push(await getRailzData("reports/balanceSheets", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));
    // report.push(await getRailzData("reports/incomeStatements", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));
    // report.push(await getRailzData("reports/railzScore", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}`));
    // report.push(await getRailzData("reports/financialRatios", `startDate=2021-09-01&endDate=2022-09-30&businessName=${data.businessName}&serviceName=${data.serviceName}&reportFrequency=month`));


    //await utils.fileWrite("railz-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log("Done!");
    //let url =`https://api.railz.ai/businesses?businessName=${data.businessName}&limit=1&type=single`;

    //const url = `https://api.railz.ai/balanceSheets?accountingMethod=cash&businessName=${data.businessName}&reportFrequency=year&serviceName=${data.serviceName}`
    //const url = `https://api.railz.ai/businesses/info?businessName=${data.businessName}&serviceName=${data.serviceName}`;

    //let url = `https://api.railz.ai/reports/financialRatios?startDate=2021-09-01&endDate=2022-09-30&reportFrequency=month&businessName=BIZ-cafa6056-e8c7-4ce0-8e03-f66c1f3fd586&serviceName=freshbooks`;
}


fastify.post('/webhook', {
    config: {
        rawBody: true
    }
}, async (request, reply) => {
    const now = Date.now();

    let body = request.body;
    if (body.data) {
        const data = body.data;
        if (data && data.businessName) {
            const id = data.businessName;
            try {
                let record = await cache.getP(TABLE, id);
                //data.event === 'auth'
                //await test(data);

                if (record) {
                    let expiration = '1w';
                    const save = {
                        updated: now,
                        railz_data: body
                    };

                    if (data.status === 'auth') {
                        expiration = '10y';
                        save.finished = now;
                        if (record.created) {
                            save.duration = now - record.created;
                        }

                        if (data.event === 'auth') {
                            save.status = 'verified';
                        } else {
                            save.status = data.event;
                        }
                    }

                    const saved = await cache.updateP(TABLE, id, save, expiration, true);
                    if (saved && saved.finished) {
                        //console.log(saved);
                        //const payload = { transaction_id: saved.transaction_id };
                        //getData(saved, payload);
                        //await authMain.sendWebhook(customer_id, payload, TABLE, handler);
                        //console.log(data);
                    }
                }
            } catch (error) {
                console.log(error);
            }
        }
    }
    reply.type('application/json').code(200);
    return "OK";
})

fastify.post('/generate-url', async (request, reply) => {
    // if (!await authMain.checkHeaders(request, reply)) {
    //     return;
    // }

    //const body = typeof(request.body) === 'string' ? JSON.parse(request.body) : request.body;
    let body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'declined'
    };

    if (body) {
        let transaction_id = body.transaction_id;
        let shorten = typeof (body.shorten_url) === 'boolean' ? body.shorten_url : false;
        let send = typeof (body.send) === 'boolean' ? body.send : true;
        let full_name = body.full_name;
        let url = typeof (body.link_url) === 'string' && body.link_url.length > 0 ? body.link_url : DEFAULT_URL;
        let text = typeof (body.sms_text) === 'string' && body.sms_text.length > 0 ? body.sms_text : params.sms_text;

        //TODO!
        if (url.indexOf('%URL%') > -1) {
            url = url.replace('%URL%', '%ID%');
        }

        let expire = "1w";
        if (body.expire && body.expire.length > 0) {
            let tmp = parseInt(body.expire);
            if (tmp < 30 || tmp > 2592000) { //1 month!
                return reply.type('application/json').code(422).send({ status: "error", reason: "expire must be between 30 and 2592000" });
            }
            expire = tmp;
        }

        if (transaction_id) {
            let record = await cache.getP(TABLE, transaction_id);
            if (record) {
                return reply.type('application/json').code(422).send({ status: "error", code: 422, error: 'Invalid transaction Id or already used.' });
            }
        } else {
            transaction_id = utils.getUUID();
        }

        data.transaction_id = transaction_id;

        data.url = url.replace("%ID%", encodeURIComponent(transaction_id));
        if (shorten) {
            let short = await utils.shortenUrl(data.url);
            data.url = short || data.url;
        }
       
        if (body.phone_number) {
            let phone_number = utils.getPhoneNumber(body.phone_number);
            if (phone_number) {
                let d = {
                    transaction_id,
                    numbers: phone_number,
                    text: utils.parseTemplate(text, {
                        '%URL%': data.url
                    })
                };

                if (send) {
                    handler.twilio(d);
                }
            } else {
                code = 422;
                data.error = 'Invalid phone number.';
            }
        }

        let email_address = body.email_address;

        if (utils.validateEmail(email_address) && code === 200) {
            let subject = params.email_subject;

            let replacements = {
                "%EMAIL%": email_address,
                "%LINK%": data.url
            };

            let d = {
                transaction_id,
                email: email_address,
                subject,
                template: 'railz_email',
                replacements
            };

            if (full_name) {
                d.name = full_name;
            }

            if (send) {
                handler.email(d);
            }
        }

        data.status = send ? 'sent' : 'generated';

        let save = {
            status: data.status,
            created: data.created,
        };

        if (request.user) {
            save.customer_id = request.user.CustomerAccountID;
        }

        let redirect_url = body.redirect_url;
        if (typeof (redirect_url) === 'string' && redirect_url.length > 0) {
            save.redirect_url = redirect_url;
        }

        let request_reference = body.request_reference;
        if (typeof (request_reference) === 'string' && request_reference.length > 0) {
            save.request_reference = request_reference;
        }

        if (send) {
            const saved = await cache.setP(TABLE, transaction_id, save, expire, true);
            if (saved && saved._expiresAt) {
                data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
            }
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    if (typeof (data.created) === "number") {
        data.created = new Date(data.created).toISOString();
    }

    reply.type('application/json').code(code);

    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //authJWT.getAuth(request);
})

fastify.addHook('onResponse', async (request, reply) => {

})


const start = async () => {
    try {
        params = await require('./params')(CONFIG_PATH, logger);

        oauth2.addRequest(TABLE, params.token_url, params.client_id, params.client_secret, undefined, "basic_auth");
        await oauth2.start();

        utils.addFastifyConfig(fastify, SCRIPT_INFO);

        fastify.listen({ port: params.port }, (err, address) => {
            if (err) throw err
            logger.info(`HTTP server is listening on ${address}`);
        });

        await handler.init();
        //await test({ businessName: 'BIZ-76345e8a-8e05-459b-a33b-ebf65f6dfec8', serviceName: 'freshbooks' });
    } catch (error) {
        logger.error(error);
    }
}

(async () => {
    await start();

})();