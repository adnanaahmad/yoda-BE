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

const getKey = (type, id)=> {
    return `${type}:${id}`;
}

//DAX
//ttl

const setP = async (_type, key, value, expiration) => {
    try {
        _type = _type || '_shared_';

        const data = {
            type: _type,
            key,
            value,
            created: Math.round(Date.now() / 1000),
            status: 1
        }

        const type = typeof(expiration); 
        if(type === 'string') {
            expiration = ms(expiration);
        }

        if(expiration > 0 ) {
            data.expiresAt =  data.created + expiration;
        }

        await awsClient.putDDBItem('CACHE', data);

    } catch (error) {
        console.log(error);
    }
}

const getP = async (_type, key) => {
    try {
        _type = _type || '_shared_';
        let result = await awsClient.getDDBItem('CACHE', { type: _type, key});

        if (result && result.Item) {
            let data =  result.Item
            if(data && data.value) {
                return data.value;
            }
        }
    } catch (error) {
        console.log(error);
    }
}

const get = async (_type, key) => {
    let value;
    try {
        _type = _type || '_shared_';
        key = getKey(_type, key);
        value = await getAsync(key);
        if(utils.isJSON(value)) {
            value = JSON.parse(value);
        }
    } catch (error) {
        console.log(error);
    }
    return value;
}

const set = async (_type, key, value, expiration) => {
    try {
        _type = _type || '_shared_';
        key = getKey(_type, key);
        
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
            //expiration = expiration;
            client.expire(key, expiration);
        }
    } catch (error) {
        console.log(error);
    }
}

(async () => {
    client.on("error", (error) => {
        console.error(error);
    });


    // const data = {
    //     name: 'Cisco',
    //     wife: 'MJ',
    //     now: Date.now()
    // }

    //  await set('test', 'bleah', data, 30);

    // console.log(await get('test', 'bleah'));

})();

module.exports = {
    get,
    set,
    getP,
    setP,
    getKey
}