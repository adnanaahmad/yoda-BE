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
const GRACE_PERIOD = 2 * 60 * 1000;

//TODO!
// This function saves data as a JSON file in the directory named type with id as the filename, using utils.fileWrite() function and logs an error if any occurs.
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
// This function loads data from directory named type, with id as filename, using utils.loadFile() and returns data object after parsing JSON, otherwise logs error if any occurs.
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
// this function adds a request object into a REQUESTS object with given properties to be processed later, and also pushes given id into an array named KEYS.
const addRequest = (id, token_url, client_id, client_secret, scope, grant_type = 'client_credentials', extraData, extraHeaders) => {
    KEYS.push(id);
    REQUESTS[id] = {
        id,
        token_url,
        client_id,
        client_secret,
        scope,
        grant_type,
        responseHeaders: {},
        extraData,
        extraHeaders
    };
}
// This function receives an id and returns the request object from the REQUESTS.
const getRequest = (id) => {
    return REQUESTS[id];
}
// This function checks if a token with given id has expired, if not returns true, if enabled cache it from disk, and if not in both cases returns nothing.
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
        const seconds = Math.round((token.expires - GRACE_PERIOD - Date.now()) / 1000);
        token.checking = false;
        if (seconds > 0) {
            return true;
        }
    }
}
// This function requests a new token and handles basic auth with given request id by fetching data from token_url using client_id, client_secret, and scope, then stores the token into TOKENS object with an expiration time, if available.
const requestToken = async (req) => {
    let method = "post";

    const {
        id
    } = req;
    try {
        if (await checkToken(id)) {
            return;
        }
    } catch (error) {
        logger.error(error)
    }

    //id, url, client_id, client_secret, scope, grant_type = 'client_credentials', 
    let {
        token_url,
        client_id,
        client_secret,
        scope,
        grant_type,
        responseHeaders,
        extraData,
        extraHeaders
    } = req;

    grant_type = grant_type || 'client_credentials';
    //req.token_url, req.client_id, req.client_secret, req.scope, req.grant_type, req.headers
    //TODO: refresh_token

    logger.debug(`Requesting ${id} token...`);
    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        ...extraHeaders
        //'content-type': 'application/json'
    };

    const body = {
        grant_type: grant_type,
        client_id: client_id,
        client_secret: client_secret,
        ...extraData
    }


    if(grant_type === 'basic_auth') {
        method = "get";
        const b64 = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
        headers.Authorization = `Basic ${b64}`;
        delete body.grant_type;
        delete body.client_id;
        delete body.client_secret;
    } else {
        if (scope) {
            body.scope = scope;
        }
    }

    try {
        const start = utils.time();
        const response = await utils.fetchData(token_url, body, headers, method, undefined, true, responseHeaders);
        const duration = utils.time() - start;

        if (response && response.access_token) {

            if((response.expires_in || response.expires_in_secs)) {
                if (response.expires_in_secs) {
                    response.expires_in = response.expires_in_secs;
                    delete response.expires_in_secs;
                }
            } else {
                response.expires_in = 3600;
            }

            response.expires = Date.now() + (response.expires_in * 1000);
            TOKENS[id] = response;
            logger.debug(`Retrieved ${id} token. Expires on ${new Date(response.expires).toISOString()} (${Math.round(response.expires_in / 60)} minutes). ${utils.toFixedPlaces(duration, 2)}ms`);
            if (cacheTokens) {
                await saveFile('secure', id, response);
            }
        } else {
            logger.error(`requestToken - [${id}] invalid response`, response);
            //console.log(response, responseHeaders);
        }
    } catch (error) {
        logger.error(`requestToken - [${id}] error`, error);
    }
}
// This function clears a timer, generates an array of functions to request tokens from REQUESTS keys, then waits 30 seconds if there functions in the array and less than 10 seconds if there's an error and run the checkTokens function again after waiting.
const checkTokens = async () => {
    clearTimeout(renewTimer);

    const tokenFuncs = [];

    Object.keys(REQUESTS).forEach(key => {
        tokenFuncs.push(requestToken(REQUESTS[key]));
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
// This function checks if there's a token stored in TOKENS object with the same id, and returns its access_token, otherwise it returns nothing.
const getToken = (id) => {
    const auth = TOKENS[id];
    if (auth) {
        return auth.access_token;
    }
}
//  This function runs checkTokens() function that will call requestToken() whenever necessary to store an access_token if not yet stored or has expired.
const start = async () => {
    await checkTokens();
}
// This function clears the timer renewTimer in order to stop token fetching.
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