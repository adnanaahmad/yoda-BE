'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

module.exports = async (path, logger) => {
    try {
        let file = `${__dirname}${path}.json`;
        let PARAMS = await utils.loadJSONAsync(file);
        if (!PARAMS) {
            PARAMS = await awsClient.getParametersByPath(path, undefined, true);
        } else {
            Object.keys(PARAMS).forEach(key => {
                if (key.startsWith('*')) {
                    PARAMS[key.substr(1)] = PARAMS[key];
                    delete PARAMS[key];
                }
            });
        }
    
        if (typeof (PARAMS) === 'undefined') {
            if (logger) {
                logger.error(`No parameters defined in ${path}.`);
            }
            process.exit(1);
        }
    
        return PARAMS;
    } catch (error) {
        if(logger) {
            logger.error(error);
        }
    }
}