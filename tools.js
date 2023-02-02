'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const cache = require('./cache');
const awsClient = require('./aws-client');
const redis = require("redis");
const fsS = require('fs');
const fs = require('fs/promises');

const csvToJson = require('convert-csv-to-json');
const { lookup } = require('dns');



const createParams = () => {
    let orig = require(`${__dirname}/data/param-list.json`);
    const fields = {};

    orig.forEach(field => {
        let name = field.Name.replace(/\//g, '.').substr(1);
        utils.parseDotNotation(name, field.Value, fields);
    });

    utils.fileWrite(`${__dirname}/data/didservice.json`, JSON.stringify(fields, null, 2));
}

const createLocalParameters = async (path)=> {
    let data = await awsClient.getParametersByPath(path);
    try {
        const fields = {};

        data.forEach(field => {
            let name = field.Name.replace(/\//g, '.').substr(1);
    
            utils.parseDotNotation(name, field.Value, fields, field.Type === 'SecureString');
        });
        
        const parts = path.split('/').filter(Boolean);
        const prefix = `${__dirname}/${parts[0]}/${parts[1]}/`;
        if(!fsS.existsSync(prefix)) {
            fsS.mkdirSync(prefix);
        }

        const top = fields[parts[0]][parts[1]];
        
        Object.keys(top).forEach(async(key)=> {
            const file = `${prefix}${key}.json`;
            await utils.fileWrite( file, JSON.stringify(top[key], null, 2));
        })
        //console.log(top);
    
        //console.log(JSON.stringify(fields, null, 2));
    } catch (error) {
        console.log(error);
    }
}

const createParamsScript = async (path, output, overwrite = true) => {
const funcs =`put() {
    echo "Inserting $1..."
    aws ssm put-parameter --name "$1" --value "$2" --type "$3" ${overwrite ? "$EXTRA" : ""}
    sleep 0.2
}
`    
    let file = `${__dirname}${path}.json`;

    if(typeof(output) === 'undefined') {
        output = `${__dirname}/tmp/${path.split('/').pop()}.sh`;
    }
    
    const lines = [];
    lines.push('#!/bin/bash\n');

    if(overwrite) {
        lines.push(`EXTRA=--overwrite\n`);
    }

    lines.push(funcs);

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
            let value = PARAMS[actualKey];

            if(typeof(value) === "object") {
                value = JSON.stringify(value).replace(/\"/g, '\\"');
                console.log(value);
            }
            let line = `put "${path}/${actualKey}" "${value}" "${type}"`
            lines.push(line);
        });
        
        lines.push('');
        let data = lines.join('\n');

        if(data && output) {

            await utils.fileWrite(output, data);
            console.log(`Created file: ${output}`);
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

const csvToJSON = async (file, service, delimiter = "\t")=> {
    if(!file || !service) {
        return;
    }
    try {

        let LOOKUP = {};
        let json = csvToJson.fieldDelimiter(delimiter).getJsonFromCsv(`${__dirname}/tmp/${file}`);
        for (let index = 0; index < json.length; index++) {
            const item = json[index];
            if(item.FortifIDCoTMember === service) {
                LOOKUP[item.DataProviderReasonCode] = { code: item.FortifIDDetailCode, message: item.DefintionofFortifIDDetailCode || item.DefinitionofProviderReasonCode }
            }
        }
        await fs.writeFile(`${__dirname}/tmp/${service}.json`, JSON.stringify(LOOKUP));
    } catch (error) {
        console.log(error)
    }
}

(async () => {
    //console.log(ms('1y'));

    //await  addCustomer('D784DE76-A1F9-425D-BD57-2565411AA5A3');
    // await createParamsScript('/config/equifax/synthetic-id');
    // await createParamsScript('/config/experian/experian');
    //await createParamsScript('/config/twilio/mfa');
    // await createParamsScript('/config/veriff/doc');

    //await createLocalParameters('/config/sambasafety/');
    //await createLocalParameters('/config/equifax/');
    //await createParamsScript('/config/sambasafety/sambasafety')
    await csvToJSON("ci.tsv", "Plaid");
    // /await createParamsScript('/config/equifax/synthetic-id-prod');
    console.log('Done');
    
})();