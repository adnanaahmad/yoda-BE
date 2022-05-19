'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const logger = require('./logger').createLogger('plaid');
utils.setLogger(logger);

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
let client;
let plaid_params = {};
const DAYS_REQUESTED = 365 * 2 + 1; // maximum days: 731

// Create Link Token
const createLinkToken = async (transaction_id) => {
    const config = {
        user: {
          client_user_id: transaction_id, // a unique current user id
        },
        client_name: 'Plaid Service',
        products: plaid_params.plaid_products,
        country_codes: plaid_params.plaid_country_codes,
        language: 'en',
        redirect_uri: plaid_params.plaid_redirect_uri,
        webhook: plaid_params.plaid_webhook,
    };
    if (!plaid_params.android_package_name) {
        config.android_package_name = plaid_params.android_package_name;
    }

    try {
        const response = await client.linkTokenCreate(config);
        return response.data;
    } catch (error) {
        let err = formatError(error.response);
        logger.error(err);
        return err;
    }
}

// Get Access Token
const getAccessToken = async (public_token) => {
    const config = { public_token: public_token };
    try {
        const response = await client.itemPublicTokenExchange(config);
        return response.data;
    } catch (error) {
        let err = formatError(error.response);
        logger.error(err);
        return err;
    }
}

// Get ACH
const getAch = async (access_token) => {
    const config = { access_token: access_token };
    try {
        const response = await client.authGet(config);
        return response.data;
    } catch (error) {
        let err = formatError(error.response);
        logger.error(err);
        return err;
    }
}

// Get Asset Report Token - Not in use (yet)
const getAssetReportToken = async (access_token) => {
    const options = {
        client_report_id: '123',
        webhook: plaid_params.plaid_webhook,
        user: {
            client_user_id: '7f57eb3d2a9j6480121fx361',
            first_name: 'Jane',
            middle_name: 'Leah',
            last_name: 'Doe',
            ssn: '123-45-6789',
            phone_number: '(555) 123-4567',
            email: 'jane.doe@example.com',
        },
    };
    const config = {
        access_tokens: [access_token],
        days_requested: DAYS_REQUESTED,
        options,
    };
    try {
        const response = await client.assetReportCreate(config);
        return response.data;
    } catch (error) {
        let err = formatError(error.response);
        logger.error(err);
        return err;
    }
}

// Get Assets - Not in use (yet)
const getAssets = async (asset_report_token) => {
    const config = {
        asset_report_token: asset_report_token,
        include_insights: true,
    };
    try {
        const response = await client.assetReportGet(config);
        return response.data;
    } catch (error) {
        let err = formatError(error.response);
        logger.error(err);
        return err;
    }
}

const formatError = (error) => {
    return {
        error: { ...error.data, status_code: error.status },
    };
};

/*
params
* plaid_env: e.g. sandbox
* plaid_client_id:
* plaid_secreet:
* app_port: e.g. 8000
* plaid_products: e.g. auth,transactions
* plaid_country_codes: e.g. US,CA
* plaid_redirect_uri: must be configured in the developer dashboard (e.g. http://localhost:3000/)
* plaid_webhook:
* plaid_android_package_name:
*/
const init = async (params) => {
    const configuration = new Configuration({
        basePath: PlaidEnvironments[params.plaid_env],
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': params.plaid_client_id,
                'PLAID-SECRET': params.plaid_secret,
                'Plaid-Version': params.plaid_version, // '2020-09-14',
            },
        },
    });
    client = new PlaidApi(configuration);
    plaid_params.plaid_products = String(params.plaid_products).split(',');
    plaid_params.plaid_country_codes = String(params.plaid_country_codes).split(',');
    plaid_params.plaid_redirect_uri = params.plaid_redirect_uri;
    plaid_params.plaid_webhook = params.plaid_webhook;
    if (params.android_package_name !== '') {
        plaid_params.android_package_name = params.android_package_name;
    }
}

(async () => {
})();

module.exports = {
    init,
    createLinkToken,
    getAccessToken,
    getAch,
    getAssetReportToken,
    getAssets,
}
