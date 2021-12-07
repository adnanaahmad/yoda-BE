'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').createLogger("handlee-webhook");

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    logger.info(SCRIPT_INFO);
}

const Q = require('./utils-q');

const add = async(data)=> {
    let results;
    if (data && data.url && data.data) {
        logger.info(`webhook started. ${data.url}`);
        let start = utils.time();
        try {

            let url = data.url; 
            if(data.query) {
                url += data.query;
            }

            let response = await utils.fetchData(url, data.data, data.headers);
            let duration = utils.time() - start;
            logger.info(`webhook finished. ${data.url}. ${utils.toFixedPlaces(duration, 2)}ms. [${response}]`);            
        } catch (error) {
            logger.error(error);
            results = error;
        }
    } else {
        //TODO!
        let err = {
            message: 'Invalid data'
        };

        if (data) {
            err.data = data;
        }
        results = err;
    }
    return results;
}

const startQueue = async ()=> {
    logger.info('Webhook queue handler started.');
    await Q.ready();
    Q.getQ(Q.names.handler_webhook).process(async (job, done) => {
        done(await add(job.data));
    });
}

const test = async ()=> {
    try {
        console.log('TEST!');
        let data = {
            transaction_id: utils.getUUID(),
            url: 'https://webhook.site/01275c23-33e5-420f-82a5-e09841edad29',
            data: { text: `HELLO! The time is ${new Date().toISOString()}`}
        };
        //add(data);
        Q.getQ(Q.names.handler_webhook).add(data);
    } catch (error) {
        console.log(error);        
    }
}


(async () => {
    if(!SCRIPT_INFO.library_mode) {
        await startQueue();       
        //test();
    } 
})();

module.exports = {
    add,
}