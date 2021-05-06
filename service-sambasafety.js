'use strict';
/*jshint esversion: 8 */
const NAME = 'SambaSafety';
const TABLE = 'service-sambasafety';
const PORT = 7975;

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
const convert = require('xml-js');
const prettyData = require('pretty-data');
const soapRequest = require('./soap');
const awsClient = require('./aws-client');
const authMain = require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

const fastify = require('fastify')({
    logger: false,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/license`,
    serve: true,
    prefix: '/',
})

const ALLOWED_STATES = ['AR', 'AZ', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'MA', 'MD', 'ME', 'MI', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NJ', 'NM', 'PA', 'RI', 'SD', 'TN', 'TX', 'VA', 'VT', 'WA', 'WI', 'WY'];

function unescapeHTML(escapedHTML) {
    return escapedHTML.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#xD;/g, '').replace(/&#xA;/g, '').replace(/\[0x9\]/g, '  ');
}


fastify.post('/query', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = utils.flattenObject2(request.body);
    if (!body.issuing_state || ALLOWED_STATES.indexOf(body.issuing_state) === -1) {
        reply.type('application/json').code(417);
        return {
            error: 'STATE NOT SUPPORTED'
        };
    }

    let data = await orderInteractive(body);

    if (data) {
        data = extractData(data);
        if (data) {
            data = extractResult(data);
        }
        reply.type('application/json').code(200);
        return data;
    } else {

    }
});

fastify.listen(PORT, (err, address) => {
    if (err) throw err
    logger.info(`${NAME} server is listening on ${address}`);
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

const extractResult = (xml) => {
    let ndx = xml.indexOf('<Result>');
    if (ndx > -1) {
        let ndx2 = xml.indexOf('</Result>');
        xml = unescapeHTML(xml.substr(ndx, ndx2 - ndx + 10));
        let result = convert.xml2js(xml, options);
        return result.Result;
    }
}

const callSoapFunction = async (name, data) => {
    logger.debug(`callSoapFunction [${name}] start...`);

    const xml = createSoapEnvelope(name, data);
    if (!xml) {

        return;
    }

    //const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc';
    const url = 'https://adrconnect.mvrs.com/AdrConnect/AdrConnectWebService.svc';
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
            timeout: 30000
        });

        const {
            body,
            statusCode
        } = response;
        const duration = utils.time() - start;
        logger.debug(`callSoapFunction [${name}] done ${utils.toFixedPlaces(duration, 2)}ms`);
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
    line1: 'InfoAddress',
    city: 'InfoCity',
    zip_code: 'InfoZipcode',
    persona_id: 'Misc'
}

const formatDateObject = (date) => {
    //let dt = new Date(date);
    const parts = date.split('-');
    return {
        Year: parts[0],
        Month: parts[1],
        Day: parts[2]
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
    order.LicenseIssueDate = formatDateObject(data.issue_date);
    order.LicenseExpiryDate = formatDateObject(data.expiration_date);
    logger.silly(order);
    return {
        Order: order
    };
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
        if (v) {
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

    // const id = utils.flattenObject2(JSON.parse(await utils.fileRead(__dirname + '/tmp/id-cisco.json', 'utf-8')));
    // //const id = utils.flattenObject2(JSON.parse(await utils.fileRead(__dirname + '/tmp/id.json', 'utf-8')));
    // let data = await orderInteractive(id);
    // if (data) {
    //     data = extractData(data);
    //     if (data) {

    //         data = extractResult(data);
    //         console.log(data);
    //     }
    // } else {}
})();