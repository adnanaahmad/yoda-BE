'use strict';
/*jshint esversion: 8 */

const NAME = 'Document Verification';
const TABLE = 'veriff';

const CONFIG_PATH = '/config/veriff/doc';

const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;

const nameMatch = require('./name-match');
const cache = require('./cache');
const authMain = require('./auth-main');

const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const dayjs = require('dayjs');
const MIN_DATE = dayjs("1/1/1900");
const MAX_DATE = dayjs("1/1/2022");

const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const VALID_IMAGE_NAMES = ['document-back', 'document-front', 'face'];

//
const DEFAULT_URL = `https://${SCRIPT_INFO.host}/v1/doc/?ref=%ID%`;

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/doc`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');
const { add } = require('winston');

const KEYS = {};

const loadParams = async () => {
    params = await require('./params')(CONFIG_PATH, logger, true);
    KEYS[params.client_id] = params.client_secret;
    KEYS[params.client_id_test] = params.client_secret_test;
}

//TODO!
const REASON_MAP = {
    "102": {
        "code": "FID-VERIFF-DECLINE-102",
        "message": "Suspected document tampering."
    },
    "103": {
        "code": "FID-VERIFF-DECLINE-103",
        "message": "Person showing the document does not appear to match document photo."
    },
    "105": {
        "code": "FID-VERIFF-DECLINE-105",
        "message": "Suspicious behaviour."
    },
    "106": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-106",
        "message": "Known fraud"
    },
    "108": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-108",
        "message": "Velocity/abuse duplicated user"
    },
    "109": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-109",
        "message": "Velocity/abuse duplicated device"
    },
    "110": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-110",
        "message": "Velocity/abuse duplicated ID"
    },
    "112": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-112",
        "message": "Restricted IP location"
    },
    "113": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-113",
        "message": "Suspicious behaviour - Identity Farming"
    },
    "200": {
        "code": "FID-VERIFF-RESPONSE-200",
        "message": "Successful response."
    },
    "201": {
        "code": "FID-VERIFF-RESUBMIT-201",
        "message": "Video and/or photos missing."
    },
    "204": {
        "code": "FID-VERIFF-RESUBMIT-204",
        "message": "Poor image quality."
    },
    "205": {
        "code": "FID-VERIFF-RESUBMIT-205",
        "message": "Document damaged."
    },
    "206": {
        "code": "FID-VERIFF-RESUBMIT-206",
        "message": "Document type not supported."
    },
    "207": {
        "code": "FID-VERIFF-RESUBMIT-207",
        "message": "Document expired."
    },
    "400": {
        "code": "FID-VERIFF-RESPONSE-400",
        "message": "Failed Response: Mandatory parameters are missing from the request."
    },
    "401": {
        "code": "FID-VERIFF-RESPONSE-401",
        "message": "Failed Response: Not Authorized."
    },
    "404": {
        "code": "FID-VERIFF-RESPONSE-404",
        "message": "Failed Response: Entry not found."
    },
    "500": {
        "code": "FID-VERIFF-RESPONSE-500",
        "message": "Failed Response: Something went wrong."
    },
    "502": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-502",
        "message": "Multiple parties present in session"
    },
    "503": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-503",
        "message": "Attempted deceit"
    },
    "504": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-504",
        "message": "Attempted deceit, device screen used"
    },
    "505": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-505",
        "message": "Attempted deceit, printout used"
    },
    "507": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-507",
        "message": "Presented document tampered, data cross reference"
    },
    "508": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-508",
        "message": "Presented document tampered, document similarity to specimen"
    },
    "509": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-509",
        "message": "Person showing the document does not match document photo"
    },
    "515": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-515",
        "message": "Attempted deceit, device screen used for face image"
    },
    "526": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-526",
        "message": "Attempted deceit, photos streamed"
    },
    "527": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-527",
        "message": "Unable to collect proof of address data"
    },
    "528": {
        "code": "FID-VERIFF-GRANULAR-DECLINE-528",
        "message": "Proof of address issue date too old"
    },
    "602": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-602",
        "message": "Presented document type not supported"
    },
    "603": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-603",
        "message": "Video missing"
    },
    "605": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-605",
        "message": "Face image missing"
    },
    "606": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-606",
        "message": "Face is not clearly visible"
    },
    "608": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-608",
        "message": "Document front missing"
    },
    "609": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-609",
        "message": "Document back missing"
    },
    "614": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-614",
        "message": "Document front not fully in frame"
    },
    "615": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-615",
        "message": "Document back not fully in frame"
    },
    "619": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-619",
        "message": "Document data not visible"
    },
    "620": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-620",
        "message": "Presented document expired"
    },
    "621": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-621",
        "message": "Document annulled or damaged"
    },
    "625": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-625",
        "message": "Unable to collect surname"
    },
    "626": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-626",
        "message": "Unable to collect first names"
    },
    "627": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-627",
        "message": "Unable to collect date of birth"
    },
    "628": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-628",
        "message": "Unable to collect issue date"
    },
    "629": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-629",
        "message": "Unable to collect expiry date"
    },
    "630": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-630",
        "message": "Unable to collect gender"
    },
    "631": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-631",
        "message": "Unable to collect document number"
    },
    "632": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-632",
        "message": "Unable to collect personal number"
    },
    "633": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-633",
        "message": "Unable to collect nationality"
    },
    "634": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-634",
        "message": "Unable to collect home address"
    },
    "635": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-635",
        "message": "Document and face image missing"
    },
    "641": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-641",
        "message": "Multiple Faces Detected"
    },
    "642": {
        "code": "FID-VERIFF-GRANULAR-RESUBMIT-642",
        "message": "Multiple Documents Uploaded"
    },
    "1001": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1001",
        "message": "Query ID must be between 20 and 40 symbols."
    },
    "1002": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1002",
        "message": "Query ID must be a valid UUID V4"
    },
    "1003": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1003",
        "message": "Query ID must be unique, it has already been used."
    },
    "1102": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1102",
        "message": "Mandatory parameters are missing from the request."
    },
    "1104": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1104",
        "message": "Request includes invalid parameters."
    },
    "1201": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1201",
        "message": "Invalid timestamp. Timestamp must not be older than one hour."
    },
    "1202": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1202",
        "message": "Timestamp format is incorrect. YYYY-MM-DDTHH:MM:S+Timezone Offset|Z or UTC."
    },
    "1203": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1203",
        "message": "Invalid ISO 8601 date. Date needs to be in format YYYY-MM-DD."
    },
    "1301": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1301",
        "message": "Requested features are not supported."
    },
    "1302": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1302",
        "message": "Only HTTPS return URLs are allowed."
    },
    "1303": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1303",
        "message": "Invalid status."
    },
    "1304": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1304",
        "message": "Cannot transition to \"$STATUS\" status."
    },
    "1400": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1400",
        "message": "Image data not found."
    },
    "1401": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1401",
        "message": "Image is not in valid base64."
    },
    "1402": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1402",
        "message": "Image context is not supported."
    },
    "1403": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1403",
        "message": "Image property is missing."
    },
    "1500": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1500",
        "message": "Vendor data cannot be more than 1000 symbols. We require only non-semantic data to be submitted (e.g. UUID-s, etc that can not be resolved or used outside of the vendor environment."
    },
    "1501": {
        "code": "FID-VERIFF-TROUBLESHOOTING-1501",
        "message": "Vendor data must be a string. We require only non-semantic data to be submitted (UUID-s etc that can not be resolved or used outside of the vendor environment)."
    },
    "1801": {
        "code": "FID-VERIFF-AUTH-1801",
        "message": "`Mandatory X-AUTH-CLIENT header containing the API key is missing from the request.`"
    },
    "1802": {
        "code": "FID-VERIFF-AUTH-1802",
        "message": "`API key is not a valid UUID.`"
    },
    "1803": {
        "code": "FID-VERIFF-AUTH-1803",
        "message": "`Integration with the API key was not found.`"
    },
    "1804": {
        "code": "FID-VERIFF-AUTH-1804",
        "message": "`Integration with the API key is not active.`"
    },
    "1812": {
        "code": "FID-VERIFF-AUTH-1812",
        "message": "`Signature is not a valid SHA256 hash.`"
    },
    "1813": {
        "code": "FID-VERIFF-AUTH-1813",
        "message": "`Signature does not match the SHA256 hash of query ID and integration API secret.`"
    },
    "1814": {
        "code": "FID-VERIFF-AUTH-1814",
        "message": "`Signature does not match the SHA256 hash of request body and integration API secret.`"
    },
    "1818": {
        "code": "FID-VERIFF-AUTH-1818",
        "message": "`Signature does not match the HMAC-SHA256 of query ID and integration API secret.`"
    },
    "1819": {
        "code": "FID-VERIFF-AUTH-1819",
        "message": "`Signature does not match the HMAC-SHA256 of request body and integration API secret.`"
    },
    "2003": {
        "code": "FID-VERIFF-TROUBLESHOOTING-2003",
        "message": "Date of birth is not a valid date."
    },
    "2101": {
        "code": "FID-VERIFF-TROUBLESHOOTING-2101",
        "message": "Document number has to be between 6 and 9 characters."
    },
    "2102": {
        "code": "FID-VERIFF-TROUBLESHOOTING-2102",
        "message": "Document number may contain only characters and numbers A-Z, 0-9."
    },
    "2103": {
        "code": "FID-VERIFF-TROUBLESHOOTING-2103",
        "message": "Document type is not supported."
    },
    "2104": {
        "code": "FID-VERIFF-TROUBLESHOOTING-2104",
        "message": "Document from provided country is not supported."
    },
    "9001": {
        "code": "FID-VERIFF-DECISION-9001",
        "message": "Positive: Person was verified. The verification process is complete. Accessing the sessionURL again will show the client that nothing is to be done here."
    },
    "9102": {
        "code": "FID-VERIFF-DECISION-9102",
        "message": "Negative: Person has not been verified. The verification process is complete. Either it was a fraud case or some other severe reason that the person can not be verified. You should investigate the session further and read the \"reason\". If you decide to give the client another try you need to create a new session."
    },
    "9103": {
        "code": "FID-VERIFF-DECISION-9103",
        "message": "Resubmitted: Resubmission has been requested. The verification process is not completed. Something was missing from the client and she or he needs to go through the flow once more. The same sessionURL can and should be used for this purpose."
    },
    "9104": {
        "code": "FID-VERIFF-DECISION-9104",
        "message": "Negative: Verification has been expired. The verification process is complete. After 7 days the session gets expired. If the client started the verification process we reply \"abandoned\" here, otherwise if the client never arrived in our environment the status will be \"expired\""
    },
    "9121": {
        "code": "FID-VERIFF-DECISION-9121",
        "message": "Review: Review status is issued whenever automation engine could not issue a conclusive decision and the verification session needs to be reviewed by a human. This status will be sent depending on service agreement."
    },
    "10001": {
        "code": "FID-VERIFF-SCANNED-NAME-PROVIDED-NAME-MATCH",
        "message": "Name comparison matched."
    },
    "10002": {
        "code": "FID-VERIFF-SCANNED-NAME-PROVIDED-NAME-MISMATCH",
        "message": "Negative: Name comparison mismatch."
    },
    "10003": {
        "code": "FID-VERIFF-SCANNED-STATE-PROVIDED-STATE-MATCH",
        "message": "State comparison matched."
    },
    "10004": {
        "code": "FID-VERIFF-SCANNED-STATE-PROVIDED-STATE-MISMATCH",
        "message": "Negative: State comparison mismatch."
    },
    "10005": {
        "code": "FID-VERIFF-SCANNED-DOB-PROVIDED-DOB-MATCH",
        "message": "DOB comparison matched."
    },
    "10006": {
        "code": "FID-VERIFF-SCANNED-DOB-PROVIDED-DOB-MISMATCH",
        "message": "Negative: DOB comparison mismatch."
    },
    "10010": {
        "code": "FID-VERIFF-VERIFICATION-LINK-EXPIRED",
        "message": "Verification link expired."
    },

}

const getReason = (id) => {
    if (typeof (id) === 'number') {
        id = id.toString();
    }

    let reason = REASON_MAP[id];
    if (reason) {
        return reason;
    }

    return { code: id, message: '' };
}


const getVeriffData = async (payload, method = 'GET', endpoint, output) => {

    let outtype = 0;
    if (output) {
        if (typeof output === 'string') {
            output = path.resolve(__dirname, 'images', output);
            outtype = 1;
        } else if (typeof output === 'object') {
            outtype = 2;
        }
    }

    if (payload.constructor === Object) {
        payload = JSON.stringify(payload);
    }

    if (payload.constructor !== Buffer) {
        payload = new Buffer.from(payload, 'utf8');
    }

    //TODO
    const signature = crypto
        .createHmac('sha256', params.client_secret)
        .update(Buffer.from(payload, 'utf8'))
        .digest('hex')
        .toLowerCase();

    const options = {
        method,
        url: `https://stationapi.veriff.com/v1${endpoint}`, //TODO: add this to param store
        headers:
        {
            'content-type': 'application/json',
            'x-hmac-signature': signature,
            'x-auth-client': params.client_id
        }
    };

    if (output) {
        options.responseType = 'stream';
    }


    let response = await axios(options);
    if (output) {
        if (outtype === 2) {
            output.send(response.data);
        } else {
            response.data.pipe(fs.createWriteStream(output));
        }

        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                resolve(true);
            })

            response.data.on('error', () => {
                reject()
            })
        })
    } else {
        return response.data;
    }

}

