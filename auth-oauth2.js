'use strict';
/*jshint esversion: 8 */

const logger = require('./logger').logger;
const utils = require('./utils');

let cacheTokens = false;
let renewTimer;

const TOKENS = {};
const REQUESTS = {};
const KEYS = [];
//TODO!
const saveFile = async (type, id, data) => {
    if (!data) {
        return;
    }

    try {
        await utils.fileWrite(`./${type}/${id}.json`, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error(error);
    }
}

//TODO!
const loadFile = async (type, id) => {
    try {
        let data = await utils.loadFile(`./${type}/${id}.json`);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error(error);
    }
}

const addRequest = (id, token_url, client_id, client_secret, scope, grant_type = 'client_credentials') => {
    KEYS.push(id);
    REQUESTS[id] = {
        id,
        token_url,
        client_id,
        client_secret,
        scope,
        grant_type,
        headers: {}
    };
}

const getRequest = (id) => {
    return REQUESTS[id];
}

const checkToken = async (id) => {
    let token = TOKENS[id];
    if (!token && cacheTokens) {
        token = await loadFile('secure', id);
        if (token) {
            TOKENS[id] = token;
            logger.debug(`Loaded cached ${id} token.`);
        }
    }

    if (token) {
        const seconds = Math.round((token.expires - 300000 - Date.now()) / 1000); 
        token.checking = false;
        if (seconds > 0) {
            return true;
        }
    }
}

const requestToken = async (id, url, client_id, client_secret, scope, grant_type = 'client_credentials', extraHeaders) => {
    if (await checkToken(id)) {
        return;
    }

    logger.debug(`Requesting ${id} token...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded'
        //'content-type': 'application/json'
    };

    const body = {
        grant_type: grant_type,
        client_id: client_id,
        client_secret: client_secret
    }

    if (scope) {
        body.scope = scope;
    }

    try {
        const start = utils.time();
        const response = await utils.fetchData(url, body, headers, 'post', undefined, true, extraHeaders);

        const duration = utils.time() - start;

        if (response && response.access_token && (response.expires_in || response.expires_in_secs)) {
            
            if (response.expires_in_secs) {
                response.expires_in = response.expires_in_secs;
                delete response.expires_in_secs;
            }
  
            response.expires = Date.now() + (response.expires_in * 1000);
            TOKENS[id] = response;
            logger.debug(`Retrieved ${id} token. Expires on ${new Date(response.expires).toISOString()} (${Math.round(response.expires_in / 60)} minutes). ${utils.toFixedPlaces(duration, 2)}ms`);
            if (cacheTokens) {
                await saveFile('secure', id, response);
            }
        } else {
            logger.error(`requestToken - [${id}] invalid response`, response);
        }
    } catch (error) {
        logger.error(`requestToken - [${id}] error`, error);
    }
}

const checkTokens = async () => {

    clearTimeout(renewTimer);

    const tokenFuncs = [];

    Object.keys(REQUESTS).forEach(key => {
        let req = REQUESTS[key];
        tokenFuncs.push(requestToken(req.id,
            req.token_url, req.client_id, req.client_secret, req.scope, req.grant_type, req.headers));

    });

    let wait = 30000;
    if (tokenFuncs.length > 0) {
        try {
            await Promise.all(tokenFuncs);
        } catch (error) {
            wait = 10000;
            logger.error('checkTokens', error);
        }
    }

    renewTimer = setTimeout(() => {
        checkTokens();
    }, wait);
}

const getToken =(id)=> {
    const auth = TOKENS[id];
    if(auth) {
        return auth.access_token;
    }
}

const start = async () => {
    await checkTokens();
}

const stop = () => {
    clearTimeout(renewTimer);
}

module.exports = {
    addRequest,
    start,
    stop,
    getRequest,
    cacheTokens,
    getToken,
    TOKENS,
}