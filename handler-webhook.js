'use strict';
/*jshint esversion: 8 */
//https://webhook.site/ffbd1a65-a040-4c68-aef4-fc5774c6be67

const utils = require('./utils');

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    console.info(SCRIPT_INFO);
}

const Q = require('./utils-q');

const add = async(data)=> {
    let results;
    if (data && data.url && data.data) {
        console.log(`webhook started. ${data.url}`);
        let start = utils.time();
        try {

            let url = data.url; 
            if(data.query) {
                url+= data.query;
            }

            let response = await utils.fetchData(url, data.data, true);
            let duration = utils.time() - start;
            let status = 0;
            if(response) { 
                status = response.status;
            }
            console.log(`webhook finished. ${utils.toFixedPlaces(duration, 2)}ms. [${status}]`);            
        } catch (error) {
            console.log(error.message);
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
    console.log('Queue handler started.');

    Q.getQ(Q.names.alert_webhook).process(async (job, done) => {
        done(await add(job.data));
    });
}

(async () => {
    if(!SCRIPT_INFO.library_mode) {
        startQueue();
    } 
})();

module.exports = {
    add,
}