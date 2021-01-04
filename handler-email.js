'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');

const SCRIPT_INFO = utils.getFileInfo(__filename, true);
SCRIPT_INFO.library_mode = require.main !== module;
if(!SCRIPT_INFO.library_mode) {
    console.info(SCRIPT_INFO);
}

const awsClient = require('./aws-client');
const Q = require('./utils-q');
const TEMPLATES = {};
const nodemailer = require('nodemailer');

let sesTransport;
let ready = false;
let emailFrom;


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
                console.log("error is ", error);
                resolve(false); // or use reject(false) but then you will have to handle errors
            } else {
                console.log('email sent: ', info.response);
                resolve(true);
            }
        });

    });
}


const sendEmail = async (email, subject, text, textHTML)=> {
    try {
        return await sendEmailWrapper(email, subject, text, textHTML);
    } catch (error) {
        console.log(errror.message);        
    }
}

const add = async(data)=> {
    if(!ready) {
        //TODO: cache and retry (?)
        return;
    }

    let results;
    try {
        console.log(`[${data.email}] email process started`);
        const start = utils.time();
        if(utils.validateEmail(data.email)) {
            let replacements = data.replacements;
            if(data.template && replacements) {
                let template = TEMPLATES[data.template];
                if(!template) {
                    console.log(data.template, 'not found.');
                    return;
                } 

                data.html = template.replace(/%\w+%/g, (id) => {
                    return replacements[id] || id;
                });
            }

            let email = data.name ? (`${data.name} <${data.email}>`): data.email;
            await sendEmail(email, data.subject, data.body, data.html);
            const duration = utils.time() - start; 
            console.log(`email sent to ${data.email} [${data.subject}] in ${utils.toFixedPlaces(duration, 2)}ms`);
        } else {
            console.log('invalid email:', data.email);
        }
    } catch (error) {
        console.error(error);
        results = error;
    }
    return results;
}

const startQueue = ()=> {
    console.log('Queue handler started.');
    Q.getQ(Q.names.alert_email).process(async (job, done) => {
        done(await add(job.data));
    });
}

const loadParams = async () => {
    //TODO:
    ready = false;
    sesTransport = undefined;

    console.log(`[${SCRIPT_INFO.name}] Loading parameters...`);
    const funcs = [];
    
    
    const start = utils.time();
    
    funcs.push(awsClient.getParameter('/config/shared/email.ses.account'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.password'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.smtp_server'));
    funcs.push(awsClient.getParameter('/config/shared/email.ses.from'));
    
    funcs.push(awsClient.getParameter('/config/shared/email.outlook'));


    try {
        let results = await Promise.all(funcs);
        const duration = utils.time() - start;
        console.log(`[${SCRIPT_INFO.name}] Loaded ${results.length} parameters in ${utils.toFixedPlaces(duration, 2)}ms`);

        if(results) {
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
                    console.log(`[${SCRIPT_INFO.name}] Email account information missing.`);
                } 
            }
        } else {
            console.log(`[${SCRIPT_INFO.name}] Unable to retrieve parameters.`);
        }
    } catch (error) {
        console.log(error.message);
    }

    ready = typeof(sesTransport) !== 'undefined';
}

(async () => {
    await loadParams();
    if(ready) {
        await utils.loadTemplates('./templates/', TEMPLATES);
        if(!SCRIPT_INFO.library_mode) {
            startQueue();
        }
    }
})();

module.exports = {
    add,
}