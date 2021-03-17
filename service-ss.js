'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-ss');
const convert = require('xml-js');
const prettyData = require('pretty-data');
const soapRequest = require('./soap');
const awsClient = require('./aws-client');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);
// const Logger = require('./logger').Logger;
// const myLogger = new Logger();

const fastify = require('fastify')({
    logger: false
})

fastify.get('/:params', async (request, reply) => {
    console.log(request.body)
    console.log(request.query)
    console.log(request.params)
    console.log(request.headers)
    console.log(request.raw)
    console.log(request.id)
    console.log(request.ip)
    console.log(request.ips)
    console.log(request.hostname)
    console.log(request.protocol)
    request.log.info('some info')
    reply.type('application/json').code(200);

    return {
        service: 'samba'
    }
})

fastify.post('/order-interactive', async (request, reply) => {
    const body = request.body;
    let data = await orderInteractive(body.license, body.state);
    if(!body.full) {
        data = extractData(data) || data;
    }

    if (data) {
        reply.type('application/xml').code(200);
        return data;
    } else {

    }
});

fastify.listen(8996, (err, address) => {
    if (err) throw err
    logger.info(`HTTP server is listening on ${address}`);
})

//#fisglobal

fastify.addHook('onResponse', async (request, reply) => {
    // Some code
    //await asyncMethod()
    // console.log(request);
    // console.log(reply);
})

const js2Options = {
    spaces: 3,
    compact: true,
    fullTagEmptyElement: true,
    ignoreDeclaration: false,
    ignoreInstruction: false,
    ignoreAttributes: false,
    ignoreCdata: false
};

//TEST!
//Famouse_03
const password = 'u9sm8uhv!B';

