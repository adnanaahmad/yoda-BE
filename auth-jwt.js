'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const logger = require('./logger');
const awsClient = require('./aws-client');
const axios = require('axios');
const fs = require('fs');
const jwt = require("jsonwebtoken");

const jwtBearer = "Bearer ";

const hasUser = (request, reply) => {
    if(request.user) {
        
        return true;
    }
    
}

const getAuth = (request) => {
    try {
        const jwtToken = request.headers.authorization;
        if(!jwtToken) {
            return;
        } 

        if (!jwtToken || jwtToken == null) {
            return;
        }

        let flatToken = jwtToken + "";
        if (flatToken.indexOf(jwtBearer) === 0) {
            flatToken = flatToken.substring(jwtBearer.length);
        }
        let decoded = jwt.verify(flatToken, process.env.JWT);
        if (decoded) {
            decoded.sig = utils.cleanName(flatToken.substring(flatToken.lastIndexOf('.')));
            request.user  = decoded;
        }
    } catch (exp) {
       // throw exp;
       return;
    }
}

module.exports = {
    getAuth,
}