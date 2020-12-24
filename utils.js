'use strict';
/*jshint esversion: 8 */

const startTime = Date.now();

const fs = require('fs');
const util = require('util');
const os = require('os');
const crypto = require('crypto');
const parseArgs = require('minimist');
const bcrypt = require('bcrypt');
const BCRYPT_SALT_ROUNDS = 10;
const fetch = require("node-fetch");
const LZUTF8 = require('lzutf8');
require('dotenv').config();

require('console-stamp')(console, {
    format: ':date(yyyy.mm.dd HH:MM:ss.l) :label',
    // datePrefix: '',
    // dateSuffix: '',
    // labelPrefix: '/',
    // labelSuffix: ''
});

const crcTable = [
    0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a, 0x2d,
    0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65, 0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d,
    0xe0, 0xe7, 0xee, 0xe9, 0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd,
    0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1, 0xb4, 0xb3, 0xba, 0xbd,
    0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2, 0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea,
    0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
    0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a,
    0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42, 0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a,
    0x89, 0x8e, 0x87, 0x80, 0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4,
    0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda, 0xd3, 0xd4,
    0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c, 0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44,
    0x19, 0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34,
    0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f, 0x6a, 0x6d, 0x64, 0x63,
    0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b, 0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13,
    0xae, 0xa9, 0xa0, 0xa7, 0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
    0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6, 0xe1, 0xe8, 0xef, 0xfa, 0xfd, 0xf4, 0xf3
];

const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const REGEX_EMAIL = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
//const REGEX_EMAIL = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/; // this locks up the process.
//const REGEX_EMAIL = /\S+@\S+\.\S+/;

const fileExists = util.promisify(fs.exists);
const fileRead = util.promisify(fs.readFile);
const fileWrite = util.promisify(fs.writeFile);
const fileStats = util.promisify(fs.stat);
const dirRead = util.promisify(fs.readdir);

const getMonth = (index, short) => {
    return monthsShort[index];
};

const isUnderPM2 = () => {
    return 'PM2_HOME' in process.env || 'PM2_JSON_PROCESSING' in process.env || 'PM2_CLI' in process.env
};

const mongoObjectId = () => {
    let timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
        return (Math.random() * 16 | 0).toString(16);
    }).toLowerCase();
};

const sha384 = (data) => hash(data, 'sha384');

const hash = (data, algo, encoding, outputLength) => {
    algo = algo || 'sha1';
    encoding = encoding || 'base64'; //"latin1" | "hex" | "base64"
    let options;

    if (typeof (outputLength) === 'number')
        options = {
            'outputLength': outputLength
        };

    let hash = crypto.createHash(algo);
    let hased_data = hash.update(data, 'utf-8');
    return hased_data.digest(encoding);
}

const hashID = (id) => {
    id = id.trim().toLowerCase();
    return hash(id, undefined, 'hex');
}

const hashPassword = async (password) => {
    try {
        let hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        return hash;
    } catch (error) {

    }
}

const comparePassword = async (password, hash) => {
    try {
        const match = await bcrypt.compare(password, hash);
        return match;
    } catch (error) {

    }
}

const parseBoolean = (value) => value !== undefined && (value === 'true');

const getFileInfo = (file, doHash) => {
    const stats = fs.statSync(file);

    //TODO! fileStats
    let info = {
        start: startTime,
        path: file,
        name: getFilename(file),
        created: stats.birthtimeMs,
        modified: stats.mtimeMs,
        size: stats.size,
    };

    if (doHash) {
        info.hash = hash(fs.readFileSync(file, 'utf8'));
    }

    return info;
}

const makeTemplate = (templateString) => {
    return (templateData) => new Function(`{${Object.keys(templateData).join(',')}}`, 'return `' + templateString + '`')(templateData);
}

const parseTemplate = (template, replacements)=> {
    return template.replace(/%\w+%/g, (id) => {
        return replacements[id] || id;
    });
}


const checksum8 = (message, hex) => {
    let c = 0

    hex = hex || false;
    let len = message.length;

    let byte_array = [];

    for (let j = 0; j < len; j++) {
        byte_array.push(message.charCodeAt(j));
    }

    // let byte_array = message.split('').map((x)=> {
    //     return x.charCodeAt(0)
    // });

    //let byte_array = enc.encode(message);
    //console.log(byte_array, bytes);
    len = byte_array.length;
    for (let i = 0; i < len; i++) {
        c = crcTable[(c ^ byte_array[i]) % 256];
    }

    //console.log(c);
    if (hex)
        return ("00" + c.toString(16)).substr(-2);
    else
        return c;
};

