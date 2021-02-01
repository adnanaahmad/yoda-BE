'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger('service-ss');
const convert = require('xml-js');
const prettyData = require('pretty-data');
const soapRequest = require('./soap');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);
const TEMPLATES = {};

const js2Options = {
    spaces: 3,
    compact: true,
    fullTagEmptyElement: true,
    ignoreDeclaration: false,
    ignoreInstruction: false,
    ignoreAttributes: false
};

//TEST!
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


const loadTemplates = async () => {
    logger.debug('Loading templates...');
    const start = utils.time();
    await utils.loadTemplates('./templates/samba/', TEMPLATES);
    const duration = utils.time() - start;
    logger.debug(`Templates loaded. ${utils.toFixedPlaces(duration, 2)}ms`);
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
        logger.silly(xml);
        return xml;
    } catch (error) {
        logger.error(error);
    }
}

const callSoapFunction = async (name, data) => {
    logger.debug(`callSoapFunction [${name}] start...`);

    const xml = createSoapEnvelope(name, data);
    if (!xml) {
        return;
    }
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
        logger.debug(`callSoapFunction [${name}] done ${utils.toFixedPlaces(duration, 2)}ms`);

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

const getOrder = () => {
    const order = {
        Order: {
            License: 'W2020987693401',
            State: {
                Abbrev: 'WI'
            },
            FirstName: 'ANNET',
            LastName: 'CATERO',
            DOB: {
                Year: 1911,
                Month: 10,
                Day: 1
            },
            Handling: 'DL',
            Misc: 'CUST01PERSONA03GUID',
            Billing: 'CUST01PERSONA03GUID',
            ProductID: 'LV',
            Purpose: 'AA',
            Subtype: 'ST',
            DocumentType: 'License',
            Address1: '8142 OLD SUNRIDGE DR',
            InfoCity: 'ELLABELL',
            InfoZipcode: '31308',
            LicenseExpireDate: {
                Year: 2006,
                Month: 1,
                Day: 1
            }
        }
    };
    return order;
}

const orderInteractive = async () => {
    const data = {
        inCommunications: convert.js2xml(getCommunications(), js2Options),
        inOrder: {
            OrderXml: convert.js2xml(getOrder(), js2Options)
        }
    }

    const body = await callSoapFunction('OrderInteractive', data);

    try {
        if (!body) {
            return;
        }

        logger.silly(body);
        let index = body.indexOf('<Data>&lt;![CDATA[');
        if (index > -1) {
            let end = body.indexOf(']]&gt;</Data>', index);
            let data = body.substr(index + 18, end - index - 18);
            data = utils.unescapeHTML(data);
            console.log(data);
        }
    } catch (error) {
        logger.error(error);
    }
}

const sendOrders = async () => {
    const data = {
        inCommunication: convert.js2xml(getCommunications(), js2Options),
        inOrders: [{
            OrderXml: [
                convert.js2xml(getOrder(), js2Options),
                convert.js2xml(getOrder(), js2Options)
            ],
        }]
    }

    const body = await callSoapFunction('SendOrders', data);

    try {
        if (!body) {
            return;
        }

        let x = prettyData.pd.xml(body);
        logger.silly(x);

        // let index = body.indexOf('<Data>&lt;![CDATA[');
        // if (index > -1) {
        //     let end = body.indexOf(']]&gt;</Data>', index);
        //     let data = body.substr(index + 18, end - index - 18);
        //     data = utils.unescapeHTML(data);
        //     console.log(data);
        // }
    } catch (error) {
        logger.error(error);
    }
}

const receiveRecords = async () => {

    const data = {
        inCommunications: convert.js2xml(getCommunications(), js2Options)
    }

    const body = await callSoapFunction('ReceiveRecords', data);

    try {
        if (!body) {
            return;
        }

        let x = prettyData.pd.xml(body);
        logger.silly(x);

        // let index = body.indexOf('<Data>&lt;![CDATA[');
        // if (index > -1) {
        //     let end = body.indexOf(']]&gt;</Data>', index);
        //     let data = body.substr(index + 18, end - index - 18);
        //     data = utils.unescapeHTML(data);
        //     console.log(data);
        // }
    } catch (error) {
        logger.error(error);
    }

}

(async () => {
    //await loadParams();
    //await changePassword();
    //await orderInteractive();
    //await sendOrders();
    await receiveRecords();
})();