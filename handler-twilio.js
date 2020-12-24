'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    console.info(SCRIPT_INFO);
}

const awsClient = require('./aws-client');

let ready = false;
let twilio;
const Q = require('./utils-q');

let TWILIO_NUMBER;

const sendSMSTwilio = async (numbers, message) => {
    try {
        let data = await twilio.messages
            .create({
                body: message,
                from: TWILIO_NUMBER,
                to: numbers
            });
        return data;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

const add = async(data)=> {
    if(!ready) {
        //TODO: cache and retry (?)
        return;
    }

    let results;
    if (data) {
        try {
            console.log(`SMS process started. ${data.numbers}`);
            const start = utils.time();
            let response = await sendSMSTwilio(data.numbers, data.text);
            if (response) {
                const duration = utils.time() - start; 
                console.log(`SMS sent. ${response.sid} ${utils.toFixedPlaces(duration, 2)}ms`);
            } else {
                console.error('No data returned.');
            }
        } catch (error) {
            if (error && error.code) {
                let code = error.code;
                //Invalid phone number
                if (code === 21211) {

                }
            }
           results = error;
        }
    }

    return results;
}

const startQueue = ()=> {
    console.log('Queue handler started.');
    Q.getQ(Q.names.alert_twilio).process(async (job, done) => {
        done(await add(job.data));
    });
}

const loadParams = async () => {
    //TODO:
    ready = false;
    twilio = undefined;

    console.log(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    const start = utils.time();
    
    funcs.push(awsClient.getParameter('/config/shared/twilio.account_sid'));
    funcs.push(awsClient.getParameter('/config/shared/twilio.auth_token'));
    funcs.push(awsClient.getParameter('/config/shared/twilio.phone_number'));

    try {
        let results = await Promise.all(funcs);
        if(results) {
            const twilioAccountSid = results[0];
            const twilioAuthToken = results[1];
            TWILIO_NUMBER = results[2];
            twilio = require('twilio')(twilioAccountSid, twilioAuthToken);
            const duration = utils.time() - start;
            console.log(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);
        } else {
            console.log(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`)
        }
    } catch (error) {
        console.log(error.message);
    }
    ready = typeof(twilio) !== 'undefined';
}

(async () => {
    await loadParams();
    if(ready) {
        if(!SCRIPT_INFO.library_mode) {
            startQueue();
        } 
    }
})();

module.exports = {
    add,
}