'use strict';
/*jshint esversion: 8 */

const TABLE = 'equifax-interconnect';
const CONFIG_PATH = '/config/equifax/interconnect-sandbox';

//TODO: Helper function for logger and params
const utils = require('./utils');
const logger = require('./logger').createLogger(TABLE);
utils.setLogger(logger);

let params;
let unit_test_flag = false;

const cache = require('./cache');

const authMain = require('./auth-main');
const oauth2 = require('./auth-oauth2');
const SCRIPT_INFO = utils.getFileInfo(__filename, true, true);
const axios = require('axios');

logger.info(SCRIPT_INFO);

if (!SCRIPT_INFO.host) {
    logger.error('HOST must be defined.');
    process.exit(1);
}

const fastify = require('fastify')({
    logger: false,
    //http2: true,
    trustProxy: true,
    ignoreTrailingSlash: true
})

fastify.register(require('@fastify/static'), {
    root: `${__dirname}/public/${TABLE}`,
    serve: true,
    prefix: '/',
})

const handler = require('./utils-handlers');

const EIDCOMPARE_MAP = {
    'reason': 'FID-IDFS-',
    'ssnaffirm': 'FID-SSNCHK-',
    'FraudIndicator': 'FID-FRAUD-',
    'MatchAssessment': 'FID-MATCHASSMNT-',
    'decision': 'FID-EXPLAIN-',
};

