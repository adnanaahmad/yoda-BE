'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').logger;
const awsClient = require('./aws-client');
//const soap = require('soap');
const soap = require('strong-soap').soap;
const soapRequest = require('easy-soap-request');
const fs = require('fs');
const convert = require('xml-js');
const prettyData = require('pretty-data');

const SCRIPT_INFO = utils.getFileInfo(__filename);

logger.info(SCRIPT_INFO);

//https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl
//AdrConnectWebService
//const  url = 'https://adrconnect.mvrs.com/adrconnect/adrconnectwebservice.svc?singlewsdl';
const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl';
//const  url ='https://demo.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl';

const inComm = `<Communications><Host>Both</Host><Account>K1625</Account><UserID>"01"</UserID><Password>Famouse_03</Password><DeviceID format="encoded"></DeviceID><ReportTypes><Type>XML2.03</Type></ReportTypes></Communications>`
const inOrderTemplate = `
<?xml version="1.0" encoding="utf-8"? standalone="yes">
<Order>
<License>GOODLICENSE</License>
<State>
<Abbrev>GA</Abbrev>
</State>
<FirstName>ANNET</FirstName>
<LastName>CATERO</LastName>
<DOB>
<Year>1911</Year>
<Month>10</Month&gt
<Day>1</Day>
</DOB>
<Handling>OL</Handling>
<Misc>CUST01PERSONA03GUID</Misc>
<Billing>CUST01PERSONA03GUID</Billing>
<ProductID>LV</ProductID>
<Purpose>AA</Purpose>
<Subtype>ST</Subtype>
<DocumentType>License</DocumentType>
<Address1>8142 OLD SUNRIDGE DR</Address1>
<InfoCity>ELLABELL</InfoCity>
<InfoZipcode>31308</InfoZipcode>
<LicenseExpireDate>
<Year>2006</Year>
<Month>1</Month>
<Day>1</Day>
</LicenseExpireDate>
</Order>
`;

let inComm2 = `
&lt;Communications&gt;&lt;Host&gt;Both&lt;/Host&gt;&lt;Account&gt;K1625&lt;/Account&gt;&lt;UserID&gt;"01"&lt;/UserID&gt;&lt;Password&gt;Famouse_03&lt;/Password&gt;&lt;DeviceID format="encoded"&gt;&lt;/DeviceID&gt;&lt;ReportTypes&gt;&lt;Type&gt;XML2.03&lt;/Type&gt;&lt;/ReportTypes&gt;&lt;/Communications&gt;
`;

let inOrderTemplate2 =  `
&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;&lt;Order&gt;
&lt;License&gt;GOODLICENSE&lt;/License&gt;
&lt;State&gt;
&lt;Abbrev&gt;GA&lt;/Abbrev&gt;
&lt;/State&gt;
&lt;FirstName&gt;ANNET&lt;/FirstName&gt;
&lt;LastName&gt;CATERO&lt;/LastName&gt;
&lt;DOB&gt;
&lt;Year&gt;1911&lt;/Year&gt;
&lt;Month&gt;10&lt;/Month&gt
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
&lt;/Order&gt;
`;

const xml2 = `
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ndf="https://graphical.weather.gov/xml/DWMLgen/wsdl/ndfdXML.wsdl">
    <soapenv:Header/>
    <soapenv:Body>
    <ns2:OrderInteractive xmlns:ns2="http://adrconnect.mvrs.com/adrconnect/2013/04/" xmlns:ns3="http://schemas.microsoft.com/2003/10/Serialization/">            
    <ns2:inCommunications>
&lt;Communications&gt;
&lt;Host&gt;Both&lt;/Host&gt;
&lt;Account&gt;K1625&lt;/Account&gt;
&lt;UserID&gt;01&lt;/UserID&gt;
&lt;Password&gt;u9sm8uhv!A&lt;/Password&gt;
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

const reqTest = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"> 
<SOAP-ENV:Header/>
<SOAP-ENV:Body>
    <ns2:OrderInteractive xmlns:ns2="http://adrconnect.mvrs.com/adrconnect/2013/04/" xmlns:ns3="http://schemas.microsoft.com/2003/10/Serialization/">            
    <ns2:inCommunications>
&lt;Communications&gt;
&lt;Host&gt;Both&lt;/Host&gt;
&lt;Account&gt;K1625&lt;/Account&gt;
&lt;UserID&gt;"01"&lt;/UserID&gt;
&lt;Password&gt;u9sm8uhv!A&lt;/Password&gt;
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
&lt;Month&gt;10&lt;/Month&gt
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
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>
`;


let soapClient;
let soapFunctions;

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

