'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

module.exports = async (path, logger, required, byPath = false) => {
    try {

        let file = `${__dirname}${path}.json`;
        let PARAMS = await utils.loadJSONAsync(file);
        if (!PARAMS) {
            if(!byPath) {
                PARAMS = await awsClient.getParameter(path);
            }
            
            if(!PARAMS) {
                PARAMS = await awsClient.getParametersByPath(path, undefined, true);
            }
        } else {
            Object.keys(PARAMS).forEach(key => {
                if (key.startsWith('*')) {
                    PARAMS[key.substring(1)] = PARAMS[key];
                    delete PARAMS[key];
                }
            });
        }

        if (typeof (PARAMS) === 'undefined') {
            console.error(`No parameters defined in ${path}.`);
            if(required) {
                process.exit(111);
            }
        }
        return PARAMS;
    } catch (error) {
        console.error(error.message);
    }
}