'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

let _path;

let PARAMS;

const init = async (path) => {
    _path = path;
    let file = `${__dirname}/config/${path}.json`;
    PARAMS = await utils.loadJSONAsync(file);
    if (!PARAMS) {
        //TODO!
    }
    return PARAMS;
}

const get = (id) => {
    return PARAMS[id];
}

const getAll = ()=> {
    return PARAMS;
}

(async () => {

})();

module.exports = {
    init,
    get,
    getAll,
    default: ()=>getAll()
}