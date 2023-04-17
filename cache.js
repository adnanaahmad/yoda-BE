'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const awsClient = require('./aws-client');

const redis = require("redis");
const NodeCache = require("node-cache");
const crypt = require('./crypt');

const ms = require('ms');
const {
    promisify
} = require('util');

let redisClient;
let redisUrl;

let setAsync; 
let getAsync;
let params;

const DEFAULT_EXPIRATION_MS = ms('1w');
const DEFAULT_EXPIRATION = Math.round(DEFAULT_EXPIRATION_MS / 1000);

const DEFAULT_MEM_EXPIRATION = Math.round(ms('3m') / 1000);

const MEMORY_CACHE = new NodeCache({
    stdTTL: DEFAULT_MEM_EXPIRATION,
    checkperiod: 120,
    useClones: false
});
//TODO
//const CACHE = {};

//This function concatenates the type and id inputs into a single string separated by a colon.
const getKey = (type, id) => {
    return `${type}:${id}`;
}
// This function removes any keys that start with an underscore or have an undefined value from the input object.
const sanitize = (data) => {
    if (typeof (data) === 'object') {
        Object.keys(data).forEach(key => {
            let item = data[key];
            if (key.startsWith('_') || item === undefined) {
                delete data[key];
            }
        })
    }
}

//DAX
//ttl
//TODO! Must be careful with the extra names!!!!
// This function stores data in an AWS DynamoDB table after performing various checks and transformations on the input data.
const setP = async (type, key, value, expiration, flat) => {
    // if(!_type || !key || !value) {
    //     return;
    // }

    try {
        type = type || '_shared_';

        const data = {
            _type: type,
            _key: key,
            _created: Math.round(Date.now() / 1000),
            _status: 1
        }

        if(typeof(value.pii) !== 'undefined') {
            value.pii = crypt.encrypt(value.pii);
        }

        const dataType = typeof (expiration);
        if (dataType === 'string') {
            expiration = Math.round(ms(expiration) / 1000);
        }

        if (expiration > 0) {
            data._expiresAt = data._created + expiration;
        }

        sanitize(value);

        if (flat) {
            Object.assign(data, value);
        } else {
            data._value = value;
        }

        await awsClient.putDDBItem('CACHE_01', data);
        return data;
    } catch (error) {
        console.log(error);
    }
}
// This function retrieves data from an AWS DynamoDB table based on the input type and key, and returns the retrieved data, or a default value if no data is found.
const getP = async (type, key, defaultValue) => {
    let value;

    try {
        type = type || '_shared_';
        let result = await awsClient.getDDBItem('CACHE_01', {
            _type: type,
            _key: key
        });

        if (result && result.Item) {
            let data = result.Item
            if (data && data._value) {
                value = data._value;
            } else {
                value = data;
            }
            // if(value && value.pii) {
            //     value.pii = crypt.decrypt(value.pii);
            // }
        }
    } catch (error) {
        console.log(error);
    }

    if (typeof (value) === 'undefined') {
        value = defaultValue;
    }

    return value;
}
// This function updates an existing record in an AWS DynamoDB table based on the input type and key, and modifies the record's _modified and _expiresAt fields, as well as its value or properties, depending on the input data.
const updateP = async (type, key, value, expiration, flat) => {
    // if(!_type || !key || !value) {
    //     return;
    // }

    try {
        type = type || '_shared_';

        key = {
            _type: type,
            _key: key
        }

        const data = {
            _modified: Math.round(Date.now() / 1000),
        }

        let dataType = typeof (expiration);

        if (dataType === 'string') {
            expiration = Math.round(ms(expiration) / 1000);
            dataType = typeof (expiration);
        }

        if (dataType === 'number' && expiration > 0) {
            data._expiresAt = data._modified + expiration;
        }

        sanitize(value);

        if (flat) {
            Object.assign(data, value);
        } else {
            data._value = value;
        }

        await awsClient.updateDynamic('CACHE_01', key, data);
        return data;
    } catch (error) {
        console.log(error);
    }
}
// This function decrements the numeric value of a field in an AWS DynamoDB table based on the input type, key, and field, and returns the updated value.
const decrementP = async (type, key, field) => {
    // if(!_type || !key || !value) {
    //     return;
    // }

    try {
        type = type || '_shared_';

        let result = await awsClient.decrementDDBItem('CACHE_01', {
            _type: type,
            _key: key
        }, field);

        if (result && result.Attributes) {
            return result.Attributes.value;
        }
    } catch (error) {
        console.log(error);
    }
}

