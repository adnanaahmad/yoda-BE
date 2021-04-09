'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const awsClient = require('./aws-client');

const redis = require("redis");

const ms = require('ms');
const { promisify } = require('util');

const client = redis.createClient(process.env.REDIS_URL);

const setAsync = promisify(client.set).bind(client);
const getAsync = promisify(client.get).bind(client);


const DEFAULT_EXPIRATION = ms('1w');

const set = async (key, value, expiration) => {
    try {

        if(typeof(value) === 'object') {
            value = JSON.stringify(value);
        }

        await setAsync(key, value);
        const type = typeof(expiration); 
        if(type === 'undefined') {
            expiration = DEFAULT_EXPIRATION;
        } else if(type === 'string') {
            expiration = ms(expiration);
        } 

        if(expiration > 0) {
            expiration = Math.round(expiration / 1000);
            client.expire(key, expiration);
        }
    } catch (error) {
        console.log(error);
    }
}

const setP = async (key, value, expiration) => {
    try {

        const data = {
            key: key,
            value: value,
            created: Date.now()
        }

        const type = typeof(expiration); 
        if(type === 'string') {
            expiration = ms(expiration);
        }

        if(expiration > 0) {
            data.expiresAt = data.created + expiration;
        }

        await awsClient.putDDBItem('CACHE', data);

    } catch (error) {
        console.log(error);
    }
}

const getP = async (key) => {
    try {
        let params = {
            TableName: "CACHE",
            KeyConditionExpression: "#key = :key",
            ExpressionAttributeNames: {
                "#key": "key"
            },
            ExpressionAttributeValues: {
                ":key": key
            }
        };
    
        let results = await awsClient.docQuery(params);
        if (results && results.Count > 0) {
            let data =  results.Items[0];
            if(data && data.value) {
                return data.value;
            }
        }
    } catch (error) {
        console.log(error);
    }
}

const get = async (key) => {
    let value;
    try {
        value = await getAsync(key);
        if(utils.isJSON(value)) {
            value = JSON.parse(value);
        }
    } catch (error) {
        console.log(error);
    }
    return value;
}

const getKey = (type, id)=> {
    return `${type}:${id}`;
}

(async () => {
    // const data = {
    //     name: 'Cisco',
    //     wife: 'MJ',
    //     now: Date.now()
    // }

    client.on("error", (error) => {
        console.error(error);
    });

    // await setP('bleah', data, '1h');

    // console.log(await getP('bleah'));

})();

module.exports = {
    get,
    set,
    getP,
    setP,
    getKey
}