'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');
const crypto = require('crypto');

let params;
let DEFAULT_KEY;

//This code defines a function getRandomKey that returns a random key of specified len (default 32 bytes) generated using the crypto.randomBytes method.
const getRandomKey = (len = 32) => {
    return crypto.randomBytes(len);
}
// This code defines a function encrypt that takes plaintext data, an encryption key (or uses a default key), and an optional algorithm, and returns an object containing the encrypted data, an initialization vector iv, and the algorithm used for encryption, with the plaintext data encrypted using the specified algorithm and the provided key.
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
// This code defines a function decrypt that takes encrypted data data and a decryption key, and returns the decrypted plaintext data, using the initialization vector and algorithm contained in the encrypted data and verifying the key. It also checks if the decrypted data is in JSON format, and returns the parsed object if it is.
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
// This code initializes the DEFAULT_KEY global variable by retrieving a base64-encoded key from a configuration file, then logs a message to the console indicating that the crypt has been initialized.
(async () => {
    try {
        params = await require('./params')('/config/shared/crypt', undefined, false, true);
        if(params && params.key_001) {
            DEFAULT_KEY =  Buffer.from(params.key_001, 'base64');
            if(DEFAULT_KEY) {
                console.log("Crypt initialized.");
            }
        }
    } catch (error) {
        console.log(error);
    }
    //process.env.CRYPT_KEY ? Buffer.from(process.env.CRYPT_KEY, 'base64') : '';
    //let data = encrypt("This is a test");
    //console.log(decrypt(data));
})();

module.exports = {
    encrypt,
    decrypt,
    getRandomKey
}