const verifySignature = (request, reply) => {
    // TODO! https://developers.veriff.com/#handling-security
    const auth_client = request.headers['x-auth-client'];
    const signature = request.headers['x-signature'];
    if (!auth_client || !signature) {
        logger.info('Authentication required.');
        reply.type('application/json').code(401).send({
            error: 'Authentication required.'
        });
        return;
    }

    const key = KEYS[auth_client];
    if (!key) {
        logger.info('Invalid client ID.');
        reply.type('application/json').code(401).send({
            error: 'Invalid client ID.'
        });
        return;
    }

    if (!request.rawBody || request.rawBody.length < 1) {
        console.log("verifySignature rawBody returned blank.")
        return true;
    }

    const sig = utils.hash(`${request.rawBody}${key}`, 'sha256', 'hex');
    if (sig !== signature) {
        logger.info('Signature mismatch.');
        reply.type('application/json').code(401).send({
            error: 'Signature mismatch.'
        });
        return;
    }
    return true;
}

const getData = (record, data) => {
    try {
        data.status = record.status || record.action;
        if (record.created) {
            data.created = new Date(record.created).toISOString();
        }

        if (record.finished) {
            data.completed = new Date(record.finished).toISOString();
        }

        let expired = false;

        if (record._expiresAt) {
            data.expires_at = new Date(record._expiresAt * 1000).toISOString();
            expired = record._expiresAt < Date.now() / 1000;
        }

        const details = [];
        data.data_provider_details = [{ "name": "Veriff", details }];

        let passed = true;
        record.reason_code = record.reason_code || record.reasonCode;
        if(expired) {
            details.push(getReason(10010));
            data.status = 'expired';
        }else if (record.strict && record.reason_code) {
            if (typeof (record.name_match_score) !== 'undefined') {
                data.name_match_score = record.name_match_score;
                if (data.name_match_score < 0.9) {
                    passed = false;
                }
            } else {
                data.name_match_score = 0;
            }

            details.push(getReason(data.name_match_score > 0.9 ? 10001 : 10002));

            if (typeof (record.dob_match) !== 'undefined') {
                data.dob_match = record.dob_match;
            } else {
                data.dob_match = false;
            }

            details.push(getReason(data.dob_match ? 10003 : 10004));

            if (typeof (record.state_match) !== 'undefined') {
                data.state_match = record.state_match;
            } else {
                data.state_match = false;
            }

            details.push(getReason(data.dob_match ? 10005 : 10006));

            //TODO
            passed = data.name_match_score > 0.9 && data.state_match && data.dob_match;
            if (!passed) {
                data.status = "declined";
            }
        }

        if (record.reason !== null && typeof (record.reason) !== 'undefined') {
            data.reason = record.reason;
        }

        //if (passed) {
        //TODO!
        if (record.reason_code !== null && typeof (record.reason_code) !== 'undefined') {
            data.reason_code = record.reason_code;
            details.push(getReason(record.reason_code));
        }

        if (record.code !== null && typeof (record.code) !== 'undefined') {
            details.push(getReason(record.code));
        }
        //}

        if (record.redirect_url) {
            data.redirect_url = record.redirect_url;
        }

        if (record.request_reference) {
            data.request_reference = record.request_reference;
        }

        if (record.raw_data) {
            data.raw_data = record.raw_data;
        }

        //console.log(data);
    } catch (error) {
        console.error(error.message);
    }
}


