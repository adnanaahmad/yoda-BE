'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const logger = require('./logger').createLogger('scheduler-did');

const awsClient = require('./aws-client');
const incomeDirectIDResponseStatus = require(`${__dirname}/data/response-status.json`);

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true); 

logger.info(SCRIPT_INFO);

const cron = require('cron');
let cronJob;

let expirationMS;

//86400000 = 1 day
const MIN_EXPIRATION = 86400000;

const cleanRecords = async (status, now)=> {
    const expiration =  now - expirationMS;
    const params = {
        TableName: 'DIRECTID_INCOME',
        IndexName: 'status',
        KeyConditionExpression: '#s = :s and #r < :r',
        ExpressionAttributeValues: {
            ':s': status,
            ':r': expiration
        },
        ExpressionAttributeNames: {
            "#s": "status",
            "#r": "requestStart"
        },
    };

    const deleteRecord = async (item) => {
        const params = {
            TableName: 'DIRECTID_INCOME',
            Key: {
                "CustomerAccountID": item.CustomerAccountID,
                "TransactionID": item.TransactionID
            }
        };
        let result = await awsClient.docDelete(params);
        if (result) {
            logger.debug(`Deleted record:  [${item.archived}] ${item.CustomerAccountID} - ${item.TransactionID}`);
        }
    }

    let data = await awsClient.docQuery(params);
    if (data) {
        logger.debug(`[${status}] Found ${data.Count} records.`);
        //TODO: May have to do this individually or do a wait due to AWS rate limiting. 
        data.Items.forEach(async (item) => {
            item.archived = now;

            delete item.estimatedIncome;
            delete item.confidenceScore;
            delete item.confidenceScoreFlags;
            delete item.nameMatchScore;

            let result = await awsClient.putDDBItem('DIRECTID_INCOME_ARCHIVED', item);
            if (result) {
                logger.debug(`Archived record: [${now}] ${item.CustomerAccountID} - ${item.TransactionID}`);
                await deleteRecord(item);
            }
        });

        // if (typeof data.LastEvaluatedKey != "undefined") {
        //     console.log("Scanning for more...");
        //     //params.ExclusiveStartKey = data.LastEvaluatedKey;
        //     //docClient.scan(params, onScan);
        // }
    }
}

const doJob = async () => {
    const now = Date.now();
    logger.info(`Scheduled tasks starting... [${now - expirationMS}]`);
    const funcs = [];
    const start = utils.time();
    Object.keys(incomeDirectIDResponseStatus).forEach((key)=> {
        funcs.push(cleanRecords(incomeDirectIDResponseStatus[key], now));
    })

    try {
        let results = await Promise.all(funcs);
    } catch (error) {
        logger.error(error);        
    }
    const duration = utils.time() - start;
    logger.info(`Scheduled tasks completed in ${utils.toFixedPlaces(duration, 2)}ms`);
}

(async () => {
    const schedule = await awsClient.getParameter('/config/directid/scheduler.cron_schedule');

    if (typeof (schedule) === 'string') {
        expirationMS = await awsClient.getParameter('/config/directid/scheduler.expiration_ms');
        if (typeof (expirationMS) !== 'undefined') {
            expirationMS = parseInt(expirationMS);
        } else {
            expirationMS = MIN_EXPIRATION;
        }

        expirationMS = expirationMS < MIN_EXPIRATION ? MIN_EXPIRATION : expirationMS;
        try {
            cronJob = cron.job(schedule, async () => {
                await doJob();
            });

            cronJob.start();
            logger.info(`Scheduler started: ${schedule}`);
        } catch (error) {
            logger.error(error);
        }
    }
})();