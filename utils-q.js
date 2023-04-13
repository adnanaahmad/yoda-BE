'use strict';
/*jshint esversion: 8 */
const bull = require('bull');
const utils = require('./utils');
const awsClient = require('./aws-client');

//TODO!
const PREFIX = process.env.INSTANCE_ID;

let redisUrl;
//nc -v url port
//nc -vz url port

const QUEUES = {};

const names = {
    handler_twilio: 'handler_twilio',
    handler_email: 'handler_email',
    handler_webhook: 'handler_webhook',
    handler_sns: 'handler_sns',
};

let postQ;
let postQNames = [names.post_process, names.analytics];

//This function retrieves a queue object based on a given key, and if the queue does not exist, it creates one with the provided options.
const getQ = (key, options) => {
    let q = QUEUES[key];
    if (typeof (q) === 'undefined') {
        q = setQ(key, undefined, options);
    }
    return q;
};
// This function sets up a queue with a given key and Redis URL, and then returns the created queue object.
const setQ = (key, url, options) => {
    url = url || redisUrl;

    if (typeof (url) === 'string') {
        options = {
            ...options || jobOptsRemove,
            redis: utils.redisOptsFromUrl(url)
        };
    }

    if (PREFIX) {
        options = options || {};
        options.prefix = PREFIX;
    }

    let q = new bull(key, options);
    QUEUES[key] = q;
    return q;
};
// This function deletes the queue object associated with the provided key from the QUEUES object.
const delQ = (key) => {
    delete QUEUES[key];
};

const jobOptsKeep = {
    removeOnComplete: false
};

const jobOptsRemove = {
    removeOnComplete: true
};

// This function sets the Redis URL to the provided value if the input is a string starting with "redis".
const setRedisUrl = (url) => {
    if (typeof (url) === 'string' && url.startsWith('redis')) {
        redisUrl = url;
    }
}
// This function adds a job with the provided data and options to a queue with the given key, and returns true if the job is added successfully, otherwise returns false and logs the error to the console.
const addQ = (key, data, options) => {
    try {

        let q = getQ(key);
        if (typeof (q) === 'undefined') {
            q = setQ(key);
        }

        options = options || jobOptsRemove;
        q.add(data, options);
        return true;
    } catch (error) {
        console.error(error);
    }
    return false;
};
// This function initializes queues with names stored in the names object using the Redis URL stored in redisUrl.
const initAll = () => {
    Object.keys(names).forEach(key => {
        let item = names[key];
        setQ(item, redisUrl);
    });
};
// This function adds a job with the provided data to all queues listed in the postQNames array, initializing the queues if they do not exist already.
const addToPostQ = (data) => {
    if (!postQ) {
        postQ = {};
        postQNames.forEach(id => {
            postQ[id] = getQ(id, jobOptsRemove);
        });
    };

    postQNames.forEach(id => {
        postQ[id].add(data);
    });
}
// This function waits for the Redis URL to be defined, and returns a promise resolving to true once it is defined, otherwise it returns a promise resolving to false.
const ready = async () => {
    let loops = 0;
    while (!redisUrl && ++loops < 100) {
        await utils.timeout(300);
    }
    return redisUrl !== undefined;
}
// This is an immediately invoked async function that retrieves the Redis URL using an AWS parameter store client and stores it in the redisUrl variable, if it is not already defined.
(async () => {
    if (typeof (redisUrl) === 'undefined') {
        redisUrl = await awsClient.getParameter('/config/shared/redis/url');
    }
})();

module.exports = {
    ready,
    getQ,
    setQ,
    delQ,
    jobOptsKeep,
    jobOptsRemove,
    queues: QUEUES,
    addQ,
    names,
    addToPostQ,
    setRedisUrl
}