const getFileUpdatedDate = (path, asNumber) => {
    const stats = fs.statSync(path);
    let time = stats.mtime;

    return asNumber ? Date.parse(time) : time;
};

const time = () => {
    const [seconds, nanos] = process.hrtime();
    return seconds * 1000 + nanos / 1000000;
};

const timeout = (ms) => new Promise(res => setTimeout(res, ms));

const objectId = () => {
    const secondInHex = Math.floor(new Date() / 1000).toString(16);
    const machineId = crypto.createHash('md5').update(os.hostname()).digest('hex').slice(0, 6);
    const processId = process.pid.toString(16).slice(0, 4).padStart(4, '0');
    const counter = process.hrtime()[1].toString(16).slice(0, 6).padStart(6, '0');

    return secondInHex + machineId + processId + counter;
}

const syncFileTime = (source, dest) => {
    fs.stat(source, (error, stats) => {
        if (error) {
            console.log(error);
            return;
        }
        setFileTime(dest, stats.atime, stats.mtime);
    });
};

const toFixedPlaces = (value, places) => {
    return parseFloat(value.toFixed(places));
}

const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const toArgs = (command) => {
    if (!command)
        return;
    let arr = splitter(command);
    return parseArgs(arr);
}

const cleanSlashes = (text) => {
    if (!text)
        return;
    return text.replace(/\/\/+/g, '/').replace(/\/$/, "");
}

