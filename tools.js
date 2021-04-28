'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const cache = require('./cache');
const awsClient = require('./aws-client');
const redis = require("redis");

const createParams = () => {
    let orig = require('./data/paramList.json');
    const fields = {};

    orig.forEach(field => {
        let name = field.Name.replace(/\//g, '.').substr(1);
        utils.parseDotNotation(name, field.Value, fields);
    });

    utils.fileWrite('./data/didservice.json', JSON.stringify(fields, null, 2));
}

const createParamsScript = async (path, output) => {
    let file = `${__dirname}${path}.json`;

    if(typeof(output) === 'undefined') {
        output = `${__dirname}/scripts/${path.split('/').pop()}.sh`;
    }
    
    const lines = [];
    lines.push('#!/bin/bash\n');
    //workaround for a weird aws cli "feature"
    lines.push('aws configure set cli_follow_urlparam false\n');

    

    const PARAMS = utils.loadJSON(file);
    if (!PARAMS) {
        console.log(`Unable to load  ${file}`)
    } else {
        Object.keys(PARAMS).forEach(key => {
            let type = "String";
            let actualKey = key;

            if (key.startsWith('*')) {
                actualKey = key.substr(1);
                PARAMS[actualKey] = PARAMS[key];
                delete PARAMS[key];
                type = "SecureString";
            }

            let line = `aws ssm put-parameter --name "${path}/${actualKey}" --value "${PARAMS[actualKey]}" --type "${type}"`
            lines.push(line);
            lines.push('sleep 0.1\n');
        });

        let data = lines.join('\n');

        if(data && output) {
            await utils.fileWrite(output, data);
        }
    }
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
    //console.log(ms('1y'));

    //await  addCustomer('D784DE76-A1F9-425D-BD57-2565411AA5A3');
    //await createParamsScript('/config/equifax/synthetic-id', `${__dirname}/scripts/synthetic-id.sh`);
    await createParamsScript('/config/veriff/doc');
    console.log('Done');
})();