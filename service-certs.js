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
const awsClient = require('./aws-client');
const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

let caCert;
let caKey;

const pem = require('pem-file');
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

const createCustomer = async (hash, subject, expiration, ip) => {
    const customer_id = utils.getUUID();
    const ips = [];

    if(ip && ip.length > 0 && !ip.startsWith("0.0.0.0")) {
        ips.push(ip);
    }

    const data = {
        "CertificateID": hash,
        "UserID": 1234,
        "CustomerAccountID": customer_id,
        "Subject": subject,
        "Expiration": expiration,
        "AdminState": 1,
        "Statistics": {
            "requests_good": 0,
            "responses_error": 0,
            "responses_good": 0,
            "requests_error": 0
        },
        "RateLimit": {
            "credits_available": 10,
            "credits_add_per_minute": 10,
            "credits_max": 10
        },
        "IpPrefixPermitList": ips,
        "OpalAlgorithmGUIDPermitTable": {
            "BUSINESS-INSIGHTS": [
                "urn:com:fortifid:algorithm:business_insights"
            ],
            "IDV": [
                "urn:com:fortifid:algorithm:idfsonly",
                "urn:com:fortifid:algorithm:idv"
            ],
            "CONSUMER-INSIGHTS": [
                "urn:com:fortifid:algorithm:consumer_insights"
            ],
            "INCOME-INSIGHTS": [
                "urn:com:fortifid:algorithm:income_insights",
                "urn:com:fortifid:algorithm:directid"
            ],
            "IPADDR": [
                "urn:com:fortifid:algorithm:geo"
            ]
        },
        "Expiration": expiration,
        "Subject": subject
    };

    let results = await awsClient.putDDBItem("USER_AUTHZ_TABLE", data);

    return customer_id;
}

fastify.post('/generate-cert', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    let body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'success'
    };

    if (body && body.csr) {
        let ip = body.ip_address;
        const csrPem = body.csr;
        try {
            const csr = forge.pki.certificationRequestFromPem(csrPem);
            if (csr.verify()) {
                //console.log('Certification request (CSR) verified.');
                //console.log(csr.subject);

                //console.log('Creating certificate...');
                const cert = forge.pki.createCertificate();
                //TODO!
                cert.serialNumber = '02';
                //cert.setSubject(csr.subject);

                cert.setSubject(csr.subject.attributes);
                cert.setIssuer(caCert.subject.attributes);
                cert.publicKey = csr.publicKey;
                cert.validity.notBefore = new Date();
                const expiration = new Date(cert.validity.notBefore);
                expiration.setDate(expiration.getDate() + 375);
                cert.validity.notAfter = expiration;
                //cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
                const subject = csr.subject.attributes
                    .map(attr => [attr.shortName, attr.value].join('='))
                    .join(', ');

                cert.setExtensions([{
                    name: 'basicConstraints',
                    endEntity: true,
                }, {
                    name: 'keyUsage',
                    //keyCertSign: true,
                    digitalSignature: true,
                    //nonRepudiation: true,
                    //keyEncipherment: true,
                    //dataEncipherment: true
                },
                {
                    name: 'nsCertType',
                    client: true
                },
                {
                    name: 'subjectKeyIdentifier',

                },
                {
                    name: 'authorityKeyIdentifier',

                },
                {
                    name: 'extKeyUsage',
                    clientAuth: true
                }
                    // {
                    //     name: 'subjectAltName',
                    //     altNames: [{
                    //         type: 6, // URI
                    //         value: 'http://example.org/webid#me'
                    //     }]
                    // }
                ]);

                cert.sign(caKey, forge.md.sha256.create());
                //console.log('Certificate created.');

                //data.attributes = csr.subject.attributes;
                data.cert = forge.pki.certificateToPem(cert);
                //data.hash = cert.subject.hash;
                let temp = pem.decode(data.cert);
                //Nov 8 21:13:26 2022 GMT
                //data.start = utils.formatDate(cert.validity.notBefore.toISOString(), "MMM D H:mm:ss YYYY") + " GMT";
                //data.x = expiration.toUTCString();
                data.expiration = expiration.toISOString();
                //data.expiration = utils.formatDate(expiration.toUTCString(), "MMM D H:mm:ss YYYY") + " GMT";
                if (temp) {
                    data.hash = utils.hash(temp, 'sha256', 'hex').toUpperCase();
                    data.customer_id = await createCustomer(data.hash, subject, data.expiration, ip);
                }
            } else {
                code = 400;
                data.error = "Signature not verified.";
            }

        } catch (error) {
            code = 400;
            data.error = error.message;
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    reply.type('application/json').code(code);
    return data;
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
    //console.log(__dirname + 'tmp/fortifid-ca.crt');
    //TODO!

    let ca = await awsClient.getSecret("ca");
    //console.log(ca);

    //const caCertPem = await fs.readFile("/etc/nginx/ssl/cert.pem", 'utf8');
    //const caKeyPem = await fs.readFile("/etc/nginx/ssl/key.pem", 'utf8');
    //caCert = forge.pki.certificateFromPem(caCertPem);
    //caKey = forge.pki.privateKeyFromPem(caKeyPem);
    caCert = forge.pki.certificateFromPem(ca.cert);
    caKey = forge.pki.privateKeyFromPem(ca.key);

    //console.log(caKey);
})();