const callSoapFunction = (name, args)=> {

    let func = soapFunctions[name]; 
    if(func) {
        func(args, (err, result, envelope, soapHeader) => {
            if (err) {
                console.log('ERROR!', err.body);
                return;
            }

            console.log('Response Envelope: \n' + prettyData.pd.xml(envelope));
            console.log(JSON.stringify(result));
            console.log(prettyData.pd.xml(soapClient.lastRequest));
            //let x = prettyData.xml(soapClient.lastRequest);
            //console.log('last request: ', x);
        });
    } else {
        logger.error(`Function ${name} not found.`);
    }

}

const changePassword = () => {
    let args = {
        inAccountID: 'K1625',
        inUserId: '01',
        inCurrentPassword: 'u9sm8uhv!A',
        inNewPassword: 'u9sm8uhv!AB'
    };
    var result1 = convert.js2xml(xml);
    callSoapFunction('ChangePassword', args);
}

//2 minute timeout
const orderInteractive =()=> {
    let inCommunications = inComm;
    
    let inOrder = inOrderTemplate;

    let args = {
        'ns1:InCommunications': inComm,
        'ns1:InOrder': {'ns1:OrderXml': inOrderTemplate},
    };

    callSoapFunction('OrderInteractive', args);
}


(async () => {
    //await loadParams();

    const start = utils.time();

    // const url = 'https://graphical.weather.gov/xml/SOAP_server/ndfdXMLserver.php';
    // const sampleHeaders = {
    //   'user-agent': 'sampleTest',
    //   'Content-Type': 'text/xml;charset=UTF-8',
    //   'soapAction': 'https://graphical.weather.gov/xml/DWMLgen/wsdl/ndfdXML.wsdl#LatLonListZipCode',
    // };

//     let xml = `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ndf="https://graphical.weather.gov/xml/DWMLgen/wsdl/ndfdXML.wsdl">
//     <soapenv:Header/>
//     <soapenv:Body>
//        <ndf:LatLonListZipCode soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
//           <zipCodeList xsi:type="dwml:zipCodeListType" xmlns:dwml="https://graphical.weather.gov/xml/DWMLgen/schema/DWML.xsd">75001</zipCodeList>
//        </ndf:LatLonListZipCode>
//     </soapenv:Body>
//  </soapenv:Envelope>`;

//     const url = 'https://graphical.weather.gov/xml/SOAP_server/ndfdXMLserver.php';
//     const sampleHeaders = {
//       'user-agent': 'sampleTest',
//       'Content-Type': 'text/xml;charset=UTF-8',
//       'soapAction': 'https://graphical.weather.gov/xml/DWMLgen/wsdl/ndfdXML.wsdl#LatLonListZipCode',
//     };

    const url = 'https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc';
    const sampleHeaders = {
      'user-agent': 'Fortifid',
      'Content-Type': 'text/xml;charset=UTF-8',
      'soapAction': 'http://adrconnect.mvrs.com/adrconnect/2013/04/IAdrConnectWebService/OrderInteractive',
    };
    
    // try {
    //     const { response } = await soapRequest({ url: url, headers: sampleHeaders, xml: xml2, timeout: 180000 }); // Optional timeout parameter(milliseconds)
    //     const { headers, body, statusCode } = response;
    //    console.log(headers);
    //    console.log(body);
    //    console.log(statusCode);
    // } catch (error) {
    //     console.log(error);        
    // }
    
    let args = {
        inAccountID: 'K1625',
        inUserId: '01',
        inCurrentPassword: 'u9sm8uhv!A',
        inNewPassword: 'u9sm8uhv!AB'
    };
    var result1 = convert.js2xml(args);
    console.log('yo', result1);


    // var result1 = convert.xml2json(xml, {compact: true, spaces: 4})
    // console.log(result1);
    var wsdlOptions = {
        "overrideRootElement": {
          //"namespace": "ns2",
          "xmlnsAttributes": [{
            "name": "xmlns:ns1",
            "value": "http://adrconnect.mvrs.com/adrconnect/2013/04/"
          },
        //   {
        //     "name": "xmlns:ns3",
        //     "value": "http://schemas.microsoft.com/2003/10/Serialization/"
        //   },
        ]
        }
      };

    // soap.createClient(url, {}, (err, client) => {
    //     if (err) {
    //         console.log(err);
    //         return;
    //     }

    //     //client.wsdl.definitions.xmlns.ns2 = 'http://adrconnect.mvrs.com/adrconnect/2013/04/'
    //     //client.wsdl.xmlnsInEnvelope = client.wsdl._xmlnsMap()

    //     const duration = utils.time() - start;
    //     console.log(duration);
    //     soapClient = client;
    //     soapFunctions = soapClient.AdrConnectWebService.BasicHttpBinding_IAdrConnectWebService;
    //     console.log(client.describe());
    //     //console.log(client);
    //     //console.log(soapClient.wsdl.definitions.descriptions.types);
    //     changePassword();
    //     orderInteractive();
    // });

    try {
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
        //console.log(body);
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

