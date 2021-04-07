'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger');
const awsClient = require('./aws-client');
const fs = require('fs');

const WHITELISTING = true;
let IP_WHITELIST = [];

const checkIP = async (request, reply) => {
    try {

        if(!WHITELISTING) {
            return true;
        }

        if (IP_WHITELIST.indexOf(request.ip) === -1) {
            let data = {
                status: 'error',
                reason: `IP address not allowed. ${request.ip}`,
                code: 403
            }
            reply.type('application/json').code(403).send(data);
            logger.warn(data);
            return false;
        } else {
            return true;
        }
    } catch (err) {
        reply.send(err)
    }

}

module.exports = {
    checkIP,
}