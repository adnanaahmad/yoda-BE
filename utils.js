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
const axios = require('axios');
const LZUTF8 = require('lzutf8');
const dayjs = require('dayjs');
// const utc = require('dayjs/plugin/utc')
// dayjs.extend(utc)

const url = require('url');
const ipRangeCheck = require("ip-range-check");
const path = require('path');
const PhoneNumber = require('awesome-phonenumber');
const cidrRegex = require("cidr-regex");
const ipaddr = require('ipaddr.js');
const packageJSON = require(`${__dirname}/package.json`);

//TODO!
const USER_AGENT = `FortifID v${packageJSON.version}`;

const {
    URL
} = require('url');
const {
    v4: uuidv4
} = require('uuid');
const BigInt = require('big-integer');

const loadNs = process.hrtime();
const loadMs = new Date().getTime();

let _logger;
let _hasGit;

require('dotenv').config();

const https = require('https');

const ignoreSSLErrors = () => {
    return process.env.IGNORE_SSL_ERRORS === "1";
}

const DEMO = process.env.DEMO === "1";

//TODO: THIS IS NOT SAFE! Only for emergencies.
const httpsAgent = ignoreSSLErrors() ? new https.Agent({
    rejectUnauthorized: false,
}) : undefined;

//TODO!
const HOST = process.env.HOST || 'api-uat.fortifid.com';

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
const fileDelete = util.promisify(fs.unlink);
const fileWrite = util.promisify(fs.writeFile);
const fileStats = util.promisify(fs.stat);
const dirRead = util.promisify(fs.readdir);
const execFile = util.promisify(require('child_process').execFile);
const _dirCreate = util.promisify(fs.mkdir);

const getMonth = (index, short) => {
    return monthsShort[index];
};

const isUnderPM2 = () => {
    return 'PM2_HOME' in process.env || 'PM2_JSON_PROCESSING' in process.env || 'PM2_CLI' in process.env
};

const dirCreate = async (path) => {
    return await _dirCreate(path, {
        recursive: true
    });
}

const execCommand = async (command, args, timeout = 30000) => {
    try {
        const data = {};

        data.start = Date.now();

        const {
            stdout,
            stderr
        } = await execFile(command, args, {
            timeout: timeout
        });

        data.end = Date.now();
        data.duration = data.end - data.start;

        let temp = splitLines(stdout);
        if (temp) {
            data.output = temp;
        }

        temp = splitLines(stderr);
        if (temp) {
            data.error = temp;
        }

        return data;
    } catch (error) {
        if (_logger) {
            _logger.error(error);
        }
        let temp = splitLines(error.message);
        return {
            error: temp
        };
    }
}

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

const hashPassword = async (password, rounds = BCRYPT_SALT_ROUNDS) => {
    try {
        let hash = await bcrypt.hash(password, rounds);
        return hash;
    } catch (error) {

    }
}

const createWebhookPayload = (data, url, api_name, secret) => {
    const dType = typeof (data);
    if (dType === 'undefined' || !url || !url.startsWith("http")) {
        return;
    }

    const payload = { data: (dType === 'object' ? JSON.stringify(data) : data), url };
    let headers;
    if (secret && secret.length > 0) {
        const sig = hash(`${payload.data}${secret}`, 'sha256', 'hex').toUpperCase();
        headers = { "x-signature": sig };
    }

    if (api_name && api_name.length > 0) {
        headers = headers || {};
        headers["x-api"] = api_name;
    }

    payload.headers = headers;
    return payload;
}

const comparePassword = async (password, hash) => {
    try {
        const match = await bcrypt.compare(password, hash);
        return match;
    } catch (error) {

    }
}

const parseBoolean = (value) => value !== undefined && (value === 'true');