const EIDCOMPARE_DICT = {
    'FID-IDFS-00': 'Application exception either initiated by customer or application',
    'FID-IDFS-01': 'Failed Standard Field Checks.',
    'FID-IDFS-02': "Driver's License Format does not correspond to State of Issue.",
    'FID-IDFS-03': 'SSN/SIN does not meet verification criteria.',
    'FID-IDFS-04': 'Age does not meet verification criteria.',
    'FID-IDFS-05': 'Address Standardization Warning Present for Current Address.',
    'FID-IDFS-06': 'Address Standardization Error Present for Current Address.',
    'FID-IDFS-07': 'Pattern Recognition Match Found.',
    'FID-IDFS-08': 'Area Code does not correspond to State on the Current Address.',
    'FID-IDFS-10': 'Elevated use of Address by different individuals detected.',
    'FID-IDFS-11': 'Moderate use of address by different individuals detected.',
    'FID-IDFS-13': 'High use of Address by different individuals detected.',
    'FID-IDFS-14': 'Elevated use of Address by different individuals detected.',
    'FID-IDFS-16': 'Moderate use of address by different individuals detected.',
    'FID-IDFS-17': 'High use of Address by different individuals detected.',
    'FID-IDFS-22': "Match on the 'Hot Address' database. Address has been associated with reported fraud activity.",
    'FID-IDFS-23': 'Social Security Number issued prior to date of birth.',
    'FID-IDFS-25': 'Warning: Inquiry address is a storage facility.',
    'FID-IDFS-28': 'Warning: Inquiry address is a U.S. post office street address.',
    'FID-IDFS-29': 'Warning: Inquiry address is a campground.',
    'FID-IDFS-31': 'Warning: Inquiry address is a hotel/motel.',
    'FID-IDFS-32': 'Warning: Inquiry address is a mail receiving service.',
    'FID-IDFS-33': 'Fraud Victim Warning present/ Information has been blocked due to identity theft.',
    'FID-IDFS-34': 'Address Standardization Warning Present for Former Address.',
    'FID-IDFS-35': 'Address Standardization Error Present for Former Address.',
    'FID-IDFS-36': 'No verifiable match found on any consumer provided addresses.',
    'FID-IDFS-37': 'Address Standardization Warning Present for Drivers License Address.',
    'FID-IDFS-38': "Address Standardization Error Present for Driver's License Address.",
    'FID-IDFS-39': 'Inquiry Address does not match to primary data source. In cases of California addresses it accommodates compliance with California Law AB 655.',
    'FID-IDFS-3A': 'The current address is a PO Box Address.',
    'FID-IDFS-3B': 'The former address is a PO Box Address.',
    'FID-IDFS-3C': "The driver's license address is a PO Box Address.",
    'FID-IDFS-3D': 'The current address is a military PO Box Address.',
    'FID-IDFS-3E': 'The former address is a military PO Box Address.',
    'FID-IDFS-3F': "The driver's license address is a military PO Box Address.",
    'FID-IDFS-42': 'Primary data source not available.',
    'FID-IDFS-43': 'First Name not validated.',
    'FID-IDFS-44': 'Last Name not validated.',
    'FID-IDFS-45': 'No identity located or poor match on primary data source.',
    'FID-IDFS-47': 'Social Security number not validated.',
    'FID-IDFS-48': 'Identity located on primary data source - good match.',
    'FID-IDFS-49': 'Date of Birth not validated.',
    'FID-IDFS-4F': 'First Name is validated.',
    'FID-IDFS-4L': 'Last Name is validated.',
    'FID-IDFS-4M': 'Last 4 Digits of Social Security Number is Validated.',
    'FID-IDFS-4N': 'Date of Birth is validated.',
    'FID-IDFS-4P': 'Partial Social Security Number is Validated.',
    'FID-IDFS-4S': 'Social Security Number is validated.',
    'FID-IDFS-51': 'Identity located on primary data source - adequate match.',
    'FID-IDFS-53': 'Consumer requested security freeze B92- information not available on primary data source.',
    'FID-IDFS-54': 'Identity located on primary data source - possible match.',
    'FID-IDFS-57': 'Tertiary database unavailable.',
    'FID-IDFS-60': 'Identity not located or poor match on tertiary data source.',
    'FID-IDFS-63': 'Identity located on tertiary data source - Good match.',
    'FID-IDFS-64': 'Phone number not validated.',
    'FID-IDFS-66': 'Identity located on tertiary data source - Adequate match.',
    'FID-IDFS-69': 'Identity located on tertiary data source - Possible match.',
    'FID-IDFS-6P': 'Phone Number is validated.',
    'FID-IDFS-72': 'Secondary data source unavailable.',
    'FID-IDFS-75': 'Identity not located or poor match on secondary data source.',
    'FID-IDFS-78': 'Identity located on secondary data source - Good match.',
    'FID-IDFS-81': 'Identity located on secondary data source - Adequate match.',
    'FID-IDFS-82': "Driver's License number not validated.",
    'FID-IDFS-84': 'Identity located on secondary data source - Possible match.',
    'FID-IDFS-85': 'Social Security number has never been issued by the Social Security Administration or was issued after June 2011.',
    'FID-IDFS-86': 'WARNING: Social Security Number has been reported misused. Thorough verification suggested.',
    'FID-IDFS-87': 'WARNING: Inquiry address has been associated with more than one name or Social Security Number. Thorough verification suggested.',
    'FID-IDFS-88': 'WARNING: Inquiry address is a post office or check cashing facility.',
    'FID-IDFS-89': 'WARNING: Inquiry address is a campground or hotel/motel. Thorough verification suggested.',
    'FID-IDFS-90': 'WARNING: Social Security Number is issued to a person who has been reported deceased.',
    'FID-IDFS-92': 'WARNING: Social Security Number issued by the Social Security Administration within the last five years.',
    'FID-IDFS-93': 'WARNING: Inquiry address is a state/federal prison or detention facility. Thorough verification suggested.',
    'FID-IDFS-94': 'Your inquiry did not result in any phone or address or SSN warnings.',
    'FID-IDFS-96': 'WARNING: Telephone number is a telephone drop number.',
    'FID-IDFS-97': 'Fraud Warning Data source is unavailable.',
    'FID-IDFS-98': 'WARNING: Inquiry address has been reported misused. Thorough verification suggested.',
    'FID-IDFS-A1': 'WARNING: Inquiry address is listed as a multi dwelling unit.',
    'FID-IDFS-A6': "Verifiable match found on consumer's current address.",
    'FID-IDFS-A7': "Verifiable match found on consumer's former address.",
    'FID-IDFS-A8': "Verifiable match found on consumer's Driver's License address.",
    'FID-IDFS-AA': 'WARNING: Possible Individual Taxpayer Identification Number (ITIN). Thorough verification suggested.',
    'FID-IDFS-AR': "Inquiry address is not associated with this consumer's name.",
    'FID-IDFS-AU': 'Inquiry address is unverifiable.',
    'FID-IDFS-AW': 'Inquiry address is listed as a non-residential address.',
    'FID-IDFS-F3': 'Primary data source blocked for security reasons.',
    'FID-IDFS-FA': 'Input Address(es) (including current and former) did not match to any of the addresses contained in the primary data source.',
    'FID-IDFS-FH': 'Information from your inquiry has been identified as potentially fraudulent or misused.',
    'FID-IDFS-FL': 'Fraud victim alert present in database.',
    'FID-IDFS-FN': 'Military Duty Alert. Manual review strongly advised.',
    'FID-IDFS-FT': 'California Resident Fraud Victim. Manual review strongly advised.',
    'FID-IDFS-FV': "Fraud Victim 'Temporary Fraud Alert.' Manual review strongly advised.",
    'FID-IDFS-G7': 'WARNING: Unable to perform SSN validation due to insufficient SSN input.',
    'FID-IDFS-G8': 'WARNING: Unable to perform telephone validation due to insufficient telephone input.',
    'FID-IDFS-GU': 'WARNING: Fraud Warning Data source is unavailable.',
    'FID-IDFS-PY': 'WARNING: Inquiry telephone number listed as a commercial phone.',
    'FID-IDFS-S4': 'Last 4 Digits Of Social Security Number not validated.',
    'FID-IDFS-S9': 'WARNING: Inquiry SSN is invalid. Inquiry SSN is invalid. Thorough verification suggested.',
    'FID-IDFS-SQ': 'Inquiry SSN reported as deceased and last name does not match.',
    'FID-IDFS-T0': 'Area code does not correspond to input phone number exchange.',
    'FID-IDFS-T1': 'Inquiry phone number is a land line.',
    'FID-IDFS-T2': 'Inquiry phone number is a mobile / cellular phone service.',
    'FID-IDFS-T3': 'Inquiry phone number is a paging service.',
    'FID-IDFS-T4': 'Inquiry phone number is a mobile radio service.',
    'FID-IDFS-T5': 'Inquiry phone number cannot be classified.',
    'FID-IDFS-VC': 'Sports or Media or other Celebrity / Personality.',
    'FID-IDFS-VG': 'Known Political Candidate or other Government Official.',
    'FID-IDFS-VH': 'High Profile Political Personality.',
    'FID-SSNCHK-VALID': 'SSN is valid and belongs to this consumer only.',
    'FID-SSNCHK-MISMATCH': 'SSN does not necessarily belong to this identity.',
    'FID-SSNCHK-UNAVAIL': 'SSN was not provided on input or input data was a partial match.',
    'FID-SSNCHK-EXCEPT': 'SSN Affirm could not be processed.',
    'FID-FRAUD-VERIFIED': 'No fraud warning.',
    'FID-FRAUD-WARNING': 'Fraud warning.',
    'FID-FRAUD-VICTIM': 'Fraud victim.',
    'FID-FRAUD-BOTH': 'Fraud victim and warning indicated.',
    'FID-FRAUD-EXCEPT': 'Fraud Check could not be processed.',
    'FID-MATCHASSMNT-0': 'Name and address cannot be verified on any data source.',
    'FID-MATCHASSMNT-A': 'Name and address matches on all data sources.',
    'FID-MATCHASSMNT-B': 'Name and address verified on primary and secondary data sources.',
    'FID-MATCHASSMNT-C': 'Name and address verified on primary and tertiary data source.',
    'FID-MATCHASSMNT-D': 'Name and address verified on primary data source.',
    'FID-MATCHASSMNT-E': 'Name and address verified on secondary and tertiary data sources.',
    'FID-MATCHASSMNT-F': 'Name and address verified on secondary data source.',
    'FID-MATCHASSMNT-G': 'Name and address verified on tertiary data source.',
    'FID-EXPLAIN-Y': 'Equifax verified this applicant.',
    'FID-EXPLAIN-N': 'Equifax was unable to verify this person.',
    'FID-EXPLAIN-R': 'Equifax was unable to decide due to insufficient information.',
};

