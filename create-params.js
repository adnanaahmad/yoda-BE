'use strict';
/*jshint esversion: 8 */
const awsClient = require('./aws-client');
const utils = require('./utils');
const params = require('./data/paramList.json');

(async () => {
    let count = params.length;
    for (let index = 0; index < count; index++) {
      const param = params[index];
      if(param.Value === '') {
        param.Value = 'REPLACE';
      }
      let result = await awsClient.putParameter(param.Name, param.Value, param.Type);
      console.log(param, result);

      //To make sure we don't exceed amazon's rate limiting
      await utils.timeout(500);
    }
})();
