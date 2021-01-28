'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').logger;
const awsClient = require('./aws-client');
const soap = require('soap');

SCRIPT_INFO = utils.getFileInfo(__filename); 

logger.info(SCRIPT_INFO);

//https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl
//AdrConnectWebService
//const  url = 'https://adrconnect.mvrs.com/adrconnect/adrconnectwebservice.svc?singlewsdl';
const  url ='https://demo2.mvrs.com/AdrConnect/AdrConnectWebService.svc?singleWsdl';
let args = {name: 'value'};
soap.createClient(url, (err, client)=> {
    if(err) {
        console.log(err);
        return;
    }

    console.log(client);
    //console.log(JSON.stringify(client, null, 2));
    // client.MyFunction(args, (err, result)=> {
    //     console.log(result);
    // });
});