const AMLCONNECT_STATUS = 'FID-AML-STATUS';

const SYNTHETICID_MAP = {
    finalAssessment: 'FID-SFID-FINAL-ASSESSMENT-FLAG',
    assessmentLevel: 'FID-SFID-ASSESSMENT-LEVEL',
    sharedSsn: 'FID-SFID-SHARED-SSN-FLAG',
    invalidSsn: 'FID-SFID-INVALID-SSN-FLAG',
    verifiedSsn: 'FID-SFID-VERIFIED-SSN-FLAG',
    deathMasterHit: 'FID-SFID-DEATHMASTER-HIT-FLAG',
    auv: 'FID-SFID-AUTHORIZED-USER-VELOCITY-FLAG',
    idDiscrepancy: 'FID-SFID-ID-DISCREPANCY-FLAG',
    activeAuthUsers: 'FID-SFID-ACTIVE-AUTHORIZED-USERS',
    terminatedUsers: 'FID-SFID-TERMINATED-USERS',
    idcb: 'FID-SFID-ID-CONFIRMATION-BEHAVIOR-FLAG',
    sharedAddress: 'FID-SFID-SHARED-ADDRESS-FLAG',
    identityConfirmation1: 'FID-SFID-ID-CONFIRMATION-FLAG-1',
    identityConfirmation2: 'FID-SFID-ID-CONFIRMATION-FLAG-2',
    inquiry: 'FID-SFID-INQUIRY-FLAG',
};

