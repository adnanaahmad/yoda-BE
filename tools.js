'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const cache = require('./cache');
const awsClient = require('./aws-client');
const redis = require("redis");

const createParams =()=> {
    let orig = require('./data/paramList.json');
    const fields = {};

    orig.forEach(field => {
        let name = field.Name.replace(/\//g, '.').substr(1);
        utils.parseDotNotation(name, field.Value, fields);
    });

    utils.fileWrite('./data/didservice.json', JSON.stringify(fields, null, 2));
}

const addCustomer = async (id) => {
    const rate_limit = {
        credits_add_per_minute: 0,
        credits_available: 100,
        credits_max: 100
    }
    await cache.setP('rate_limit', id, rate_limit, '5y');
}

(async () => {
    console.log(ms('1y'));
    
    //await  addCustomer('D784DE76-A1F9-425D-BD57-2565411AA5A3');

})();