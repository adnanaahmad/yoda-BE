'use strict';
/*jshint esversion: 8 */
const bull = require('bull');
const utils = require('./utils');

//TODO!

let redisUrl = process.env.REDIS_URL;
//nc -v url port
const QUEUES = {};

const names = {
    handler_twilio: 'handler_twilio',
    handler_email: 'handler_email',
    handler_webhook: 'handler_webhook',
};

let postQ;
let postQNames = [names.post_process, names.analytics];

const getQ = (key, options) => {
    let q = QUEUES[key];
    if (typeof (q) === 'undefined') {
        q = setQ(key, undefined, options);
    }
    return q;
};

const setQ = (key, url, options) => {

    url = url || redisUrl;
    if (typeof (url) === 'string') {
        options = {
            ...options || jobOptsRemove,
            //prefix: '{FID}',
            redis: utils.redisOptsFromUrl(url)
        };
    }

    //let q = new bull(key, url, options);
    let q = new bull(key, options);
    QUEUES[key] = q;
    return q;
};

const delQ = (key) => {
    delete QUEUES[key];
};

const jobOptsKeep = {
    removeOnComplete: false
};

const jobOptsRemove = {
    removeOnComplete: true
};

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

const initAll = () => {
    Object.keys(names).forEach(key => {
        let item = names[key];
        setQ(item, redisUrl);
    });
};

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

(async () => {

})();

module.exports = {
    getQ,
    setQ,
    delQ,
    jobOptsKeep,
    jobOptsRemove,
    queues: QUEUES,
    addQ,
    names,
    addToPostQ,
}