const doOPAL = async (data) => {

    let response = {service_name: data.service_name};
    if (data.http_status_code) response.http_status_code = data.http_status_code;

    // Error
    if (data.error) {
        response.error = data.error;
        return response;
    }

    response.transaction_id = data.transaction_id;
    response.response_time = data.response_time;

    let details = [];

    // eidcompare
    if (response.service_name == 'eidcompare') {

        // details
        const veri_proof = data.applicants.primaryConsumer.equifaxUsIdfs.equifaxUSIDFS.InitialResponse.productResponses.identityVerificationAndProofing;

        // reason (idfs)
        const reasons = veri_proof.reason;
        if (reasons && reasons.length > 0) {
            for (const i in reasons) {
                const reason_code = EIDCOMPARE_MAP['reason'] + reasons[i].code;
                if (Object.keys(EIDCOMPARE_DICT).includes(reason_code)) {
                    details.push({detail_code: reason_code, detail_message: EIDCOMPARE_DICT[reason_code]});
                }
            }
        }

        // ssnaffirm
        const ssnaffirm_code = EIDCOMPARE_MAP['ssnaffirm'] + veri_proof.identityVerification.verificationAssessment.ssnaffirm;
        if (Object.keys(EIDCOMPARE_DICT).includes(ssnaffirm_code)) {
            details.push({detail_code: ssnaffirm_code, detail_message: EIDCOMPARE_DICT[ssnaffirm_code]});
        }

        // FraudIndicator & MatchAssessment
        const assessments = veri_proof.identityVerification.verificationAssessment.detail;
        if (assessments && assessments.length > 0) {
            for (const i in assessments) {
                const assessment_code = EIDCOMPARE_MAP[assessments[i].name] + assessments[i].value;
                if (Object.keys(EIDCOMPARE_DICT).includes(assessment_code)) {
                    details.push({detail_code: assessment_code, detail_message: EIDCOMPARE_DICT[assessment_code]});
                }
            }
        }

        // decision (explain)
        const decision_code = EIDCOMPARE_MAP['decision'] + veri_proof.decision;
        if (Object.keys(EIDCOMPARE_DICT).includes(decision_code)) {
            details.push({detail_code: decision_code, detail_message: EIDCOMPARE_DICT[decision_code]});
        }

    // amlconnect
    } else if (response.service_name == 'amlconnect') {

        // details
        const person_results = data.applicants.primaryConsumer.equifaxUsAmlconnect.equifaxUsAmlconnect.return.personResult;
        if (person_results && person_results.length > 0) {
            for (const i in person_results) {

                // status
                const status = person_results[i].status;
                if (status != 'check') status = 'inconspic';
                details.push({detail_code: AMLCONNECT_STATUS, detail_message: String(status).charAt(0).toUpperCase() + String(status).substring(1)});

                // aml_match_list
                const matches = person_results[i].personDetailResult.listMatches;
                if (matches && matches.length > 0) {
                    let aml_match_list = [];

                    for (const i in matches) {
                        aml_match_list.push({score: matches[i].score, watchlist_data: matches[i].watchListData});
                    }
                    response.aml_match_list = aml_match_list;
                }
            }
        }

    // syntheticid
    } else if (response.service_name == 'syntheticid') {

        // details
        const flags = data.applicants.primaryConsumer.equifaxUsSyntheticID.equifaxUsSyntheticID.flags;
        Object.keys(flags).forEach(key => {
            if (Object.keys(SYNTHETICID_MAP).includes(key)) {
                details.push({detail_code: SYNTHETICID_MAP[key], detail_message: flags[key]});
            }
        });
    }

    response.details = details;
    return response;
}

