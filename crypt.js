'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const crypto = require('crypto');

let params;
let DEFAULT_KEY;

const getRandomKey = (len = 32) => {
    return crypto.randomBytes(len);
}

const encrypt = (data, key, algorithm = 'aes-256-cbc') => {
    key = key || DEFAULT_KEY;
    const iv = crypto.randomBytes(16);

    if (typeof (data) === 'object') {
        data = JSON.stringify(data);
    }
    
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return {
        iv: iv.toString('base64'),
        algo: algorithm,
        data: encrypted.toString('base64')
    };
}

const decrypt = (data, key) => {

    key = key || DEFAULT_KEY;
    if (!key || !data || typeof (data) !== 'object' | !data.iv || !data.data || !data.algo) {
        return;
    }

    let iv = Buffer.from(data.iv, 'base64');
    let encryptedText = Buffer.from(data.data, 'base64');
    let decipher = crypto.createDecipheriv(data.algo, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]).toString();

    if (utils.isJSON(decrypted)) {
        try {
            let temp = JSON.parse(decrypted);
            if (temp) {
                decrypted = temp;
            }
        } catch (error) {

        }
    }

    return decrypted;
}

(async () => {
    params = await require('./params')('/config/shared/crypt');
    DEFAULT_KEY =  Buffer.from(params.key_001, 'base64');
    //process.env.CRYPT_KEY ? Buffer.from(process.env.CRYPT_KEY, 'base64') : '';
    //let data = encrypt("This is a test");
    //console.log(decrypt(data));
})();

module.exports = {
    encrypt,
    decrypt,
    getRandomKey
}