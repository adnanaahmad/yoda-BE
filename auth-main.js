'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const pem = require('pem-file');
const awsClient = require('./aws-client');

const {
    logger
} = require('./logger');

const cache = require('./cache');

const {
    RateLimiterRedis,
    RateLimiterMemory,
    BurstyRateLimiter
} = require('rate-limiter-flexible');


//TODO!
let rateLimiterRedis;
/*
const rateLimiterRedis = new RateLimiterRedis({
    storeClient: cache.redisClient,
    points: 100,
    duration: 0
});
*/
// This function retrieves an item from a DynamoDB table using certId as the unique identifier to obtain authorization information.
const getAuthz = async (certId) => {
    if (!certId) {
        return;
    }

    let result = await awsClient.getDDBItem('USER_AUTHZ_TABLE', {
        CertificateID: certId
    });

    if (result) {
        return result.Item;
    }
}
// This function fetches a customer account matching the provided customer_id from a DynamoDB table named 'CUSTOMER_ACCOUNT'.
const getCustomer = async (customer_id) => {
    if (!customer_id) {
        return;
    }

    let result = await awsClient.getDDBItem('CUSTOMER_ACCOUNT', {
        customer_account_id: customer_id
    });

    if (result) {
        return result.Item;
    }
}
// This function sends a webhook notification based on table event data to a specific customer through handler function if the customer has an active webhook for the specific table.
const sendWebhook = async (customer_id, data, table, handler) => {
    try {
        const customer = await getCustomer(customer_id);
        if (customer) {
            if (customer.webhooks) {
                const webhook = customer.webhooks[table];
                if (webhook) {
                    const payload = utils.createWebhookPayload(data, webhook.url, table, webhook.secret);
                    if(payload) {
                        handler.webhook(payload);
                    }
                }
            }
        }
    } catch (error) {
        console.log(error);        
    }
}
// This asynchronous function checks the API rate limit of a customer by consuming one point from the Redis rateLimiterRedis, and returns the rate limiter response object with the number of remaining points.
const checkRateLimit = async (request, reply) => {
    if (!request.user || !request.user.CustomerAccountID) {
        return;
    }

    let rateLimiterRes;
    try {
        rateLimiterRes = await rateLimiterRedis.consume(user.CustomerAccountID, 1);
    } catch (err) {
        rateLimiterRes = err;
        rateLimiterRes.remainingPoints = -1;
    }
    return rateLimiterRes;
}
// The function checkHeaders takes in request, reply, minLevel (default value: 0), and requireAdmin (default value: false) as parameters, performs user authentication and authorization based on HTTP headers, and returns a boolean (true if authentication is successful).
const checkHeaders = async (request, reply, minLevel = 0, requireAdmin = false) => {
    //return true;
    let reason = 'Unauthorized';
    let code = 401;
    let certId;
    let passed = false;
    //TODO: All this should be done in the apigw!

    try {
        let user;
        let fingerprint = request.headers['x-client-fingerprint'];
        if (fingerprint && fingerprint.length > 0) {
            user = cache.getM("user-cert", fingerprint);
        }

        if (!user) {
            let cert = request.headers['x-client-cert'];
            if (cert && cert.length > 0) {
                cert = decodeURIComponent(cert);
                cert = pem.decode(cert);
                if (cert) {
                    certId = utils.hash(cert, 'sha256', 'hex').toUpperCase();
                    user = await getAuthz(certId);
                    if (user) {
                        cache.setM("user-cert", fingerprint, user);
                    }
                } else {
                    reason = 'Invalid client certificate.';
                }
            } else {
                reason = 'Missing client certificate.';
            }
        }

        if (user) {
            if (user.Expiration && (new Date(user.Expiration) > new Date())) {
                passed = true;
            } else {
                reason = 'Expired account.';
            }

            if (passed && user.IpPrefixPermitList && user.IpPrefixPermitList.length > 0) {
                if (!utils.ipRangeCheck(request.ip, user.IpPrefixPermitList)) {
                    reason = `IP address not allowed. ${request.ip}`;
                    passed = false;
                }
            }
        }

        if (passed) {
            if (typeof (user.Level) !== 'number') {
                user.Level = 0;
            }

            if ((!requireAdmin || user.Role === 'admin') && user.Level >= minLevel) {
                request.user = user;
                return true;
            }

            // let rateLimit = checkRateLimit(request);
            // logger.silly(user.CustomerAccountID, rateLimit);
            // if(rateLimit && rateLimit.remainingPoints > -1) {
            //      //RateLimit-Limit
            //      reply.headers['RateLimit-Remaining'] = rateLimit.remainingPoints; 
            //      request.user = user; 
            //      return true;
            // } else {
            //     reply.headers['RateLimit-Remaining'] = 0;
            //     reason = 'Rate limit exceeded. Please contact help@fortifid.com.';
            //     code = 429;
            // }
            // let rateLimit = await cache.decrementP('rate_limit', user.CustomerAccountID, 'value.credits_available');
            //logger.silly(user.CustomerAccountID, rateLimit);

            // if(rateLimit && rateLimit.credits_available > -1) {
            //      //RateLimit-Limit
            //      reply.headers['RateLimit-Remaining'] = rateLimit.credits_available; 
            //      request.user = user; 
            //      logger.silly(user.CustomerAccountID, rateLimit);
            //      return true;
            // } else {
            //     reply.headers['RateLimit-Remaining'] = 0;
            //     reason = 'Rate limit exceeded. Please contact help@fortifid.com.';
            //     code = 403;
            // }
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

    if (reply.type) {
        reply.type('application/json').code(code).send(data);
    } else {
        utils.sendData(reply, data, code);
    }

    let e = { ...data };
    if (certId) {
        e.cert = certId;
    }

    logger.warn(e);
}

(async () => {

})();

module.exports = {
    checkHeaders,
    getAuthz,
    getCustomer,
    sendWebhook
}