const doRequest = async (data, customer_id, service_name) => {

    const url = String(params.url).replace("{service_code}", service_name);
    logger.info(url);

    //TODO: check to make sure the access token is ready; repeat otherwise.
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oauth2.getToken(TABLE)}`,
    };

    const options = {
        method: 'post',
        url: url,
        headers,
        data,
        timeout: 10000,
        maxContentLength: Infinity
    };

    let response = {};
    try {
        let start_time = new Date().getTime();
        const res = await axios(options);

        if (res.data) {
            response = res.data;
            response.response_time = new Date().getTime() - start_time;
            response.http_status_code = res.status;
            response.service_name = service_name;
            //response.customer_id = customer_id;
        }

    } catch (error) {
        if (error.response) {
            response.http_status_code = error.response.status;
            response.error = error.response.data;
        } else {
            response.error = 'Unable to receive response from data provider';
        }
    }
    return await doOPAL(response);
}

fastify.post('/query', async (request, reply) => {

    /*
    if (!unit_test_flag) {
        if (!await authMain.checkHeaders(request, reply)) {
            return;
        }
    }
    */

    const body = utils.flattenObject2(request.body);

    let code = 200;
    let data = {}; //{created: Date.now(),};

    if (body) {

        // Required Properties
        // Services
        body.services = request.body.services;
        if (!check_required(body.services, reply, 'services')) return;
        for (var i=0; i < body.services.length; i++) delete body[i.toString()];

        // Transaction ID
        if (!check_required(body.transaction_id, reply, 'transaction_id')) return;

        // Persona
        if (!check_required(body.persona, reply, 'persona')) return;

        // Identity
        if (!check_required(body.first_name, reply, 'first_name')) return; // first_name
        if (!check_required(body.last_name, reply, 'last_name')) return; // last_name

        // Identity - address
        if (!check_required(body.line1, reply, 'line1')) return;
        if (!check_required(body.city, reply, 'city')) return;
        if (!check_required(body.state, reply, 'state')) return;

        // Required if partially filled
        if (check_input(body.license_number) || check_input(body.issuing_state)) {
            if (!check_required(body.license_number, reply, 'license_number')) return;
            if (!check_required(body.issuing_state, reply, 'issuing_state')) return;
        }

        // Digits Check - social_security_number
        if (check_input(body.social_security_number)) {
            body.social_security_number = body.social_security_number.toString().replace(/-/g, '');
            if (!check_max_digits(body.social_security_number, reply, 'social_security_number', 9)) return;
        }

        // Digits Check - phone_number
        if (check_input(body.phone_number)) {
            body.phone_number = body.phone_number.toString();
            if (!check_max_digits(body.phone_number, reply, 'phone_number', 10)) return;
        }

        // Digits Check - zip_code 
        if (check_input(body.zip_code)) {
            body.zip_code = body.zip_code.toString();
            if (!check_max_digits(body.zip_code, reply, 'zip_code', 5)) return;
        }

        try {
            let personal_information = {
                name: [{
                    firstName: body.first_name, // required
                    lastName: body.last_name, // required
                    middleName: check_input(body.middle_name)? body.middle_name : '',
                }],
                socialSecurityNumber: check_input(body.social_security_number)? body.social_security_number : '',
                dateOfBirth: check_input(body.birth_date)? utils.formatDate(body.birth_date, 'YYYY-MM-DD') : '',
                emailAddress: check_input(body.email_address)? body.email_address : '',
                driverLicense: check_input(body.license_number)? body.license_number : '',
                phoneNumbers: [{
                    telephoneNumber: check_input(body.phone_numbe)? body.phone_number : '',
                }],
                addresses: [{
                    addressLine1: body.line1,
                    addressLine2: check_input(body.line2)? body.line2 : '',
                    city: body.city, // required
                    state: body.state, // required
                    zip: check_input(body.zip_code)? body.zip_code : '',
                }],
            };
            if (check_input(body.ip_address)) personal_information.ipAddress = body.ip_address;

            const payload = {
                organization: params.organization, // required
                applicants: { // required
                    primaryConsumer: { // required
                        personalInformation: personal_information // required
                    }
                }
            };

            const requests = [];
            for (const i in body.services) {
                if (params.service_codes.includes(body.services[i])) {
                    requests.push(doRequest(payload, `${body.persona}:${body.transaction_id}`, body.services[i]));
                }
            }
            data = Promise.all(requests);
            code = 200;
        } catch (error) {
            logger.error(error);
        }
    } else {
        code = 422;
        data.error = 'Missing parameter';
    }

    reply.type('application/json').code(code);
    return data;
})

const check_digits = (prop) => {
    if (prop.match(/^\d+$/)) {
        return true;
    }
    return false;
}

const check_max_digits = (prop, reply, name, digits) => {
    if (!check_digits(prop) || prop.length > digits) {
        reply.type('application/json').code(400).send({errorCode: 400, message: `Incorrect digit attibute: ${name}`});
        return false;
    }
    return true;
}

const check_input = (prop) => {
    if (prop && typeof(prop) !== 'undefined') {
        return true;
    }
    return false;
}

const check_required = (prop, reply, name) => {
    if (!check_input(prop)) {
        reply.type('application/json').code(400).send({errorCode: 400, message: `Missing mandatory attibute: ${name}`});
        return false;
    }
    return true;
}

const start = async () => {
    params = await require('./params')(CONFIG_PATH, logger, true);
    params.service_codes = String(params.service_codes).split(',');

    oauth2.addRequest(TABLE, params.token_url, params.client_id, params.client_secret, params.scope, params.grant_type);
    await oauth2.start();
    
    utils.addFastifyConfig(fastify, SCRIPT_INFO);

    fastify.listen({ port: params.port }, (err, address) => {
        if (err) throw err
        logger.info(`HTTP server is listening on ${address}`);
    });

    await handler.init();
}

const test = async () => {
    unit_test_flag = true;

    const payload = {
        transaction_id: "abc12345-d123-e123-f123-ghij12345678",
        persona: "PERSONA1",
        services: ["eidcompare", "amlconnect", "syntheticid"],
        identity: {
            first_name: "ROSE",
            last_name: "SMITH",
            middle_name: "D",
            social_security_number: "000000000",
            birth_date: "08-19-1951",
            email_address: "test@test.com",
            phone_number: "7165551212",
            address: {
                line1: "APT 963, Galactic Universe",
                line2: "",
                city: "Atlanta",
                state: "GA",
                zip_code: "30004",
            },
            driver_license: {
                license_number: "A1234567",
                issuing_state: "NV",
                expiration_date: "2025-01-01",
            },
        },
    };
    fastify.inject({
        method: 'post',
        url: '/query',
        //query: {},
        payload: payload,
        headers: {'content-type': 'application/json'}
    }).then(response => {
        let code200 = 0;
        const res = JSON.parse(response.payload);
        const count3 = res.length;
        if (count3 > 0) {
            for (const i in res) {
                if (res[i].http_status_code == 200) code200++;
            }
            if (count3 == code200) logger.info(`Tested Successfully: ${count3} Services`);
        } else {
            logger.info('Test Failed');
        }
        logger.info(res);
    })
}

(async () => {
    await start();
    //await test();
})();
