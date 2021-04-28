'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

let _path;

let PARAMS;

const init = (path) => {
    _path = path;
    let file = `${__dirname}${path}.json`;
    PARAMS = utils.loadJSON(file);
    if (!PARAMS) {
        PARAMS = awsClient.getParametersByPathSync(path, undefined, true);
    } else {
        Object.keys(PARAMS).forEach(key => {
            if(key.startsWith('*')) {
                PARAMS[key.substr(1)] = PARAMS[key];
                delete PARAMS[key];
            }
        });
    }
    return PARAMS;
}

const get = (id) => {
    return PARAMS[id];
}

const getAll = () => {
    return PARAMS;
}

(async () => {

})();

module.exports = init;
// module.exports = {
//     init,
//     get,
//     getAll,
//     default: init
// }