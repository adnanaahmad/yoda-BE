'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').logger;
const convert = require('xml-js');
const prettyData = require('pretty-data');
const soapRequest = require('easy-soap-request');

const SCRIPT_INFO = utils.getFileInfo(__filename);

logger.info(SCRIPT_INFO);

//const  url = 'https://adrconnect.mvrs.com/adrconnect/adrconnectwebservice.svc?singlewsdl';


const xml2 = `
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ndf="https://graphical.weather.gov/xml/DWMLgen/wsdl/ndfdXML.wsdl">
    <soapenv:Header/>
    <soapenv:Body>
    <ns2:OrderInteractive xmlns:ns2="http://adrconnect.mvrs.com/adrconnect/2013/04/" xmlns:ns3="http://schemas.microsoft.com/2003/10/Serialization/">            
    <ns2:inCommunications>&lt;Communications&gt;%COMM%
    &lt;DeviceID format="encoded"&gt;&lt;/DeviceID&gt;&lt;ReportTypes&gt;&lt;Type&gt;XML2.03&lt;/Type&gt;&lt;/ReportTypes&gt;&lt;/Communications&gt;
    </ns2:inCommunications>
    <ns2:inOrder>
            <ns2:OrderXml>&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;&lt;Order&gt;
&lt;License&gt;GOODLICENSE&lt;/License&gt;
&lt;State&gt;
&lt;Abbrev&gt;GA&lt;/Abbrev&gt;
&lt;/State&gt;
&lt;FirstName&gt;ANNET&lt;/FirstName&gt;
&lt;LastName&gt;CATERO&lt;/LastName&gt;
&lt;DOB&gt;
&lt;Year&gt;1911&lt;/Year&gt;
&lt;Month&gt;10&lt;/Month&gt;
&lt;Day&gt;1&lt;/Day&gt;
&lt;/DOB&gt;
&lt;Handling&gt;OL&lt;/Handling&gt;
&lt;Misc&gt;CUST01PERSONA03GUID&lt;/Misc&gt;
&lt;Billing&gt;CUST01PERSONA03GUID&lt;/Billing&gt;
&lt;ProductID&gt;LV&lt;/ProductID&gt;
&lt;Purpose&gt;AA&lt;/Purpose&gt;
&lt;Subtype&gt;ST&lt;/Subtype&gt;
&lt;DocumentType&gt;License&lt;/DocumentType&gt;
&lt;Address1&gt;8142 OLD SUNRIDGE DR&lt;/Address1&gt;
&lt;InfoCity&gt;ELLABELL&lt;/InfoCity&gt;
&lt;InfoZipcode&gt;31308&lt;/InfoZipcode&gt;
&lt;LicenseExpireDate&gt;
&lt;Year&gt;2006&lt;/Year&gt;
&lt;Month&gt;1&lt;/Month&gt;
&lt;Day&gt;1&lt;/Day&gt;
&lt;/LicenseExpireDate&gt;
&lt;/Order&gt;</ns2:OrderXml>
        </ns2:inOrder>
    </ns2:OrderInteractive>
    </soapenv:Body>
     </soapenv:Envelope>    
`;


(async () => {
    //await loadParams();
    const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc';
    const sampleHeaders = {
        'user-agent': 'Fortifid',
        'Content-Type': 'text/xml;charset=UTF-8',
        'soapAction': 'http://adrconnect.mvrs.com/adrconnect/2013/04/IAdrConnectWebService/OrderInteractive',
    };

    let comm = {
        Account: 'K1625',
        UserID: '01',
        Password: 'u9sm8uhv!A'
    };

    let options = {
        spaces: 3,
        compact: true,
        fullTagEmptyElement: true,
        ignoreDeclaration: false,
        ignoreInstruction: false,
        ignoreAttributes: false
    };

    let result1 = utils.escapeHTML(convert.js2xml(comm, options));
    let data = xml2.replace('%COMM%', result1)

    try {
        const {
            response
        } = await soapRequest({
            url: url,
            headers: sampleHeaders,
            xml: data,
            timeout: 180000
        }); // Optional timeout parameter(milliseconds)
        const {
            headers,
            body,
            statusCode
        } = response;
        //console.log(headers);
        let index = body.indexOf('<Data>&lt;![CDATA[');
        if (index > -1) {
            let end = body.indexOf(']]&gt;</Data>', index);
            let data = body.substr(index + 18, end - index - 18);
            //console.log(data);
            data = utils.unescapeHTML(data);
            //let result1 = convert.xml2json(data, {compact: true, spaces: 4})
            console.log(data);
            //let obj = JSON.parse(utils.unescapeHTML(data));
            //console.log(obj)
            //let result = obj['s:Envelope']['s:Body']['OrderInteractiveResponse']['OrderInteractiveResult']; 
            // if(result) {
            //     console.log(result)
            // }
        }

        //console.log(statusCode);
        // let result1 = convert.xml2json(body, {compact: true, spaces: 4})
        // let obj = JSON.parse(result1);
        // let result = obj['s:Envelope']['s:Body']['OrderInteractiveResponse']['OrderInteractiveResult']; 
        // if(result) {
        //     console.log(result.Report)
        // }
    } catch (error) {
        console.log(error);
    }





})();