const getFileInfo = (file, doHash, extras) => {
    const stats = fs.statSync(file);

    //TODO! fileStats
    const info = {
        start: startTime,
        path: file,
        name: getFilename(file),
        created: Math.round(stats.birthtimeMs),
        modified: Math.round(stats.mtimeMs),
        size: stats.size,
    };

    if (doHash) {
        info.hash = hash(fs.readFileSync(file, 'utf8'));
    }

    if (extras) {
        info.version = packageJSON.version;
        if (process.env.CREATED) {
            info.installed = parseInt(process.env.CREATED);
        }

        info.region = process.env.AWS_REGION;
        info.instance = process.env.INSTANCE_ID;
        info.log_level = process.env.LOG_LEVEL;
        info.run_mode = process.env.RUN_MODE;
        info.hostname = process.env.HOSTNAME;
        info.host = HOST;
        info.node_version = process.version;
        if (ignoreSSLErrors()) {
            info.ignore_ssl_errors = true;
        }
    }

    return info;
}

const makeTemplate = (templateString) => {
    return (templateData) => new Function(`{${Object.keys(templateData).join(',')}}`, 'return `' + templateString + '`')(templateData);
}

const parseTemplate = (template, replacements) => {
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

const parseDotNotation = (str, val, obj, add = false) => {
    var currentObj = obj,
        keys = str.split("."),
        i, l = Math.max(1, keys.length - 1),
        key;

    for (i = 0; i < l; ++i) {
        key = keys[i];
        currentObj[key] = currentObj[key] || {};
        currentObj = currentObj[key];
    }

    //TODO: Dirty hack for now
    let last = `${add ? '*' : ''}${keys[i]}`;

    currentObj[last] = val;
    delete obj[str];
}

const getFileUpdatedDate = (path, asNumber) => {
    const stats = fs.statSync(path);
    let time = stats.mtime;

    return asNumber ? Date.parse(time) : time;
};

const time = () => {
    const [seconds, nanos] = process.hrtime();
    return seconds * 1000 + nanos / 1000000;
};

const timenano = () => {
    let diffNs = process.hrtime(loadNs);
    return BigInt(loadMs).times(1e6).add(BigInt(diffNs[0]).times(1e9).plus(diffNs[1])).toString();
}

const timemicro = () => {
    return BigInt(timenano()).divide(1e3).toString();
}

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

const beep = () => {
    process.stdout.write('\x07')
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

const toArgs2 = (command) => {
    if (!command || command.length < 1)
        return;

    const ARGS = {};
    let args = command.split(' ');
    let len = args.length;
    for (let index = 0; index < len; index++) {
        const key = args[index];
        if (key.startsWith('-') && index + 1 < len) {
            ARGS[key.substr(1, key.length - 1)] = args[index + 1].trim();
        }
    }
    return ARGS;
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

const randomSrringCrypt = (len) => {
    return crypto
        .randomBytes(len)
        .toString('base64')
        .slice(0, len);
};

const setFileTime = (file, atime, mtime) => {
    mtime = mtime || atime;
    //if (fs.existsSync(file))
    fs.utimes(file, atime, mtime, (error) => {
        if (error)
            console.log(error);
    });
};

const cleanName = (name) => {
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

const isValidIP = (ip) => {
    if (!ip || ip.length < 1) {
        return false;
    }

    if (ip.indexOf('/') === -1) {
        ip = ip + "/32";
    }

    if (cidrRegex({ exact: true }).test(ip)) {
        return ip;
    }
}

const getIPAddressType = (address) => {
    try {
        if (address) {
            let ip = ipaddr.parse(address.split('/')[0]);
            if (ip) {
                return ip.range();
            }
        }
    } catch (error) {

    }
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

const compressString = (input) => {
    return LZUTF8.compress(input, {
        outputEncoding: 'Base64'
    });
}

const decompressString = (input) => {
    return LZUTF8.decompress(input, {
        outputEncoding: 'String'
    });
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
        cors = true;
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
            } catch (error) { }
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
        console.error(error);
    }
}


const copyData = (source, map, dest) => {
    dest = dest || {};

    Object.keys(map).forEach(field => {
        if (source.hasOwnProperty(field)) {
            dest[map[field]] = source[field];
        }
    })
    return dest;
}

const shuffleArray = (array) => {
    const len = array.length;
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const splitItems = (data) => {
    if (!data) {
        return;
    }

    return data.replace(/["']/g, "").split(/[\n,]/).map(s => s.trim()).filter(Boolean);
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

const camelToSnakeCaseObject = (obj) => {
    Object.keys(obj).forEach(key => {
        let newName = camelToSnakeCase(key);
        if (newName !== key) {
            obj[newName] = obj[key];
            delete obj[key];
        }
    })
}

const camelToSnakeCase = string => string.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const snakeToCamel = (string) => {
    return string.replace(/(_\w)/g, (m) => {
        return m[1].toUpperCase();
    });
}

const queryStringToObject = (query, parse = false) => {
    try {
        if (parse) {
            const index = query.indexOf('?');
            if (index > -1) {
                query = query.substr(index + 1);
            }
        }

        return JSON.parse('{"' + query.replace(/&/g, '","').replace(/=/g, '":"') + '"}', (key, value) => key === "" ? value : decodeURIComponent(value));
    } catch (error) { }
    return {};
}

const objectToQueryString = (params) => Object.keys(params).map((key) => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
}).join('&');

const fetchData = async (url, body, headers, method = 'post', responseType, throwError = true, returnHeaders) => {
    headers = headers || {};

    let data;

    if (!method) {
        method = 'get';
    } else {
        method = method.toLowerCase();
    }

    //TODO
    const bodyType = typeof (body);

    if (!headers['content-type'] && bodyType === 'object') {
        headers['content-type'] = 'application/json';
    }

    headers['user-agent'] = USER_AGENT;

    if (bodyType === 'object') {
        if (headers['content-type'] === 'application/json') {
            body = JSON.stringify(body);
        } else {
            body = new URLSearchParams(body);
        }
    }

    let config = {
        method: method,
        headers: headers,
    };

    if (httpsAgent) {
        config.agent = httpsAgent;
    }

    //TODO!
    if (body) {
        if (method === 'post' || method === 'put' || method === 'patch') {
            config.body = body;
        } else {
            //CLEAN
            url = `${url}${url.indexOf('?') > -1 ? '&' : '?'}${body}`;
        }
    }

    let response;
    try {
        response = await fetch(url, config);
        if (response) {
            if (returnHeaders) {
                Object.assign(returnHeaders, response.headers);
            }

            if (responseType === 'blob') {
                data = await response.blob();
            } else {
                data = await response.text();
                if (isJSON(data)) {
                    try {
                        data = JSON.parse(data);
                    } catch (e) { }
                }
            }
        }
    } catch (error) {
        if (throwError) {
            throw error;
        }
    }
    return data;
}

const fetchData2 = async (url, body, headers, method = 'post', responseType, throwError = true, returnHeaders) => {
    headers = headers || {};

    let data;

    if (!method) {
        method = 'get';
    } else {
        method = method.toLowerCase();
    }

    //TODO
    const bodyType = typeof (body);

    if (!headers['content-type'] && bodyType === 'object') {
        headers['content-type'] = 'application/json';
    }

    headers['user-agent'] = USER_AGENT;

    if (bodyType === 'object') {
        if (headers['content-type'] === 'application/json') {
            body = JSON.stringify(body);
        } else {
            body = new URLSearchParams(body);
        }
    }

    let config = {
        method,
        headers,
    };

    if (httpsAgent) {
        config.agent = httpsAgent;
    }

    //TODO!
    if (body) {
        if (method === 'post' || method === 'put' || method === 'patch') {
            config.data = body;
        } else {
            //CLEAN
            url = `${url}${url.indexOf('?') > -1 ? '&' : '?'}${body}`;
        }
    }

    config.url = url;

    let response;
    try {

        response = await axios(config);
        if (response) {
            if (returnHeaders) {
                Object.assign(returnHeaders, response.headers);
            }

            if (responseType === 'blob') {
                data = await response.blob();
            } else {
                data = await response.text();
                if (isJSON(data)) {
                    try {
                        data = JSON.parse(data);
                    } catch (e) { }
                }
            }
        }
    } catch (error) {
        if (throwError) {
            throw error;
        }
    }
    return data;
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

const parsePhoneNumber = (phoneNumber, countryCode = 'US') => {
    return new PhoneNumber(phoneNumber, countryCode);
}

const getPhoneNumber  = (phoneNumber, countryCode = 'US') => {
    try {
        if(phoneNumber && phoneNumber.length > 0) {
            const pn = parsePhoneNumber(phoneNumber, countryCode);
            if (pn.isValid()) {
                return pn.getNumber();
            }
        }
    } catch (ignore) {
        
    }
}

const parseURL = (url) => {
    return new URL(url);
}

const isValidIpv4Address = (ip) => {
    return /^(?=\d+\.\d+\.\d+\.\d+$)(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.?){4}$/.test(ip);
}

const copyObjectValues = (source, dest) => {
    Object.keys(source).forEach((key) => {
        dest[key] = source[key];
    });
}

const getUUID = () => {
    return uuidv4();
}

const flattenObject = (obj) => {
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

const flattenObject2 = (obj) => {
    if (!obj) {
        return;
    }
    const flattened = {}

    Object.keys(obj).forEach((key) => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(flattened, flattenObject2(obj[key]))
        } else {
            flattened[key] = obj[key]
        }
    })

    return flattened
}

const escapeJSON = (string) => {
    if (string) {
        console.log(string);
        string = string.replace(
            new RegExp("\\'".replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'),
            "'"
        );
        console.log(string);
        string = string.replace(
            /"((?:"[^"]*"|[^"])*?)"(?=[:},])(?=(?:"[^"]*"|[^"])*$)/gm,
            (match, group) => {
                return '"' + group.replace(/"/g, '\\"') + '"';
            }
        );
        console.log(string);
    }
    return string;
}

const loadJSON = (file) => {
    if (file && fs.existsSync(file)) {
        try {
            let json = JSON.parse(fs.readFileSync(file, 'utf-8'));
            return json;
        } catch (error) {

        }
    }
}

const loadJSONAsync = async (file) => {
    if (file && await fileExists(file)) {
        try {
            let data = await fileRead(file, 'utf-8');
            if (data) {
                let json = JSON.parse(data);
                return json;
            }
        } catch (error) {

        }
    }
}

const getTemplateResponse = (reply, TEMPLATES, endpoint, id) => {
    let code = 200;
    let response = {};
    try {
        const responses = TEMPLATES[endpoint];
        let temp;
        if (!Array.isArray(responses)) {
            temp = responses;
        }
        else if (responses.length === 1) {
            temp = responses[0]
        } else if (typeof (id) === 'undefined') {
            temp = responses[getRandomIntInclusive(0, responses.length - 1)]
        } else {
            for (let index = 0; index < response.length; index++) {
                const r = responses[index];
                if (r._id === id) {
                    temp = r;
                }
            }
            if (!temp) {
                temp = responses[getRandomIntInclusive(0, responses.length - 1)]
            }
        }

        if (temp) {
            response = { ...temp };
            delete response._id;
            if (response._code) {
                code = response._code;
                delete response._code;
            }
        }
    } catch (error) {
    }

    if (reply) {
        if (reply.type) {
            reply.type('application/json').code(code);
        } else {
            sendData(reply, response, code);
            return;
        }
    }
    return response;
}

const loadTemplates = async (templates_dir, templates, asObjects = false) => {
    templates = templates || {};
    try {
        let files = await dirRead(templates_dir);
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            let key = getFilenameWithoutExtension(file);
            let filename = templates_dir + file;
            let data = await fileRead(filename, 'utf-8');
            templates[key] = asObjects ? JSON.parse(data) : data;
        }
    } catch (error) {

    }
    return templates;
}

const loadFile = async (file) => {
    try {
        if (file && await fileExists(file)) {
            return await fileRead(file, 'utf-8');
        }
    } catch (error) { }
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

const isEntryPoint = () => {
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

//TODO!
const baseAlpha = {
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    encode: integer => {
        if (integer === 0) {
            return baseAlpha.charset[0];
        }
        let s = [];
        while (integer > 0) {

            s.push(baseAlpha.charset[integer % 26]);
            integer = Math.floor(integer / 26);
        }
        return s.join('');
    }
};

const addS = (value) => {
    return value !== 1 ? 's' : '';
}

const isJSON = (data) => {

    const dataType = typeof (data);
    if (dataType === 'string' && data.length > 1) {
        let firstChar = data.trim().substring(0, 1);
        //let lastChar = data.slice(-1);
        //return (firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']');
        return (firstChar === '{' || firstChar === '[');
    }
}

const convertIfJSON = (data) => {
    if (isJSON(data)) {
        try {
            data = JSON.parse(data);
        } catch (error) { }
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
                if (isJSON(data)) {
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

//TOD: The url needs to be dyanmic and the token
const shortenUrl = async (url, token, full = false,) => {
    if (!HOST) {
        return;
    }

    const data = {
        "long_url": url
    };

    const headers = {
        //"Authorization": `Bearer ${token}`
    };

    const start = time();
    try {
        //TODO
        const results = await fetchData(`https://${HOST}/s/`, data, headers);
        const duration = time() - start;
        if (typeof results === 'object' && results.link) {
            if (_logger) {
                _logger.info(`Url shortened to [${results.link}] in ${toFixedPlaces(duration, 2)}ms`);
            }
            return full ? results : results.link;
        } else {
            if (_logger) {
                _logger.info(results);
            }
        }
    } catch (error) {
        if (_logger) {
            _logger.error(error);
        } else {
            console.log(error);
        }
    }

}

//TODO
const getHealth = (info, full = false) => {
    const now = Date.now();
    try {
        const data = full ? { ...info } : {};


        data.status = "OK";
        data.time = now;
        data.uptime = Math.round((now - info.start) / 1000);
        data.memory = process.memoryUsage();
        data.cpu = process.cpuUsage();
        data.loadavg = os.loadavg();
        data.os_uptime = Math.round(os.uptime());
        data.freemem = os.freemem();
        data.totalmem = os.totalmem();

        if (!full && info.request_stats) {
            data.request_stats = info.request_stats;
        }
        return data;
    } catch (error) {
        //console.log(error);
        return { status: "error" };
    }
}

const setLogger = (logger) => {
    _logger = logger;
}

const sameDate = (date1, date2) => {
    let d1 = dayjs(date1);
    let d2 = dayjs(date2);
    return d1.isValid() && d2.isValid() && d1.isSame(d2);
}

const getRandomIntInclusive = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive 
}

const pathJoin = (...paths) => {
    return path.join(...paths);
}

const hasGit = async () => {
    if (typeof (_hasGit) === 'undefined') {
        _hasGit = await fileExists(`${__dirname}/.git`);
    }

    return _hasGit;
}

function escapeHTML(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function unescapeHTML(escapedHTML) {
    return escapedHTML.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#xD;/g, '').replace(/&#xA;/g, '');
}

const splitLines = (data) => {
    if (typeof (data) === 'string' && data.length > 0) {
        return data.split('\n').filter(Boolean);
    }
}

const csvToArray = (data) => {
    let p = '',
        row = [''],
        ret = [row],
        i = 0,
        r = 0,
        s = !0,
        l;
    for (l of data) {
        if ('"' === l) {
            if (s && l === p) row[i] += l;
            s = !s;
        } else if (',' === l && s) l = row[++i] = '';
        else if ('\n' === l && s) {
            if ('\r' === p) row[i] = row[i].slice(0, -1);
            row = ret[++r] = [l = ''];
            i = 0;
        } else row[i] += l;
        p = l;
    }
    return ret;
};

const arrayToCSV = (row) => {
    for (let i in row) {
        row[i] = row[i].replace(/"/g, '""');
    }
    return '"' + row.join('","') + '"';
}


const numbersOnly = (data, asString = true) => {
    if (typeof (data) === 'undefined') {
        return asString ? '' : 0;
    }

    let results = (data + '').match(/\d+/g).join('');
    return asString ? results : parseInt(results);
}

const formatDate = (date, format, utc = false) => {
    if (!date || !format) {
        return '';
    }

    //eturn utc ? dayjs.utc() dayjs(date).format(format);
    return dayjs(date).format(format);
}

//TODO!
const addFastifyConfig = (fastify, script_info) => {
    if (!fastify) {
        return;
    }

    const SCRIPT_INFO = script_info;
    SCRIPT_INFO.request_stats = {};
    fastify.get('/health', (request, reply) => {
        return getHealth(SCRIPT_INFO, false);
    })

    fastify.get('/info', (request, reply) => {
        return getHealth(SCRIPT_INFO, true);
    })

    fastify.addHook("onRequest", async (request, reply) => {
        request.timeStart = time();
    })

    fastify.addHook('onResponse', async (request, reply) => {
        const duration = time() - request.timeStart;
        const path = `${request.method}:${request.routerPath || '404'}`;
        let data = SCRIPT_INFO.request_stats[path];
        if (!data) {
            data = {
                count: 0,
                avg: 0,
                total: 0
            }
            SCRIPT_INFO.request_stats[path] = data;
        }

        data.count++;
        
        //https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average
        //data.avg = (data.avg * (data.count-1) + duration) / data.count;
            //TODO: Overflow, anyone?
        data.total += duration;
        data.avg = data.total / data.count;
        if (request.user) {

            // let log = {
            //     customer_id: user.
            // }
        }
    })
}


const redisOptsFromUrl = (urlString) => {
    const redisOpts = {};
    try {
        const redisUrl = new URL(urlString);
        redisOpts.port = Number(redisUrl.port) || 6379;
        redisOpts.host = redisUrl.hostname;
        redisOpts.db = redisUrl.pathname ? Number(redisUrl.pathname.split("/")[1]) : 0;
        if (redisUrl.auth) {
            redisOpts.password = redisUrl.auth.split(":")[1];
        }
        if (redisUrl.protocol === "rediss:") {
            redisOpts.tls = {
                //rejectUnauthorized: false
            };
        }
        redisOpts.enableReadyCheck = false;
        redisOpts.maxRetriesPerRequest = 10;
    } catch (e) {
        console.log(e);
    }
    return redisOpts;
};

//TODO! Since this library is used by pretty much everything
process.on('uncaughtException', (err) => {
    console.log('uncaughtException', err);
});

module.exports = {
    isEntryPoint,
    startTime,
    checksum8,
    getFileUpdatedDate,
    time,
    timenano,
    timemicro,
    timeout,
    syncFileTime,
    toFixedPlaces,
    randomString,
    randomSrringCrypt,
    setFileTime,
    getFileInfo,
    fileExists,
    DEMO,
    fileExistsSync: fs.existsSync,
    fileRead,
    fileWrite,
    fileStats,
    execFile,
    execCommand,
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
    isValidIP,
    getIPAddressType,
    parseNumber,
    splitter,
    toArgs,
    toArgs2,
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
    baseAlpha,
    contentTypes,
    flattenObject,
    flattenObject2,
    parseDotNotation,
    toUrlSafeBase64,
    fromUrlSafeBase64,
    getTemplateResponse,
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
    isJSON,
    convertIfJSON,
    makeTemplate,
    parseTemplate,
    compressString,
    decompressString,
    getUUID,
    unescapeHTML,
    escapeHTML,
    shortenUrl,
    setLogger,
    sameDate,
    redisOptsFromUrl,
    beep,
    ipRangeCheck,
    pathJoin,
    splitLines,
    fileDelete,
    dirCreate,
    camelToSnakeCaseObject,
    formatDate,
    numbersOnly,
    shuffleArray,
    splitItems,
    parsePhoneNumber,
    getPhoneNumber,
    parseURL,
    escapeJSON,
    hasGit,
    csvToArray,
    arrayToCSV,
    getHealth,
    createWebhookPayload,
    addFastifyConfig
}