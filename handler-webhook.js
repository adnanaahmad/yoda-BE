'use strict';
/*jshint esversion: 8 */
//https://webhook.site/ffbd1a65-a040-4c68-aef4-fc5774c6be67

const utils = require('./utils');
const logger = require('./logger').logger;
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

            let response = await utils.fetchData(url, data.data);
            let duration = utils.time() - start;
            logger.info(`webhook finished. ${utils.toFixedPlaces(duration, 2)}ms. [${response}]`);            
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

const startQueue = ()=> {
    logger.info('Webhook queue handler started.');

    Q.getQ(Q.names.handler_webhook).process(async (job, done) => {
        done(await add(job.data));
    });
}


const test = async ()=> {
    console.log('TEST!');
    let data = {
        transaction_id: utils.getUUID(),
        url: 'https://webhook.site/f7e207e6-15dc-4806-8cd2-b49ac78690d9',
        data: { text: `HELLO! The time is ${new Date().toISOString()}`}
    };

    Q.getQ(Q.names.handler_webhook).add(data);
}


(async () => {
    if(!SCRIPT_INFO.library_mode) {
        startQueue();
        //test();
    } 
})();

module.exports = {
    add,
}