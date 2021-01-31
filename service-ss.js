'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').logger;
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

//const  url = 'https://adrconnect.mvrs.com/adrconnect/adrconnectwebservice.svc?singlewsdl';
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
            console.log(results);
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

const callSoapFunction = async (name, data) => {
    console.log(`callSoapFunction start [${name}]`);
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
            xml: data,
            timeout: 180000
        });
        
        const {
            body,
            statusCode
        } = response;
        //console.log(statusCode);
        const duration = utils.time() - start;
        logger.debug(`Soap request done. ${utils.toFixedPlaces(duration, 2)}ms`);

        return body;
    } catch (error) {
        console.log(error);
    }
}

const changePassword = async ()=> {
    let args = {
        'ns2:inAccountID': 'K1625',
        'ns2:inUserId': '01',
        'ns2:inCurrentPassword': 'u9sm8uhv!A',
        'ns2:inNewPassword': 'u9sm8uhv!AB'
    };
    const replacements = {
        '%PASS%': convert.js2xml(args, js2Options)
    }

    const data = utils.parseTemplate(TEMPLATES['password'], replacements);
    console.log(data);
    const body = await callSoapFunction('ChangePassword', data);
    let x = prettyData.pd.xml(body);
    console.log(x);
}

const orderInteractive = async () => {
    let comm = {
        Communications: {
            Account: 'K1625',
            UserID: '01',
            Password: 'u9sm8uhv!A',
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

    let order = {
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

    const replacements = {
        '%COMM%': utils.escapeHTML(convert.js2xml(comm, js2Options)),
        '%ORDER%': utils.escapeHTML(convert.js2xml(order, js2Options))
    }

    const data = utils.parseTemplate(TEMPLATES['order'], replacements);

    const body = await callSoapFunction('OrderInteractive', data);

    try {
        if (!body) {
            return;
        }
        console.log(body);
        let index = body.indexOf('<Data>&lt;![CDATA[');
        if (index > -1) {
            let end = body.indexOf(']]&gt;</Data>', index);
            let data = body.substr(index + 18, end - index - 18);
            data = utils.unescapeHTML(data);
            console.log(data);
        }
    } catch (error) {
        console.log(error);
    }
}

(async () => {
    //await loadParams();
    await loadTemplates();

    await orderInteractive();
    //await changePassword();
    //SendOrders
    //ReceiveRecords
    //ChangePassword

})();