const registerRoutes = () => {

    fastify.post('/webhook', async (request, reply) => {

        const now = Date.now();

        if (!verifySignature(request, reply)) {
            return;
        }

        const body = request.body;
        if (body && (body.verification || body.id)) {
            //logger.silly(body);
            try {
                let expiration = '1w';
                let customer_id;
                const v = body.verification;
                const id = v ? v.vendorData : body.vendorData;

                let record = await cache.getP(TABLE, id);

                const data = {};

                if (v) {

                    //This means they're finished.
                    expiration = '10y';
                    data.status = v.status;
                    const person = v.person;
                    data.id = v.id;
                    data.code = v.code;
                    //TODO! They may retry.
                    data.finished = now;

                    if (record && record.created) {
                        data.duration = now - record.created;
                        customer_id = record.customer_id;
                    }

                    //TODO!
                    //technicalData : { ip: '71.64.122.30' }
                    if (v.reason !== null) {
                        data.reason = v.reason;
                    }

                    if (v.reasonCode !== null) {
                        data.reason_code = v.reasonCode;
                    }

                    //if (v.status === 'approved' && person) {
                    if (person) {
                        if (record) {
                            let pii = record.pii;
                            if (pii) {
                                pii = cache.crypt.decrypt(pii);
                                if (pii) {

                                    if (pii.full_name) {
                                        data.name_match_score = nameMatch.compare(`${person.firstName} ${person.lastName}`, pii.full_name, true);
                                    } else {
                                        data.name_match_score = -1;
                                    }

                                    if (pii.dob) {
                                        data.dob_match = utils.sameDate(pii.dob, person.dateOfBirth)
                                    } else {
                                        data.dob_match = false;
                                    }

                                    data.state_match = false;
                                    if (pii.state) {
                                        try {
                                            if (person.addresses && Array.isArray(person.addresses) && person.addresses.length > 0) {
                                                let address = person.addresses[0];
                                                if (address && address.parsedAddress && address.parsedAddress.state !== null) {
                                                    data.state_match = address.parsedAddress.state.toLowerCase() === pii.state.toLowerCase();
                                                }
                                            }
                                        } catch (error) {

                                        }
                                    }

                                    if (record.strict) {
                                        if (!data.dob_match || data.name_match_score < 1 || !data.state_match) {
                                            data.status = 'declined';
                                            data.reason = 'Personal information mismatch.';
                                        }
                                    }

                                    data.pii = null;
                                }
                            }

                            if (record.raw) {
                                let verificationId = v.id;
                                try {
                                    let results = await getVeriffData(verificationId, 'GET', `/sessions/${verificationId}/media`);
                                    if (results && results.status === 'success') {
                                        const images = results.images;
                                        if (Array.isArray(images) && images.length > 0) {
                                            const media = [];
                                            data.raw_data = {};
                                            data.raw_hash = nanoid(32);
                                            for (let index = 0; index < images.length; index++) {
                                                const image = images[index];
                                                try {
                                                    if (VALID_IMAGE_NAMES.indexOf(image.name) > -1) {
                                                        const pid = encodeURIComponent((await utils.hashPassword(`${image.id}${customer_id}${data.raw_hash}`, 1)).substring(7));
                                                        media.push({
                                                            id: image.id,
                                                            name: image.name,
                                                            type: image.mimetype,
                                                            pid
                                                        })
                                                    }
                                                } catch (error) {
                                                    logger.error(error);
                                                }
                                            }
                                            data.raw_data.media = media;
                                        }
                                    }
                                } catch (error) {
                                    logger.error(error);
                                }
                            }
                        }
                    }
                } else {
                    data.updated = now;
                    data.status = body.action;
                    data.id = body.id;
                    data.code = body.code;
                    data.feature = body.feature;
                }

                //logger.silly(data);
                const saved = await cache.updateP(TABLE, id, data, expiration, true);

                if (saved && saved.finished) {
                    const payload = { transaction_id: saved.transaction_id };
                    getData(saved, payload);
                    await authMain.sendWebhook(customer_id, payload, TABLE, handler);
                }
            } catch (error) {
                logger.error(error);
            }
        }

        reply.type('application/json').code(200);

        return {
            service: TABLE
        }
    });
}

