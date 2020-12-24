'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);

// async function getVersion() {
//   const { stdout } = await execFile('pm2', ['--version']);
//   console.log(stdout);
// }
// getVersion();

(async () => {
    let awsInstanceData = await utils.fetchData('http://169.254.169.254/latest/dynamic/instance-identity/document', undefined, false,{}, 'GET');
    const ENV = {};
    
    //console.log(awsInstanceData);
    if(awsInstanceData && awsInstanceData.region) {
        ENV.AWS_REGION = awsInstanceData.region;
    }
    
    const keys = Object.keys(ENV);
    if(keys.length > 0) {
        let output = '';
        keys.forEach(key=> {
            let value = ENV[key];
            output += `${key}=${value}\n`;
        })
        //console.log(output);
        await utils.fileWrite('./.env', output);
    }
})();

