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

const ALLOWED_STATES = ['AR', 'AZ', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'MA', 'MD', 'ME', 'MI', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NJ', 'NM', 'PA', 'RI', 'SD', 'TN', 'TX', 'VA', 'VT', 'WA', 'WI', 'WY'];

function unescapeHTML(escapedHTML) {
    return escapedHTML.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#xD;/g, '').replace(/&#xA;/g, '').replace(/\[0x9\]/g, '  ');
}


fastify.get('/:params', async (request, reply) => {
    // console.log(request.body)
    // console.log(request.query)
    // console.log(request.params)
    // console.log(request.headers)
    // console.log(request.raw)
    // console.log(request.id)
    // console.log(request.ip)
    // console.log(request.ips)
    // console.log(request.hostname)
    // console.log(request.protocol)
    // request.log.info('some info')
    const now = Date.now();
    reply.type('application/json').code(200);
    const data = {
        ...SCRIPT_INFO,
        start: utils.startTime,
        time: now,
        uptime: (now - utils.startTime),
    };
    return {
        server: data
    }
})

fastify.post('/order-interactive', async (request, reply) => {
    const body = utils.flattenObject2(request.body);
    if(!body.issuing_state || ALLOWED_STATES.indexOf( body.issuing_state) === -1) {
        reply.type('application/json').code(417);
        return {error: 'STATE NOT SUPPORTED'};
    }

    let data = await orderInteractive(body);

    if (data) {
        data = extractData(data);
        if(data) {
            data = extractResult(data);
        }
        reply.type('application/json').code(200);
        return data;
    } else {

    }
});

fastify.listen(8000, (err, address) => {
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
const account = process.env.SS_ACCOUNT;
const userId = process.env.SS_USER_ID;
const password = process.env.SS_PASSWORD;


const loadParams = async () => {
    //TODO:

    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    //const funcs = [];
    const start = utils.time();

    const results = await awsClient.getParametersByPath('/config/sambasafety/', undefined, true);

    try {

        const duration = utils.time() - start;
        //logger.debug(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);
        
        if (results) {
            console.log(JSON.stringify(results, null, 2));
            //logger.debug(results);
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

const nativeType = (value) => {
    var nValue = Number(value);
    if (!isNaN(nValue)) {
        return nValue;
    }
    var bValue = value.toLowerCase();
    if (bValue === 'true') {
        return true;
    } else if (bValue === 'false') {
        return false;
    }
    return value;
}

const removeJsonTextAttribute = (value, parentElement) => {
    try {
        var keyNo = Object.keys(parentElement._parent).length;
        var keyName = Object.keys(parentElement._parent)[keyNo - 1];
        parentElement._parent[keyName] = nativeType(value);
    } catch (e) {}
}

const options = {
    compact: true,
    trim: true,
    ignoreDeclaration: true,
    ignoreInstruction: true,
    ignoreAttributes: true,
    ignoreComment: true,
    ignoreCdata: true,
    ignoreDoctype: true,
    textFn: removeJsonTextAttribute,
};

const extractResult = (xml)=> {
    let ndx = xml.indexOf('<Result>');
    if (ndx > -1) {
        let ndx2 = xml.indexOf('</Result>');
        xml = unescapeHTML(xml.substr(ndx, ndx2 - ndx + 10));
        let result =  convert.xml2js(xml, options);
        return result.Result;
    }
}

const callSoapFunction = async (name, data) => {
    //logger.debug(`callSoapFunction [${name}] start...`);

    const xml = createSoapEnvelope(name, data);
    if (!xml) {
        return;
    }
    //console.log(xml)
    //Famouse_03
    //
    //const url = 'http://localhost:8088/ws/';
    const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc';
    //const url = 'https://adrconnect.mvrs.com/AdrConnect/AdrConnectWebService.svc';
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

const changePassword = async (newPassword) => {

    let data = {
        inAccountID: 'K1625',
        InUserID: '01', //inUserId //DOCS!
        inCurrentPassword: password,
        inNewPassword: newPassword,
    };

    const body = await callSoapFunction('ChangePassword', data);
    let x = prettyData.pd.xml(body);
    logger.debug(x);
}

const getCommunications = () => {
    const comm = {
        Communications: {
            Account: account,
            UserID: userId,
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

const orderMap = {
    first_name: 'FirstName',
    last_name: 'LastName',
    middle_name: 'MiddleName',
    line1: 'Address1',
    city: 'InfoCity',
    zip_code: 'InfoZipcode',
    persona_id: 'Misc'
}

const formatDateObject = (date)=> {
    //let dt = new Date(date);
    const parts = date.split('-');
    return {
        Year: parts[0],
        Month: parts[1],
        Day : parts[2]
    }

}

const getOrder = (data) => {
    const order = {
            Handling: 'OL',
            Purpose: 'AA',
            ProductID: 'LV',
            Subtype: 'ST',
            DocumentType: 'License',
            DocumentCategory: 1,
            State: {
                Abbrev: '',
                Full: ''
            }
        }
    
    utils.copyData(data, orderMap, order);

    order.License = data.license_number;
    order.Billing = data.persona_id;
    order.State.Abbrev = data.issuing_state;
    order.DOB = formatDateObject(data.birth_date);
    order.LicenseExpireDate = formatDateObject(data.expiration_date);

    return { Order: order};
}


const orderInteractive = async (data) => {

    const output = {
        inCommunications: {
            "_cdata": convert.js2xml(getCommunications(), js2Options)
        },
        inOrder: {
            OrderXml: {
                "_cdata": convert.js2xml(getOrder(data), js2Options)
            }
        }
    }

    return await callSoapFunction('OrderInteractive', output);

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

    //let date = new Date('2006-01-01');
    //console.log(date.toISOString());

    //await test001();
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

    //const id = utils.flattenObject2(JSON.parse(await utils.fileRead(__dirname + '/tmp/id-cisco.json', 'utf-8')));
    //const id = utils.flattenObject2(JSON.parse(await utils.fileRead(__dirname + '/tmp/id.json', 'utf-8')));
    //let data = await orderInteractive(id);

    //if(data) {
    //}
})();