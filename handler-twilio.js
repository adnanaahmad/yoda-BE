'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const logger = require('./logger').logger
const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    logger.info(SCRIPT_INFO);
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
        logger.error(error);
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
            logger.info(`SMS process started. ${data.numbers}`);
            const start = utils.time();
            let response = await sendSMSTwilio(data.numbers, data.text);
            if (response) {
                const duration = utils.time() - start; 
                logger.info(`SMS sent. ${response.sid} ${utils.toFixedPlaces(duration, 2)}ms`);
            } else {
                logger.warn('No data returned.');
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
    logger.info('Twilio queue handler started.');
    Q.getQ(Q.names.alert_twilio).process(async (job, done) => {
        done(await add(job.data));
    });
}

const loadParams = async () => {
    //TODO:
    ready = false;
    twilio = undefined;

    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
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
            
            if(twilioAccountSid && twilioAuthToken && TWILIO_NUMBER) {
                twilio = require('twilio')(twilioAccountSid, twilioAuthToken);
                const duration = utils.time() - start;
                logger.info(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);
            } else {
                logger.warn(`[${SCRIPT_INFO.name}] Twilio account information missing.`);
            }
        } else {
            logger.warn(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        logger.error(error);
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