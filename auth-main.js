'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const pem = require('pem-file');
const awsClient = require('./aws-client');
const { logger } = require('./logger');

const cache = require('./cache');

const getAuthz = async (certId)=> {
    if(!certId) {
        return;
    }

    let result = await awsClient.getDDBItem('USER_AUTHZ_TABLE', {CertificateID: certId});
    if (result) {
        return result.Item;
    }
}

const checkHeaders = async (request, reply)=> {
    //return true;
    let reason = 'Unauthorized';
    let code = 401;
    //TODO: All this should be done in the apigw!

    try {

        let cert = request.headers['x-client-cert'];
        if(cert && cert.length > 0) {
            cert = decodeURIComponent(cert);
            cert = pem.decode(cert);
            if(cert) {
                let certId = utils.hash(cert, 'sha256', 'hex').toUpperCase();
                //request.user = certId;
                let user = await getAuthz(certId);
                
                
                let passed = false;
                if(user) {
                    if(user.Expiration && (new Date(user.Expiration) > new Date ())) {
                        passed = true;
                    } else {
                        reason = 'Expired account.';
                    }

                    if(passed) {
                        if(!user.IpPrefixPermitList || !utils.ipRangeCheck(request.ip, user.IpPrefixPermitList)) {
                            reason = `IP address not allowed. ${request.ip}`;
                            passed = false;
                        }
                    }
                }

                if(passed) {
                    let rateLimit = await cache.decrementP('rate_limit', user.CustomerAccountID, 'value.credits_available');
                    if(rateLimit && rateLimit.credits_available > -1) {
                         //RateLimit-Limit
                         reply.headers['RateLimit-Remaining'] = rateLimit.credits_available; 
                         request.user = user; 
                         logger.silly(user.CustomerAccountID, rateLimit);
                         return true;
                    } else {
                        reply.headers['RateLimit-Remaining'] = 0;
                        reason = 'Rate limit exceeded. Please contact help@fortifid.com.';
                        code = 403;
                    }
                }
            } else {
                reason = 'Invalid client certificate.';    
            }
        } else {
            reason = 'Missing client certificate.';
        }
    } catch (error) {
        reason = error.message;
        code = 500;
    }

    let data = {
        status: 'error',
        reason: reason,
        code: code
    }

    reply.type('application/json').code(code).send(data);
    logger.warn(data);
}

module.exports = {
    checkHeaders,
    getAuthz
}