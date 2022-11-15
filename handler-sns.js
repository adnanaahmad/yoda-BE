'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger("handler-sns");

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    logger.info(SCRIPT_INFO);
}

const awsClient = require('./aws-client');
const Q = require('./utils-q');



const add = async (data) => {
    // if (!ready) {
    //     //TODO: cache and retry (?)
    //     return;
    // }

    let results;
    if (data) {
        try {
            data.numbers = utils.getPhoneNumber(data.numbers);
            const id = data.transaction_id || data.numbers;
            logger.info(`[${id}] SMS process started.`);
            const start = utils.time();
            results = await awsClient.sendSNS(data.numbers, data.text); 
            if (results) {
                const duration = utils.time() - start;
                logger.info(`[${id}] SMS sent. ${results.ResponseMetadata.RequestId} ${utils.toFixedPlaces(duration, 2)}ms`);
            } else {
                logger.warn('No data returned.');
            }
        } catch (error) {
            logger.error(error);
            results = error;
        }
    }

    return results;
}


const startQueue = () => {
    logger.info('AWS SNS queue handler started.');
    Q.getQ(Q.names.handler_sns).process(async (job, done) => {
        done(await add(job.data));
    });
}

(async () => {
    //let data = await add( { numbers: '2066597857', text: "test!"});
    //console.log(data);
    // await loadParams();
    //if (ready) {
        if (!SCRIPT_INFO.library_mode) {
            startQueue();
            //test();
        }
    //}    
})();

module.exports = {
    add
}
 