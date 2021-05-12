'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger').logger;

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    logger.info(SCRIPT_INFO);
}

const awsClient = require('./aws-client');
const Q = require('./utils-q');
const TEMPLATES = {};
const nodemailer = require('nodemailer');

let sesTransport;
let ready = false;
let emailFrom;
let redisUrl;

const sendEmailWrapper = async (email, subject, text, textHTML) => {

    return new Promise((resolve, reject) => {
        const mailOptions = {
            from: emailFrom,
            to: email,
            subject : subject,
        };

        if(text) {
            mailOptions.text = text;
        }
        
        if (textHTML) {
            mailOptions.html = textHTML;
        }

        sesTransport.sendMail(mailOptions,  (error, info) => {
            if (error) {
                logger.error(error);
                resolve(false); // or use reject(false) but then you will have to handle errors
            } else {
                logger.info('email sent', info.response);
                resolve(true);
            }
        });

    });
}


const sendEmail = async (email, subject, text, textHTML)=> {
    try {
        return await sendEmailWrapper(email, subject, text, textHTML);
    } catch (error) {
        logger.error(error);        
    }
}

const add = async(data)=> {
    if(!ready) {
        //TODO: cache and retry (?)
        return;
    }

    let results;
    try {
        //TODO: Should we save the id?
        const id = data.transaction_id || data.email;
        logger.info(`[${id}] email process started`);
        const start = utils.time();
        if(utils.validateEmail(data.email)) {
            let replacements = data.replacements;
            if(data.template && replacements) {
                let template = TEMPLATES[data.template];
                if(!template) {
                    logger.warn(data.template, `template [${data.template}] not found.`);
                    return;
                } 
                data.html= utils.parseTemplate(template, replacements);
            }
            let email = data.name ? (`${data.name} <${data.email}>`): data.email;
            await sendEmail(email, data.subject, data.body, data.html);
            const duration = utils.time() - start; 
            logger.info(`[${id}] email sent. [${data.subject}] in ${utils.toFixedPlaces(duration, 2)}ms`);
        } else {
            logger.warn(`[${id}] invalid email:`);
        }
    } catch (error) {
        logger.error(error);
        results = error;
    }
    return results;
}

const startQueue = ()=> {
    logger.info('Email queue handler started.');
    Q.setRedisUrl(redisUrl);
    Q.getQ(Q.names.handler_email).process(async (job, done) => {
        done(await add(job.data));
    });
}

const loadParams = async () => {
    //TODO:
    ready = false;
    sesTransport = undefined;

    logger.debug(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];

    const start = utils.time();
    
    funcs.push(awsClient.getParameter('/config/shared/email.ses.account'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.password'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.smtp_server'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.from'));
    
    funcs.push(awsClient.getParameter('/config/shared/email.outlook'));

    funcs.push(awsClient.getParameter('/config/shared/redis/url'));

    try {
        let results = await Promise.all(funcs);
        const duration = utils.time() - start;
        logger.debug(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);

        if(results) {
            redisUrl = results[5];
            let outlook = results[4];
            if(outlook) {
                emailFrom = outlook.from;
                sesTransport = nodemailer.createTransport({
                    host: outlook.host || 'smtp.office365.com',
                    port:  outlook.port|| 587,     
                    auth: {
                        user: outlook.user,
                        pass: outlook.pass
                    },
                });
            } else {
                const sesAccount = results[0];
                const sesPassword = results[1];
                const sesServer = results[2];
                emailFrom = results[3];
                if(sesAccount && sesPassword && sesServer && emailFrom) {
                    sesTransport = nodemailer.createTransport(`smtps://${encodeURIComponent(sesAccount)}:${encodeURIComponent(sesPassword)}@${sesServer}`);
                } else {
                    logger.warn(`[${SCRIPT_INFO.name}] Email account information missing.`);
                } 
            }
        } else {
            logger.warn(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        logger.error(error);
    }

    ready = typeof(sesTransport) !== 'undefined';
}

const loadTemplates = async () => {
    logger.debug('Loading templates...');
    const start = utils.time();
    await utils.loadTemplates('./templates/emails/', TEMPLATES);
    const duration = utils.time() - start;
    logger.debug(`Templates loaded. ${utils.toFixedPlaces(duration, 2)}ms`);
}

const test = async ()=> {
    console.log('TEST!');
    //utils.beep();
    let data = {
        transaction_id: utils.getUUID(),
        email: 'cisco801@gmail.com',
        name: 'Cisco Caceres',
        subject: 'test',
        body: 'Hello there!',
    };

    Q.getQ(Q.names.handler_email).add(data);
}

(async () => {
    await loadParams();
    if(ready) {
        await loadTemplates();
        if(!SCRIPT_INFO.library_mode) {
            startQueue();
            //test();
        }
    }
})();

module.exports = {
    add,
}