//TODO
const processRaw = async (request, reply, id, mediaId, pid) => {

}

fastify.post('/raw', async (request, reply) => {

})

fastify.get('/raw/:id/:media_id/:pid', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }
    const id = request.params.id
    if (id && id.length > 0) {
        const record = await cache.getP(TABLE, id);

        const mediaId = request.params.media_id;;
        let pid = request.params.pid
        if (pid && pid.length > 0) {
            if (pid[0] !== '$') {
                pid = `$2b$04$${pid}`;
            }

            if (pid.length === 59) {
                pid = `${pid}.`;
            }
        }

        if (record && mediaId && mediaId.length > 1 && pid) {
            let passed = record.customer_id === request.user.CustomerAccountID && pid.length === 60;

            if (passed) {
                passed = await utils.comparePassword(`${mediaId}${record.customer_id}${record.raw_hash}`, pid);
            }

            if (!passed) {
                reply.type('application/json').code(401);
                return {
                    message: 'unauthorized',
                    status: 'error'
                };
            }

            try {
                reply.header('Content-Type', 'image/jpeg');
                //reply.header('Content-Disposition', `attachment; filename=${mediaId}.jpg`);
                await getVeriffData(mediaId, 'GET', `/media/${mediaId}`, reply);
            } catch (error) {
                logger.error(error);
                reply.type('application/json').code(500);
                return {
                    message: error.message,
                    status: 'error'
                };
            }
            return;
        }
    }

    let code = 404;
    reply.type('application/json').code(code);
    return {
        status: 'not_found'
    };

})