const splitter = (text) => {
    if (!text)
        return;

    //return text.match(/\w+|"(?:\\"|[^"])+"/g);
    return text.match(/("[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'|\/[^\/\\]*(?:\\[\S\s][^\/\\]*)*\/[gimy]*(?=\s|$)|(?:\\\s|\S)+)/g);
}

const randomString = (len) => {
    let s = '';
    const randomchar = () => {
        var n = Math.floor(Math.random() * 62);
        if (n < 10) return n; //1-10
        if (n < 36) return String.fromCharCode(n + 55); //A-Z
        return String.fromCharCode(n + 61); //a-z
    };
    while (s.length < len)
        s += randomchar();
    return s;
};

const randomSrringCrypt = (length) => {
    let initializationVector = crypto.randomBytes(length);
    return initializationVector.toString('base64');
};

const setFileTime = (file, atime, mtime) => {
    mtime = mtime || atime;
    //if (fs.existsSync(file))
    fs.utimes(file, atime, mtime, (error) => {
        if (error)
            console.log(error);
    });
};

const cleanName = (name)=> {
    return name.replace(/[ $.#]+/g, '-');
}

const getValidSubdomain = (subdomain) => {
    if (subdomain === undefined)
        return '';

    subdomain = subdomain.trim().replace(/ {1,}/g, " ");
    //subdomain = subdomain.replace(/ /g, '-');
    subdomain = subdomain.replace(/[ .]+/g, '-');
    let result = subdomain.replace(/[^A-Z0-9-]+/ig, "").replace(/-+$/, "");
    if (result.length < 5) {
        return '';
    }

    if (result.length > 32) {
        result = result.substr(0, 32);
    }

    result = result.toLowerCase();
    return result;
}

const getFilename = (path) => {
    return typeof (path) === 'string' ? path.split("/").pop() : '';
    //filepath.split("\\");
}

const getFilenameWithoutExtension = (path) => {
    return typeof (path) === 'string' ? path.split(".")[0] : '';
    //filepath.split("\\");
}

const geExtension = (path) => {
    return typeof (path) === 'string' ? path.split(".").pop() : '';
    //filepath.split("\\");
}

const deepFind = (obj, path, stop) => {
    let paths = path.split('.'),
        current = obj,
        i;

    let len = paths.length;
    for (i = 0; i < len; ++i) {
        if (current[paths[i]] == undefined) {
            return undefined;
        } else {
            current = current[paths[i]];
            if (stop === current)
                return current;
        }
    }
    return current;
}

const parseNumber = (val) => {
    if (val === undefined)
        return 0;
    let temp = Number(val);
    return temp === null ? 0 : temp;
}

const compressString = (input)=> {
    return LZUTF8.compress(input, {outputEncoding: 'Base64'});
}

const decompressString = (input)=> {
    return LZUTF8.decompress(input,  {outputEncoding: 'String'});
}

const getFields = (source, fields, destination, useHas, noCheck) => {
    if (!source || !fields)
        return;

    destination = destination || {};
    useHas = typeof (useHas) === 'undefined' ? true : useHas;

    fields.forEach(field => {
        if (noCheck) {
            destination[field] = source[field];
        } else if (useHas) {
            if (source.hasOwnProperty(field)) {
                destination[field] = source[field];
            }
        } else {
            if (field in source) {
                destination[field] = source[field];
            }
        }
    });

    return destination;
}

function sendData(res, data, statusCode) {
    statusCode = statusCode || 200;
    let text = data;
    let headers = {
        "Content-Type": "text/html"
    };

    if (typeof (data) === 'object') {
        text = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
    }

    sendMessage(res, statusCode, headers, text);
}

function sendText(res, text, statusCode = 200, contentType = 'text/html') {
    sendMessage(res, statusCode, {
        "Content-Type": contentType
    }, text);
}

const contentTypes = {
    js: 'application/javascript',
    html: 'text/html',
    css: 'text/css',
    txt: 'text/plain',
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    gif: 'image/gif',
    ico: 'image/x-icon',
    bmp: 'image/x-ms-bmp',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};


function sendMessage(res, statusCode, headers, data, cors) {
    try {
        cors = cors || false;
        headers = headers || {};
        if (cors) {
            headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,PATCH,OPTIONS';

            headers['Access-Control-Allow-Origin'] = '*';
        }

        if (headers['Content-Length'] === undefined && data) {
            let len = 0;
            try {
                len = data.length;
                headers['Content-Length'] = len;
            } catch (error) {}
        }

        // if (APP_CONFIG.web_cache) {
        //     headers['Cache-Control'] = `public, max-age=${APP_CONFIG.cache_duration_secs}`;
        //     headers['Expires'] = new Date(Date.now() + APP_CONFIG.cache_duration).toUTCString();
        // }

        // let contentType = headers['Content-Type'];
        // if(contentType === 'application/json' || contentType === 'text/html') {
        //     //headers['Content-Encoding'] = 'gzip';

        // }

        if (statusCode !== 200 && typeof (data) === 'string') {
            res.writeHead(statusCode, data, headers);
        } else {
            res.writeHead(statusCode, headers);
        }

        if (data) {
            res.end(data);
        } else {
            res.end();
        }
    } catch (error) {
        console.error(error.message);
    }
}


const copyData = (source, map) => {
    let data = {};

    Object.keys(map).forEach(field => {
        if (source.hasOwnProperty(field)) {
            data[map[field]] = source[field];
        }
    })
    return data;
}


const findObjectByFieldValue = (arr, field, value, all = false, asObject = false, keyField) => {

    let results = all ? [] : undefined;

    if (Array.isArray(arr)) {
        let len = arr.length;

        for (let index = 0; index < len; index++) {
            const obj = arr[index];
            if (obj[field] == value) {
                if (all) {
                    results.push(obj);
                } else {
                    return obj;
                }
            }
        }
    } else {
        let keys = Object.keys(arr);
        let len = keys.length;

        results = all ? asObject ? {} : [] : undefined;

        for (let index = 0; index < len; index++) {
            let key = keys[index];
            const obj = arr[key];
            if (obj[field] == value) {
                if (all) {
                    if (asObject) {
                        results[key] = obj;
                    } else {
                        results.push(obj);
                    }
                } else {
                    if (keyField) {
                        let copy = {
                            ...obj
                        };
                        copy[keyField] = key;
                        return copy;
                    } else {
                        return obj;
                    }
                }
            }
        }
    }

    return results;
}

const versionCompare = (left, right) => {
    if (typeof left + typeof right !== 'stringstring')
        return false;

    let a = left.split('.'),
        b = right.split('.'),
        i = 0,
        len = Math.max(a.length, b.length);

    for (; i < len; i++) {
        if ((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) {
            return 1;
        } else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) {
            return -1;
        }
    }

    return 0;
}

const shallowCopy = (source, fields, destination) => {
    let has;
    destination = destination || {};

    if (!fields) {
        fields = Object.keys(source);
        has = true;
    }

    fields.forEach(field => {
        if (has || source.hasOwnProperty(field)) {
            destination[field] = source[field];
        }
    });
    return destination;
}

const clearBlanks = (source, fields) => {
    let has;
    if (!fields) {
        fields = Object.keys(source);
        has = true;
    }

    fields.forEach(field => {
        if (has || source.hasOwnProperty(field)) {
            let data = source[field];
            if (typeof (data) === 'string' && data.trim().length < 1) {
                delete source[field];
            }
        }
    })
}

const clearUndefined = (source, fields) => {
    let has;
    if (!fields) {
        fields = Object.keys(source);
        has = true;
    }

    fields.forEach(field => {
        if (has || source.hasOwnProperty(field)) {
            let data = source[field];
            if (typeof (data) === 'undefined') {
                delete source[field];
            }
        }
    })
}


const removeSameFromSource = (source, compare) => {
    let fields = Object.keys(source);
    fields.forEach((key) => {
        if (source[key] === compare[key]) {
            delete source[key];
        }
    });
}

const flatten = (data, prefix) => {
    let results = {};

    const step2 = (data, prefix) => {
        Object.keys(data).forEach((key) => {
            let path = (prefix || '') + '/' + key;
            if (typeof data[key] === 'object') {
                step2(data[key], path);
            } else {
                results[path] = data[key];
            }
        });
    }
    step2(data, prefix);
    return results;
}

const queryStringToObject = (query) => {
    try {
        return JSON.parse('{"' + query.replace(/&/g, '","').replace(/=/g, '":"') + '"}', (key, value) => key === "" ? value : decodeURIComponent(value));
    } catch (error) {}
    return undefined;
}

const objectToQueryString = (params)=> Object.keys(params).map((key) => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
}).join('&');



const fetchData = async (url = '', data = undefined, full = false, headers = {}, method = 'POST') => {
    try {

        let config = {
            method: method,
            headers: headers
        }

        //TODO!
        if (typeof (data) !== 'undefined') {
            config.body = JSON.stringify(data);
        }
        
        if(!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, config);
        
        return full ? response : response.json();
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}


const validateEmail = (email) => email && REGEX_EMAIL.test(email);

const sortObjKeysAlphabetically = (obj) => {
    let ordered = {};
    Object.keys(obj).sort().forEach((key) => {
        ordered[key] = obj[key];
    });
    return ordered;
}

// const sortObjPropertiesAlphabetically = (obj, property) => {
//     let ordered = {};

//     Object.keys(obj).sort((a, b) => (a[property] > b[property]) ? 1 : -1)

//     Object.keys(obj).sort().forEach((key) => {
//         ordered[key] = obj[key];
//     });
//     return ordered;
// }


const isValidIpv4Address = (ip) => {
    return /^(?=\d+\.\d+\.\d+\.\d+$)(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.?){4}$/.test(ip);
}

const copyObjectValues = (source, dest) => {
    Object.keys(sourcej).forEach((key) => {
        dest[key] = source[key];
    });
}

const flattenObject = (obj)=> {
    let results = {};

    for (let item in obj) {
        if (!obj.hasOwnProperty(item)) 
            continue;
        
        if ((typeof obj[item]) == 'object') {
            let flatObject = flattenObject(obj[item]);
            for (let x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) 
                    continue;

                results[item + '/' + x] = flatObject[x];
            }
        } else {
            results[item] = obj[item];
        }
    }

    return results;
}

const loadJSON = (file) => {
    if (fs.existsSync(file)) {
        let json = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return json;
    }
}

const loadJSONAsync = async (file) => {
    if (await fileExists(file)) {
        try {
            let data = await fileRead(file, 'utf-8');
            if(data) {
                let json = JSON.parse(data);
                return json;
            }
        } catch (error) {

        }
    }
}


const loadTemplates = async (templates_dir, templates) => {
    templates = templates || {};
    let files = await dirRead(templates_dir);
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        let key = getFilenameWithoutExtension(file);
        let filename = templates_dir + file;
        templates[key] = await fileRead(filename, 'utf-8');
    }
    return templates;
}

const loadFile = async (file) => {
    try {
        if (await fileExists(file)) {
            return await fileRead(file, 'utf-8');
        }
    } catch (error) {}
}

const shortenUrl = async (url, token, full = false)=> {
    //TODO!
    let data = {
        "long_url": url
    };

    let headers = { "Authorization": `Bearer ${token}`};
    const start = time();
    let results =  await fetchData('https://api-ssl.bitly.com/v4/shorten', data, false, headers);
    const duration = time() - start; 
    console.log(results, token);

    console.log(`Url shortened to [${results.link}] in ${toFixedPlaces(duration, 2)}ms`);
    return full ? results : results.link;
}


const toUrlSafeBase64 = (text) => {
    let safe = Buffer.from(text).toString('base64')
        .replace(/\+/g, '-') // Convert '+' to '-'
        .replace(/\//g, '_') // Convert '/' to '_'
        .replace(/=+$/, ''); // Remove ending '=';
    return safe;
}

const fromUrlSafeBase64 = (base64) => {
    // Add removed at end '='
    base64 += Array(5 - base64.length % 4).join('=');

    base64 = base64
        .replace(/\-/g, '+') // Convert '-' to '+'
        .replace(/\_/g, '/'); // Convert '_' to '/'

    return new Buffer.from(base64, 'base64');
}

const isEntryPoint = ()=> {
    return require.main === module;
}
  


const base62 = {
    charset: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split(''),
    encode: integer => {
        if (integer === 0) {
            return 0;
        }
        let s = [];
        while (integer > 0) {
            s = [base62.charset[integer % 62], ...s];
            integer = Math.floor(integer / 62);
        }
        return s.join('');
    },
    decode: chars => chars.split('').reverse().reduce((prev, curr, i) =>
        prev + (base62.charset.indexOf(curr) * (62 ** i)), 0)
};

const addS = (value) => {
    return value !== 1 ? 's' : '';
}

const isJSON = (data)=> {

    const dataType = typeof(data);
    if (dataType === 'string' && data.length > 1) {
        let firstChar = data.substring(0, 1);
        //let lastChar = data.slice(-1);
        //return (firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']');
        return (firstChar === '{' || firstChar === '[');
    }
}

const convertIfJSON = (data)=> {
    if(isJSON(data)) {
        try {
            data = JSON.parse(data);
        } catch (error) {
        }
    }
    return data;
}

const getBody = async (req) => {
    return new Promise((resolve, reject) => {
        let data = [];
        req.rawBody = '';
        req.on('data', (chunk) => {
            req.rawBody += chunk;
            data.push(chunk);
        }).on('end', () => {
            try {
                //if(isJSON(data)) {
                // if(parse) {                    
                //     data = JSON.parse(data);
                // } else {
                //     data = data.toString('utf8');
                // }
                data = data.toString('utf8');
                if(isJSON(data)) {
                    data = JSON.parse(data);
                }
                resolve(data);
            } catch (error) {
                data = data.toString('utf8');
                // let e = {
                //     data: data,
                //     error: 'Invalid data:' + error.message
                // }
                // reject(e);
                resolve(data);
            }
        }).on('error', (error) => {
            let e = {
                error: error.message
            }
            reject(e);
        });
    });
}

const getRandomIntInclusive = (min, max)=> {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive 
  }

module.exports = {
    isEntryPoint,
    startTime,
    checksum8,
    getFileUpdatedDate,
    time,
    timeout,
    syncFileTime,
    toFixedPlaces,
    randomString,
    randomSrringCrypt,
    setFileTime,
    getFileInfo,
    fileExists,
    fileExistsSync: fs.existsSync,
    fileRead,
    fileWrite,
    fileStats,
    objectId,
    mongoObjectId,
    getMonth,
    isUnderPM2,
    hashID,
    fetchData,
    getValidSubdomain,
    getFields,
    deepFind,
    getFilename,
    geExtension,
    getFilenameWithoutExtension,
    sha384,
    hash,
    copyData,
    sortObjKeysAlphabetically,
    parseBoolean,
    queryStringToObject,
    objectToQueryString,
    validateEmail,
    clearBlanks,
    shallowCopy,
    findObjectByFieldValue,
    flatten,
    removeSameFromSource,
    isValidIpv4Address,
    parseNumber,
    splitter,
    toArgs,
    versionCompare,
    formatBytes,
    cleanSlashes,
    loadJSON,
    loadJSONAsync,
    copyObjectValues,
    dirRead,
    hashPassword,
    comparePassword,
    base62,
    flattenObject,
    toUrlSafeBase64,
    fromUrlSafeBase64,
    loadTemplates,
    loadFile,
    getRandomIntInclusive,
    cleanName,
    addS,
    clearUndefined,
    sendText,
    sendData,
    sendMessage,
    getBody,
    shortenUrl,
    isJSON,
    convertIfJSON,
    makeTemplate,
    parseTemplate,
    compressString,
    decompressString
}