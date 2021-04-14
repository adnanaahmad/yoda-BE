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

const redisClient = redis.createClient(process.env.REDIS_URL);

const setAsync = promisify(redisClient.set).bind(redisClient);
const getAsync = promisify(redisClient.get).bind(redisClient);

const DEFAULT_EXPIRATION_MS = ms('1w');
const DEFAULT_EXPIRATION = Math.round(DEFAULT_EXPIRATION_MS / 1000);

const MEMORY_CACHE = new NodeCache({
    stdTTL: DEFAULT_EXPIRATION,
    checkperiod: 120,
    useClones: false
});
//TODO
//const CACHE = {};

const getKey = (type, id) => {
    return `${type}:${id}`;
}

const sanitize = (value) => {
        //Sanitize!
    if (typeof (value) === 'object') {
        delete value.value;
        Object.keys(value).forEach(key => {
            if (key.startsWith('_')) {
                delete value[key];
            }
        })
    }
}

//DAX
//ttl
//TODO! Must be careful with the extra names!!!!
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
            data.value = value;
        }

        await awsClient.putDDBItem('CACHE_01', data);

    } catch (error) {
        console.log(error);
    }
}

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
            if (data && data.value) {
                value = data.value;
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

        const dataType = typeof (expiration);

        if (dataType === 'string') {
            expiration = Math.round(ms(expiration) / 1000);
        }

        if (expiration > 0) {
            data._expiresAt = data._modified + expiration;
        }

        sanitize(value);

        if (flat) {
            Object.assign(data, value);
        } else {
            data.value = value;
        }

        await awsClient.updateDynamic('CACHE_01', key, data);

    } catch (error) {
        console.log(error);
    }
}

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

const test = async () => {
    const data = {
        name: 'Cisco',
        wife: 'MJ',
        now: Date.now()
    }

    const start = utils.time();
    let count = 0;

    //let results = await setP('test', `bleah-test`, data, '1h');
    for (let index = 0; index < 100; index++) {
        //let id = `bleah-`(index + ''.padStart(6, '0'));
        let results = await setP('test', `bleah-${index}`, data, 3600);
        //let results = await getP('test', `bleah-${index}`);
        if (results) {
            count++;
        }
    }
    //console.log(await getP('test', 'bleah-test'));
    const duration = utils.time() - start;
    //console.log(duration, count);
}



(async () => {
    redisClient.on("error", (error) => {
        console.error(error);
    });

    // test();
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