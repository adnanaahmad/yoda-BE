'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const logger = require('./logger').logger;
const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if (!SCRIPT_INFO.library_mode) {
    logger.info(SCRIPT_INFO);
}

const awsClient = require('./aws-client');

let ready = false;
let twilio;
const Q = require('./utils-q');

let TWILIO_NUMBERS;
let numberCount = 0;
let numberIndex = -1;

const sendSMSTwilio = async (numbers, message) => {
    try {
        let fromNumber;

        if (numberCount > 0) {
            numberIndex++;
            if (numberIndex >= numberCount) {
                numberIndex = 0;
            }
            fromNumber = TWILIO_NUMBERS[numberIndex];
        } else {
            fromNumber = TWILIO_NUMBERS;
        }

        let data = await twilio.messages
            .create({
                body: message,
                from: fromNumber,
                to: numbers
            });
        return data;
    } catch (error) {
        logger.error(error);
        throw error;
    }
}

const lookup = async (data) => {
    if (!ready) {
        //TODO: cache and retry (?)
        return;
    }

    let results;
    if (data) {
        try {
            const id = data.transaction_id || data.numbers;
            logger.info(`[${id}] Lookup process started.`);
            const start = utils.time();

            results = await twilio.lookups.v1.phoneNumbers(data.numbers)
                //countryCode: 'US'
                .fetch({
                    //type: ['caller-name', 'carrier']
                    type: ['carrier']
                });

            if (results) {
                const duration = utils.time() - start;
                logger.info(`[${id}] Lookup finished. ${utils.toFixedPlaces(duration, 2)}ms`);
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

const add = async (data) => {
    if (!ready) {
        //TODO: cache and retry (?)
        return;
    }

    let results;
    if (data) {
        try {
            //TODO: Should we save the id?
            const id = data.transaction_id || data.numbers;
            logger.info(`[${id}] SMS process started.`);
            const start = utils.time();
            results = await sendSMSTwilio(data.numbers, data.text);
            if (results) {
                const duration = utils.time() - start;
                logger.info(`[${id}] SMS sent. ${results.sid} [${results.from}] ${utils.toFixedPlaces(duration, 2)}ms`);
            } else {
                logger.warn('No data returned.');
            }
        } catch (error) {
            logger.error(error);
            if (error && error.code) {
                let code = error.code;
                //Invalid phone number
                if (code === 21211) {
                    //
                }
            }
            results = error;
        }
    }

    return results;
}

const startQueue = () => {
    logger.info('Twilio queue handler started.');
    Q.getQ(Q.names.handler_twilio).process(async (job, done) => {
        done(await add(job.data));
    });
}

const test = async () => {
    console.log('TEST!');

    let data = {
        transaction_id: utils.getUUID(),
        numbers: '206-659-7857',
        text: `HELLO! The time is ${new Date().toISOString()}`
    };

    //Q.getQ(Q.names.handler_twilio).add(data);
    add(data);
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
        if (results) {
            const twilioAccountSid = results[0];
            const twilioAuthToken = results[1];

            TWILIO_NUMBERS = results[2];
            if (twilioAccountSid && twilioAuthToken && TWILIO_NUMBERS) {
                twilio = require('twilio')(twilioAccountSid, twilioAuthToken);
                const duration = utils.time() - start;

                if (typeof (TWILIO_NUMBERS) === 'string') {
                    TWILIO_NUMBERS = utils.splitItems(TWILIO_NUMBERS);
                }

                if (Array.isArray(TWILIO_NUMBERS)) {
                    numberCount = TWILIO_NUMBERS.length;
                    TWILIO_NUMBERS = TWILIO_NUMBERS.map(num => utils.parsePhoneNumber(num).getNumber());
                    if (numberCount > 1) {
                        utils.shuffleArray(TWILIO_NUMBERS);
                    }
                } else {
                    TWILIO_NUMBERS = utils.parsePhoneNumber(TWILIO_NUMBERS).getNumber();
                }
                logger.info(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms. Numbers: ${ numberCount > 0 ? numberCount : 1}.`);
                logger.info(`[${SCRIPT_INFO.name}] Numbers: ${TWILIO_NUMBERS} (${ numberCount > 0 ? numberCount : 1}).`);
            } else {
                logger.warn(`[${SCRIPT_INFO.name}] Twilio account information missing.`);
            }
        } else {
            logger.warn(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        logger.error(error);
    }
    ready = typeof (twilio) !== 'undefined';
}

(async () => {
    console.log('WTF');
    await loadParams();
    if (ready) {
        if (!SCRIPT_INFO.library_mode) {
            startQueue();
            //test();
        }
    }
})();

module.exports = {
    add,
    lookup
}