// This function stores a value in a Redis database based on the input type, key, and value, and sets an expiration time for the stored value if an expiration parameter is provided.
const set = async (type, key, value, expiration) => {
    try {
        type = type || '_shared_';
        key = getKey(type, key);

        if (typeof (value) === 'object') {
            value = JSON.stringify(value);
        }

        await setAsync(key, value);
        const dataType = typeof (expiration);
        if (dataType === 'undefined') {
            expiration = DEFAULT_EXPIRATION;
        } else if (dataType === 'string') {
            expiration = ms(expiration) / 1000;
        }

        if (expiration > 0) {
            //expiration = expiration;
            redisClient.expire(key, expiration);
        }
    } catch (error) {
        console.log(error);
    }
}
// This function is getting the value of a key from Redis cache based on a type and key, and returning a default value if the key does not exist.
const get = async (type, key, defaultValue) => {
    let value;
    try {
        type = type || '_shared_';
        key = getKey(type, key);
        value = await getAsync(key);
        if (utils.isJSON(value)) {
            value = JSON.parse(value);
        }
    } catch (error) {
        console.log(error);
    }

    if (typeof (value) === 'undefined') {
        value = defaultValue;
    }

    return value;
}
// This function is setting a value in a memory cache with a specified expiration time.
const setM = (type, key, value, expiration) => {
    try {
        type = type || '_shared_';
        key = getKey(type, key);

        const dataType = typeof (expiration);
        if (dataType === 'undefined') {
            expiration = DEFAULT_EXPIRATION;
        } else if (dataType === 'string') {
            expiration = Math.round(ms(expiration) / 1000);
        }

        return MEMORY_CACHE.set(key, value, expiration);

    } catch (error) {
        console.log(error);
    }
}
// This function retrieves a value from an in-memory cache and returns it, or returns a default value if the key is not found in the cache.
const getM = (type, key, defaultValue) => {
    let value;
    try {
        type = type || '_shared_';
        key = getKey(type, key);
        value = MEMORY_CACHE.get(key);
    } catch (error) {
        console.log(error);
    }

    if (typeof (value) === 'undefined') {
        value = defaultValue;
    }

    return value;
}
// This function initializes a Redis client by getting the Redis URL from an AWS parameter store, setting up the client, and binding the set and get methods to setAsync and getAsync, respectively.
const initRedis = async()=> {
    redisUrl = await awsClient.getParameter('/config/shared/redis/url');

    if(typeof(redisUrl) !=='undefined') {
        redisClient =  redis.createClient(redisUrl);
        redisClient.on("error", (error) => {
            console.error(error);
        });
        
        setAsync = promisify(redisClient.set).bind(redisClient);
        getAsync = promisify(redisClient.get).bind(redisClient);
    }
}
// The test function sets up a sample data object, and then performs some Redis and DAX operations on it, including setting, getting, and updating data, as well as logging the duration of each operation
const test = async () => {
    const data = {
        name: 'Cisco',
        wife: 'MJ',
        now: Date.now(),
        blank: undefined
    }

    console.log(data);

    const redis = async()=> {
        console.log('redis');
        let start = utils.time();
        await set('test', `bleah-test`, data, '1h');
        console.log(await get('test', 'bleah-test'));
        let duration = utils.time() - start;
        console.log(duration);
    }

    const dax = async()=> {
        console.log('DAX');
        const start = utils.time();
        await setP('test', `bleah-test`, data, '1h', true);
        let results = await getP('test', `bleah-test`);
        console.log(results);
        await updateP('test', `bleah-test`, {name : 'The Cisco'}, '1h', true);

        results = await getP('test', `bleah-test`);
        console.log(results);

        //await updateP('test', `bleah-test`, data, '1h');

        //console.log(await getP('test', 'bleah-test'));
        // let count = 0;
        // for (let index = 0; index < 100; index++) {
        //     //let id = `bleah-`(index + ''.padStart(6, '0'));
        //     //let results = await setP('test', `bleah-${index}`, data, 3600);
        //     //let results = await getP('test', `bleah-${index}`);
        //     let results = await getP('test', `bleah-test`);
        //     if (results) {
        //         count++;
        //     }
        // }
        const duration = utils.time() - start;
        console.log(duration);
    }
    
    await dax();
    //await redis()
}
//This function initializes a Redis client and calls the test() function to test Redis and DAX caching.
(async () => {
    await initRedis();

    //test();
})();

module.exports = {
    getKey,
    set,
    get,
    setP,
    getP,
    updateP,
    decrementP,
    setM,
    getM,
    crypt ,
    redis,
    redisClient,
    getAsync,
    setAsync
}