'use strict';
/*jshint esversion: 8 */
const NAME = 'Certs';
const TABLE = 'certs';
const CONFIG_PATH = `/config/${TABLE}/sandbox`;

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const cache = require('./cache');

const authMain = require('./auth-main');
const oauth2 = require('./auth-oauth2');
const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const forge = require('node-forge');
const {
    promises: fs
} = require("fs");

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('fastify-static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');

fastify.get('/health', (request, reply) => {
    return utils.getHealth(SCRIPT_INFO, false);
})

fastify.get('/info', (request, reply) => {
    return utils.getHealth(SCRIPT_INFO, true);
})

fastify.addHook("onRequest", async (request, reply) => {
    //authJWT.getAuth(request);
})

fastify.addHook('onResponse', async (request, reply) => {

})

const start = async () => {
    try {
        params = await require('./params')(CONFIG_PATH, logger);

        fastify.listen(params.port, (err, address) => {
            if (err) throw err
            logger.info(`HTTP server is listening on ${address}`);
        });

        await handler.init();
    } catch (error) {
        logger.error(error);
    }
}

(async () => {
    await start();
    //const csr = forge.pki.createCertificationRequest();

    const csrPem = `-----BEGIN CERTIFICATE REQUEST-----
    MIICkzCCAXsCAQAwTjELMAkGA1UEBhMCVVMxETAPBgNVBAoMCEZvcnRpZklEMRYw
    FAYDVQQDDA1DaXNjbyBDYWNlcmVzMRQwEgYDVQQLDAtFbmdpbmVlcmluZzCCASIw
    DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAI5mdyB6+IN+iJoUpGMPCvluDVof
    aBqS/5h1VQAX/VfhZBFBriGGEADDh10XL3QPcSOLaB77+E1/Mx/dvMy8oq4A3+33
    wzUFYxDJWe20eJODRjunW0OEXFycBo82FNiPfLns4jUFpDUNqKMuwQ3Xi1Z+eBcM
    WOAArM0BX108j9Y2bkIn7Kw6+cRfmH46iw+bmAQ61stvThOFXu8+Pt7e5UW37xtu
    cvz6fVWvHxFe2PzVJKLV/gEV/6skSTj35vBbdldJO9PEepSfvtaUS9lAK8CVgZsL
    2hT/CqV6zsEGaHq8FxBfLkoMXNMoVwjxhKTNa2CPvB/KBcBcYGfFeR7K4FkCAwEA
    AaAAMA0GCSqGSIb3DQEBCwUAA4IBAQAd50dkohubT6TE7nHFFFv7oy6GG8d28KgH
    /3yOguSHwWzfLeUlnlwFhw+0zAh8d2nYtP/NUgr/aLAgKUkwzNkEa5SQaC+0JQln
    6IvlysXIFxhy7t+IJSh5xEQUki2b6UH+XdjcP3OWlcUZBASRtpXUcvGQIMnqiRj/
    jAzdt46uCeO4o9mH9cySBnAWDAavmwp7DOM78hkRMCGxPzsSxUZnyieePHEufVao
    YAmNP74VcLnWAzCaT2SAtlgRM1fH/+qyFSB5WayHWb8IpRwksBthtsPFwvmMg9Bx
    ATr3iD6ljcqXsrHeuU8MHf5Q4w0++8EMtytzzmlDAqNe2BfXB2TJ
    -----END CERTIFICATE REQUEST-----`;

    var csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) {
        throw new Error('Signature not verified.');
        return;
    }
    console.log('Certification request (CSR) verified.');
    console.log(csr.subject);

    console.log('Creating certificate...');
    var cert = forge.pki.createCertificate();
    cert.serialNumber = '02';
    cert.setSubject(csr.subject);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);


    //const csrBytes = forge.pki.pemToDer(csrPem).getBytes();
    //const csr = forge.pki.certificationRequestFromPem(csrPem);
})();