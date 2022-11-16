'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const awsClient = require('./aws-client');

module.exports = async (path, logger, required) => {
    try {

        let file = `${__dirname}${path}.json`;
        let PARAMS = await utils.loadJSONAsync(file);
        if (!PARAMS) {
            PARAMS = await awsClient.getParametersByPath(path, undefined, true);
            if(!PARAMS) {
                PARAMS = await awsClient.getParameter(path);
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
            if (logger) {
                logger.error(`No parameters defined in ${path}.`);
            } else {
                console.error(`No parameters defined in ${path}.`);
            }

            if(required) {
                process.exit(0);
            }
        }
        return PARAMS;
    } catch (error) {
        if (logger) {
            logger.error(error);
        } else {
            console.log(error);
        }
    }
}