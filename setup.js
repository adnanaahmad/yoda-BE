'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');

(async () => {
    // This is now done in the setup.sh script
    // let awsInstanceData = await utils.fetchData('http://169.254.169.254/latest/dynamic/instance-identity/document', undefined, false,{}, 'GET');
    // const ENV = {};
    
    // //console.log(awsInstanceData);
    // if(awsInstanceData && awsInstanceData.region) {
    //     ENV.AWS_REGION = awsInstanceData.region;
    // }
    
    // const keys = Object.keys(ENV);
    // if(keys.length > 0) {
    //     let output = '';
    //     keys.forEach(key=> {
    //         let value = ENV[key];
    //         output += `${key}=${value}\n`;
    //     })
    //     //console.log(output);
    //     await utils.fileWrite('./.env', output);
    // }
    console.log('Getting certs...');
    setTimeout( async ()=> {
        let results = await utils.execCommand(`${__dirname}/data/get-certs.sh`, undefined, 120000);
        console.log(results);
    }, 100);
})();

