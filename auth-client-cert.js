'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const pem = require('pem-file');
const awsClient = require('./aws-client');

const getAuthz = async (certId)=> {
    if(!certId) {
        return;
    }

    let params = {
        TableName: "USER_AUTHZ_TABLE",
        KeyConditionExpression: "#cert_id = :cert_id",
        ExpressionAttributeNames: {
            "#cert_id": "CertificateID"
        },
        ExpressionAttributeValues: {
            ":cert_id": certId
        }
    };

    let results = await awsClient.docQuery(params);
    if (results && results.Count > 0) {
        return results.Items[0];
    }
}


const checkHeaders = async (request)=> {
    try {
        let cert = request.headers['x-client-cert'];
        if(cert && cert.length > 0) {
            cert = decodeURIComponent(cert);
            cert = pem.decode(cert);
            if(cert) {
                let certId = utils.hash(cert, 'sha256', 'hex').toUpperCase();
                //request.user = certId;
                request.user = await getAuthz(certId);
                //console.log(request.user);
            }
        }
    } catch (error) {
        
    }
}

module.exports = {
    checkHeaders,
    getAuthz
}