//const  url = 'https://adrconnect.mvrs.com/adrconnect/adrconnectwebservice.svc?singlewsdl';
//const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl';
const loadParams = async () => {
    //TODO:

    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    const start = utils.time();

    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.soap-user'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.soap-password'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.credentials.account'));

    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.service-location'));
    funcs.push(awsClient.getParameter('/config/sambasafety/sambasafety.soap-action'));

    try {
        let results = await Promise.all(funcs);
        const duration = utils.time() - start;
        logger.debug(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);
        if (results) {
            logger.debug(results);
        } else {
            logger.warn(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        logger.error(error);
    }
}

const createSoapEnvelope = (name, data) => {
    const soapBody = {};

    soapBody[name] = {
        "_attributes": {
            "xmlns": "http://adrconnect.mvrs.com/adrconnect/2013/04/"
        },
        ...data
    }

    const envelope = {
        "s:Envelope": {
            "_attributes": {
                "xmlns:s": "http://schemas.xmlsoap.org/soap/envelope/"
            },
            "s:Body": {
                ...soapBody
            }
        }
    }

    try {
        const xml = convert.js2xml(envelope, js2Options);
        //logger.silly(xml);
        return xml;
    } catch (error) {
        logger.error(error);
    }
}

const extractData = (body) => {
    if (!body) {
        return;
    }

    let index = body.indexOf('<Data>&lt;![CDATA[');
    if (index > -1) {
        let end = body.indexOf(']]&gt;</Data>', index);
        let data = body.substr(index + 18, end - index - 18);
        data = utils.unescapeHTML(data);
        return data;
    }
}

const callSoapFunction = async (name, data) => {
    //logger.debug(`callSoapFunction [${name}] start...`);

    const xml = createSoapEnvelope(name, data);
    if (!xml) {
        return;
    }

    //Famouse_03
    //
    //const url = 'http://localhost:8088/ws/';
    const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc';

    const headers = {
        'user-agent': `FortifID ${SCRIPT_INFO.version}`,
        'Content-Type': 'text/xml;charset=UTF-8',
        'soapAction': `http://adrconnect.mvrs.com/adrconnect/2013/04/IAdrConnectWebService/${name}`,
    };

    const start = utils.time();
    try {
        const {
            response
        } = await soapRequest({
            url: url,
            headers: headers,
            xml: xml,
            timeout: 180000
        });

        const {
            body,
            statusCode
        } = response;
        //console.log(statusCode);
        const duration = utils.time() - start;
        //logger.debug(`callSoapFunction [${name}] done ${utils.toFixedPlaces(duration, 2)}ms`);

        return body;
    } catch (error) {
        logger.error(error);
    }
}

const changePassword = async () => {

    let data = {
        inAccountID: 'K1625',
        InUserID: '01', //inUserId //DOCS!
        inCurrentPassword: password,
        inNewPassword: 'u9sm8uhv!C',
    };

    const body = await callSoapFunction('ChangePassword', data);
    let x = prettyData.pd.xml(body);
    logger.debug(x);
}

const getCommunications = () => {
    const comm = {
        Communications: {
            Account: 'K1625',
            UserID: '01',
            Password: password,
            DeviceID: {
                "_attributes": {
                    "format": "encoded"
                }
            },
            ReportTypes: {
                Type: 'XML2.03'
            },
        }
    };
    return comm;
}

const getOrder = (license, state) => {

    license = license || 'V20203901';
    state = state || 'AZ';

    const order = {
        Order: {
            Handling: 'OL',
            Purpose: 'AA',
            ProductID: 'LV',
            Subtype: 'ST',
            DocumentType: 'License',
            Misc: 'LICENSE VALIDATION Test', //personaID
            Billing: 'CUST01PERSONA03GUID', //personaID
            State: {
                Abbrev: state,
                Full: ''
            },
            License: license,
            FirstName: 'JOHN',
            LastName: 'DOE',
            DocumentCategory: 1,
            DOB: {
                Year: '1990',
                Month: '06',
                Day: '04'
            },
           
            // Address1: '8142 OLD SUNRIDGE DR',
            // InfoCity: 'ELLABELL',
            // InfoZipcode: '31308',
            // LicenseExpireDate: {
            //     Year: 2006,
            //     Month: 1,
            //     Day: 1
            // }
        }
    };
    return order;
}


const orderInteractive = async (license, state) => {
    const data = {
        inCommunications: {
            "_cdata": convert.js2xml(getCommunications(), js2Options)
        },
        inOrder: {
            OrderXml: {
                "_cdata": convert.js2xml(getOrder(license, state), js2Options)
            }
        }
    }

    return await callSoapFunction('OrderInteractive', data);

    // try {
    //     if (!body) {
    //         return;
    //     }

    //     let data = extractData(body) || body;
    //     return data;
    //     // let x = prettyData.pd.xml(data);
    //     // logger.silly(x);
    // } catch (error) {
    //     logger.error(error);
    // }
}

const sendOrders = async () => {
    const data = {
        inCommunication: {
            "_cdata": convert.js2xml(getCommunications(), js2Options)
        },
        inOrders: [{
            OrderXml: [{
                    "_cdata": convert.js2xml(getOrder(), js2Options)
                },
                {
                    "_cdata": convert.js2xml(getOrder(), js2Options)
                }
            ],
        }]
    }

    const body = await callSoapFunction('SendOrders', data);

    try {
        if (!body) {
            return;
        }

        let data = extractData(body) || body;
        let x = prettyData.pd.xml(data);
        logger.silly(x);
    } catch (error) {
        logger.error(error);
    }
}

const receiveRecords = async () => {

    const data = {
        inCommunications: {
            "_cdata": convert.js2xml(getCommunications(), js2Options)
        }
    }

    const body = await callSoapFunction('ReceiveRecords', data);

    try {
        if (!body) {
            return;
        }

        let data = extractData(body) || body;
        let x = prettyData.pd.xml(data);
        logger.silly(x);
    } catch (error) {
        logger.error(error);
    }

}

const test001 = async () => {

    let data = {
        'V20203901': 'AZ',
        '202094501': 'CO',
        'F202020204502': 'FL',
        'F202020204503': 'FL',
        '020LV4301': 'IA',
        'M202090145301': 'MD',
        //2.02E+12	MT
        //2.02E+12	MT
        '20209301': 'TX',
        'W2020987693401': 'WI'
    }

    Object.keys(data).forEach(async (license) => {
        const state = data[license];
        //logger.debug(`license: ${license} state: ${state}`);
        let v = await orderInteractive(license, state);
        if(v) {
            console.log(extractData(v));
        }

    })
}

(async () => {
    //await loadParams();

    //await changePassword();
    //await orderInteractive();
    //await sendOrders();
    //await receiveRecords();

    await test001();
    // let customer_account_id = '60D7A8C1-2A10-42D9-8AD1-DC0F1C81E6D6';

    // const params = {
    //     TableName: 'CUSTOMER_ACCOUNT',
    //     KeyConditionExpression: '#c = :c',
    //     ExpressionAttributeValues: {
    //         ':c': customer_account_id,
    //     },
    //     ExpressionAttributeNames: {
    //         "#c": "customer_account_id",
    //     },
    // };

    // let data = await awsClient.docQuery(params);
    // if (data) {
    //     console.log(data);
    // }

})();