fastify.get('/check-request/:id', async (request, reply) => {
    const now = Date.now();
    let code = 404;

    const id = request.params.id;
    const data = {
        status: 'not_found'
    };

    //logger.info(request.ip, `check-request ${id}`);

    if (id) {
        if (utils.DEMO) {
            return utils.getTemplateResponse(reply, TEMPLATES, "check-request", id);
        }

        data.transaction_id = id;

        let record = await cache.getP(TABLE, id);

        if (record) {
            code = 200;
            getData(record, data);
        } else {
            data.reason = 'Request not found.'
        }
    } else {
        data.status = 'invalid';
        data.reason = 'Invalid or missing transaction ID.';
        code = 422;
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.post('/generate-url', async (request, reply) => {
    if (!await authMain.checkHeaders(request, reply)) {
        return;
    }

    const body = request.body;
    let code = 200;
    const data = {
        created: Date.now(),
        status: 'declined'
    };

    if (body) {
        //logger.silly(body);
        //TODO: Sanitize body
        //let transaction_id = body.transaction_id || `:${utils.getUUID()}`;
        let send = typeof (body.send) === 'boolean' ? body.send : true;
        let phone_number;
        let email_address;
        //TODO: Cleanup.

        if (send) {
            if (body.phone_number) {
                phone_number = utils.getPhoneNumber(body.phone_number);
                if (!phone_number) {
                    return reply.type('application/json').code(422).send({ code: 422, error: 'Invalid parameter (phone_number)' });
                }

                if (!phone_number.startsWith("+1")) {
                    return reply.type('application/json').code(422).send({ code: 422, error: 'Only US numbers (+1) are currently supported' });
                }
            }

            email_address = body.email_address;
            if (email_address && !utils.validateEmail(email_address)) {
                return reply.type('application/json').code(422).send({ code: 422, error: 'Invalid parameter (email_address)' });
            }

            if (!email_address && !phone_number) {
                return reply.type('application/json').code(422).send({ code: 422, error: 'phone_number or email_address required' });
            }
        }

        let transaction_id = utils.getUUID();

        data.transaction_id = transaction_id;

        let full_name = body.full_name;
        let dob = body.birth_date;
        let state = body.state || '';

        let shorten = typeof (body.shorten_url) === 'boolean' ? body.shorten_url : false;
        let url = typeof (body.link_url) === 'string' && body.link_url.length > 0 ? body.link_url : DEFAULT_URL;
        let text = typeof (body.sms_text) === 'string' && body.sms_text.length > 0 ? body.sms_text : params.sms_text;

        //TODO!
        if (url.indexOf('%URL%') > -1) {
            url = url.replace('%URL%', '%ID%');
        }

        let strict = typeof (body.strict) === 'boolean' ? body.strict : false;
        let raw = typeof (body.raw) === 'boolean' ? body.raw : false;

        let dobData = dayjs(dob);
        if (strict) {
            if (!full_name || !dob || full_name.length < 1 || !dobData.isValid() || dobData.isBefore(MIN_DATE) || dobData.isAfter(MAX_DATE)) {
                return reply.type('application/json').code(422).send({ status: "error", reason: "Valid full_name and birth_date required when strict is true." });
            }
        }

        let expire = "1w";
        if (body.expire && body.expire.length > 0) {
            let tmp = parseInt(body.expire);
            if (tmp < 30 || tmp > 2592000) { //1 month!
                return reply.type('application/json').code(422).send({ status: "error", reason: "expire must be between 30 and 2592000" });
            }
            expire = tmp;
        }

        //TODO! Do this after validation
        data.url = url.replace("%ID%", encodeURIComponent(transaction_id));
        if (shorten) {
            let short = await utils.shortenUrl(data.url);
            data.url = short || data.url;
        }

        if (phone_number) {
            if (utils.DEMO) {
                return utils.getTemplateResponse(reply, TEMPLATES, "generate-url", phone_number);
            }

            let d = {
                transaction_id: transaction_id,
                numbers: phone_number,
                text: utils.parseTemplate(text, {
                    '%URL%': data.url
                })
            };

            handler.twilio(d);
        }

        if (utils.DEMO && code === 200) {
            return utils.getTemplateResponse(reply, TEMPLATES, "generate-url");
        }

        if (email_address && code === 200) {
            let subject = params.email_subject;

            let replacements = {
                "%EMAIL%": email_address,
                "%LINK%": data.url
            };

            let d = {
                transaction_id: transaction_id,
                email: email_address,
                subject: subject,
                template: 'veriff_email',
                replacements: replacements
            };

            if (full_name) {
                d.name = full_name;
            }

            handler.email(d);
        }

        if (code === 200) {
            data.status = send ? 'sent' : 'created';
            let save = {
                created: data.created,
                status: data.status,
                strict,
                raw
            };

            if (strict) {
                save.pii = {};

                if (typeof (dob) === 'string' && dob.length > 0) {
                    save.pii.dob = dob;
                }

                if (typeof (full_name) === 'string' && full_name.length > 0) {
                    save.pii.full_name = full_name;
                }

                if (typeof (state) === 'string' && state.length === 2) {
                    save.pii.state = state.toLowerCase();
                }
            }

            if (request.user) {
                save.customer_id = request.user.CustomerAccountID;
            }

            let redirect_url = body.redirect_url;
            if (typeof (redirect_url) === 'string' && redirect_url.length > 0) {
                save.redirect_url = redirect_url;
            }

            let request_reference = body.request_reference;
            if (typeof (request_reference) === 'string' && request_reference.length > 0) {
                save.request_reference = request_reference;
            }

            if (send) {
                const saved = await cache.setP(TABLE, transaction_id, save, expire, true);
                if (saved && saved._expiresAt) {
                    data.expires_at = new Date(saved._expiresAt * 1000).toISOString();
                }
            }
        } else {
            delete data.transaction_id;
            delete data.url;
        }

    } else {
        code = 422;
        data.error = 'Missing or invalid parameter.';
    }

    if (code !== 200) {
        data.status = 'error';
    }

    if (typeof (data.created) === "number") {
        data.created = new Date(data.created).toISOString();
    }

    reply.type('application/json').code(code);
    return data;
})

fastify.addHook("onRequest", async (request, reply) => {
    //console.log(request.routerPath); 
    //authJWT.getAuth(request);
})

const start = async () => {
    await fastify.register(require('fastify-raw-body'), {
        field: 'rawBody',
        global: false,
        encoding: 'utf8',
        runFirst: true,
        routes: ['/webhook']
    });

    registerRoutes();

    await utils.addFastifyConfig(fastify, SCRIPT_INFO);

    fastify.listen({ port: params.port }, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });
}

(async () => {
    await loadParams();
    start();
    await handler.init(true, true, true);
})();