'use strict';
/*jshint esversion: 8 */

const utils = require('./utils');
const logger = require('./logger').createLogger("aws-client");
const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION
});

if(process.env.AWS_LOGGER === "1") {
  AWS.config.logger = console;
}

const secrets = new AWS.SecretsManager();
const ssm = new AWS.SSM();
const ddb = new AWS.DynamoDB();
const sns = new AWS.SNS();
const s3 = new AWS.S3();

const ddbOptions = {};

// var https = require('https');
// var agent = new https.Agent({
//   maxSockets: 5000
// });

// const tsClient = new AWS.TimestreamWrite({
//   maxRetries: 10,
//   httpOptions: {
//     timeout: 20000,
//     agent: agent
//   }
// });

// async function writeRecordsWithCommonAttributes() {
//   console.log("Writing records with common attributes");
//   const currentTime = Date.now().toString(); // Unix time in milliseconds

//   const dimensions = [{
//       'Name': 'region',
//       'Value': 'us-east-1'
//     },
//     {
//       'Name': 'az',
//       'Value': 'az1'
//     },
//     {
//       'Name': 'hostname',
//       'Value': 'host1'
//     }
//   ];

//   const commonAttributes = {
//     'Dimensions': dimensions,
//     'MeasureValueType': 'DOUBLE',
//     'Time': currentTime.toString()
//   };

//   const cpuUtilization = {
//     'MeasureName': 'cpu_utilization',
//     'MeasureValue': '13.5'
//   };

//   const memoryUtilization = {
//     'MeasureName': 'memory_utilization',
//     'MeasureValue': '40'
//   };

//   const records = [cpuUtilization, memoryUtilization];

//   const params = {
//     DatabaseName: constants.DATABASE_NAME,
//     TableName: constants.TABLE_NAME,
//     Records: records,
//     CommonAttributes: commonAttributes
//   };

//   const request = writeClient.writeRecords(params);

//   await request.promise().then(
//     (data) => {
//       console.log("Write records successful");
//     },
//     (err) => {
//       console.log("Error writing records:", err);
//       if (err.code === 'RejectedRecordsException') {
//         const responsePayload = JSON.parse(request.response.httpResponse.body.toString());
//         console.log("RejectedRecords: ", responsePayload.RejectedRecords);
//         console.log("Other records were written successfully. ");
//       }
//     }
//   );
// }

let hasDax = false;

//TODO: Dax is too buggy to use right now.
// if (process.env.DAX_URL) {
//   try {
//     //TODO: Amazon's library causes this: Warning: Accessing non-existent property 'INVALID_ALT_NUMBER' of module exports inside circular dependency 
//     // export NODE_NO_WARNINGS=1
//     const AmazonDaxClient = require('amazon-dax-client');
//     const dax = new AmazonDaxClient({
//       endpoints: [process.env.DAX_URL],
//       region: process.env.AWS_REGION
//     });
//     ddbOptions.service = dax;
//     hasDax = true;
//   } catch (error) {
//     logger.error(error);
//   }
// }

//This line of code creates an instance of the AWS DynamoDB Document Client, which is a high-level library for interacting with DynamoDB.
const ddbClient = new AWS.DynamoDB.DocumentClient();
// This line of code conditionally creates an instance of AWS DynamoDB Document Client for connecting to Amazon DAX based on the boolean hasDax value, or sets it to undefined if hasDax is false.
const daxClient = hasDax ? new AWS.DynamoDB.DocumentClient(ddbOptions) : undefined;
// This function asynchronously retrieves a parameter with a given name from AWS SSM Parameter Store, and optionally transforms and returns its value based on certain conditions.
const getParameter = async (name) => {
  const params = {
    Name: name,
    WithDecryption: true
  };

  try {
    const result = await ssm.getParameter(params).promise();

    if (result) {
      let value = result.Parameter.Value;
      //TODO
      if (typeof (value) === 'string') {
        value = value.trim();
        if (value === 'REPLACE') {
          value = undefined;
        } else if (utils.isJSON(value)) {
          value = JSON.parse(value);
        }
      }
      return value;
    }
  } catch (error) {
    logger.error(error.message, name);
  }
};
// This function synchronously retrieves all the parameters under the specified path in AWS SSM Parameter Store, optionally filters them, and returns an array of parameter objects or a simplified object.
const getParametersByPathSync = (path, filters, simple = false) => {
  const params = {
    Path: path,
    Recursive: true,
    WithDecryption: true
  };

  if (filters) {
    params.ParameterFilters = filters;
  }

  try {
    let repeat = false;
    let values = [];
    do {
      repeat = false;
      //const result = ssm.getParametersByPath(params);
      let result;
      let error;

      ssm.getParametersByPath(params, (err, data) => {
        if (err) {
          error = err;
          return;
        }
        result = data;
      });

      if (result) {
        if (result.NextToken) {
          repeat = true;
          params.NextToken = result.NextToken;
        } else {
          delete params.NextToken;
        }
        values = [...values, ...result.Parameters];
      }
    } while (repeat);

    if (simple && values) {
      let temp = {};
      values.forEach(value => {
        temp[value.Name.substr(value.Name.lastIndexOf('/') + 1)] = value.Value;
      })
      values = temp;
    }

    return values;
  } catch (error) {
    logger.error(error, path);
  }
};
// This function asynchronously retrieves all the parameters under the specified path in AWS SSM Parameter Store, optionally filters them, and returns an array of parameter objects or a simplified object.
const getParametersByPath = async (path, filters, simple = false) => {
  const params = {
    Path: path,
    Recursive: true,
    WithDecryption: true
  };

  if (filters) {
    params.ParameterFilters = filters;
  }

  try {
    let repeat = false;
    let values = [];
    let count = 0;
    do {
      repeat = false;
      const result = await ssm.getParametersByPath(params).promise();
      if (result) {
        if (result.NextToken) {
          repeat = true;
          params.NextToken = result.NextToken;
        } else {
          delete params.NextToken;
        }
        values = [...values, ...result.Parameters];
      }
    } while (repeat);

    if (simple && values) {
      let temp = {};
      values.forEach(value => {
        count++;
        temp[value.Name.substr(value.Name.lastIndexOf('/') + 1)] = value.Value;
      })
      values = count === 0 ? undefined : temp;
    }

    return values;
  } catch (error) {
    logger.error(error.message, path);
  }
};
//This function asynchronously stores a parameter with a given name, value, and type in AWS SSM Parameter Store, and returns the result of the operation.
const putParameter = async (name, value, type = 'SecureString', dataType = 'text', overwrite = false) => {
  const params = {
    Name: name,
    Value: value,
    Type: type,
    DataType: dataType,
    Overwrite: overwrite
  };

  try {
    return await ssm.putParameter(params).promise();
  } catch (error) {
    logger.error(error, path);
  }
};
// This function asynchronously stores an item with given data in the specified DynamoDB table, using either DAX or DocumentClient, and returns the result of the operation.
const putDDBItem = async (table, data, dax = true) => {
  const params = {
    TableName: table,
    Item: data
  };

  const client = hasDax && dax ? daxClient : ddbClient;

  try {
    return await client.put(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function checks whether a given path is an S3 URL (Uniform Resource Locator) by testing if it matches the regular expression ^s3:\/\/.+\/.+, and returns a boolean value indicating the result.
const isS3 = path => /^s3:\/\/.+\/.+/i.test(path)
// This function parses an S3 path string and extracts the bucket name and object key.
const parseS3 = path => {
  if (!isS3(path)) {
    logger.error(`Invalid S3 path: ${path}`);
    return;
  }

  let s3object = path.replace(/^s3:\/\//i, '').split('/')
  return {
    Bucket: s3object.shift(),
    Key: s3object.join('/')
  }
}

// const s3Upload = async (path) => {
//   const params = parseS3(path);
//   if(!params) {
//     return;
//   }

//   params.Body = '';
//   s3.putObject().promise()
// }

// The function returns a signed URL that allows access to an S3 object with the specified path for a limited time, defaulting to 60 seconds.
const getSignedUrl = async (path, expires = 60) => {
  const params = parseS3(path);
  if (!params) {
    return;
  }

  params.Expires = !isNaN(expires) ? parseInt(expires) : 60

  let url;
  try {
    url = await s3.getSignedUrlPromise('getObject', params);
  } catch (error) {
    logger.error(error);
  }
  return url;
}
// This function sends an SMS message to a phone number using the Amazon SNS service
const sendSNS = async (number, message) => {
  const params = {
    Message: message,
    PhoneNumber: number,
  };

  try {
    return await sns.publish(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function retrieves a secret value from AWS Secrets Manager service and parses it if it is in JSON format.
const getSecret = async (secretName) => {
  try {
    const results = await secrets.getSecretValue({ SecretId: secretName }).promise();
    let data;
    if ('SecretString' in results) {
      data = results.SecretString;
    } else {
      let buff = Buffer.from(results.SecretBinary, 'base64');
      data = buff.toString('ascii');
    }

    if(utils.isJSON(data)) {
      data = JSON.parse(data);
    }
    return data;
  } catch (error) {
    logger.error(error);
  }
}
// This function decrements a specified field value in a DynamoDB table for a given key.
const decrementDDBItem = async (table, key, field, value = 1, dax = true) => {

  // const names = {};
  // const char = utils.baseAlpha.encode(1);

  // const paramName = `#${char}`;

  // names[paramName] = field;
  // //console.log(paramName);
  const params = {
    TableName: table,
    Key: key,
    UpdateExpression: `set ${field} = ${field} - :val`,
    ExpressionAttributeValues: {
      ":val": value
    },
    //ExpressionAttributeNames: names,
    ReturnValues: "UPDATED_NEW"
  };

  const client = hasDax && dax ? daxClient : ddbClient;

  try {
    return await client.update(params).promise();
  } catch (error) {
    logger.error(error);
    console.log(error);
  }
}
// This function updates a DynamoDB table by incrementing the value of a specific field in a specific item by a given value.
const incrementDDBItem = async (table, key, field, value = 1, dax = true) => {
  const params = {
    TableName: table,
    Key: key,
    UpdateExpression: `set ${field} = set ${field} + :val`,
    ExpressionAttributeValues: {
      ":val": value
    },
    ReturnValues: "UPDATED_NEW"
  };

  const client = hasDax && dax ? daxClient : ddbClient;

  try {
    return await client.update(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function retrieves an item from a DynamoDB table by its key
const getDDBItem = async (table, key, dax = true) => {

  const params = {
    TableName: table,
    Key: key
  };

  const client = hasDax && dax ? daxClient : ddbClient;

  try {
    return await client.get(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// The function updates an item in DynamoDB based on the parameters passed in and the DAX (DynamoDB Accelerator) configuration
const updateDDBItem = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.update(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// The function retrieves the description of an Amazon DynamoDB table
const describeTable = async (table) => {
  let params = {
    TableName: table
  };

  try {
    return await ddb.describeTable(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function creates an AWS DynamoDB table based on the provided parameters and enables Time-to-Live (TTL) if specified
const createTable = async (params, ttlParams) => {
  try {
    const results = await ddb.createTable(params).promise();
    if (typeof (ttlParams) !== 'undefined') {
      //TOOD!!!!
      let table;
      do {
        await utils.timeout(1000);
        table = await describeTable(params.TableName);
        if (!table) {
          break;
        }
      } while (table.Table.TableStatus !== 'ACTIVE')

      if (table) {
        await ddb.updateTimeToLive(ttlParams).promise();
      }
    }
    return results;
  } catch (error) {
    logger.error(error);
  }
}
// The function performs a query on a DynamoDB table using the provided parameters and DAX if available.
const docQuery = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.query(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function performs a scan operation on a DynamoDB table using the specified parameters and DAX client if available, and returns the result.
const docScan = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.scan(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function is deleting an item from DynamoDB based on the provided parameters, using either the DAX or regular DDB client depending on the value of the dax parameter.
const docDelete = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.delete(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function updates a DynamoDB table with new data for the given keys, with support for dynamic attribute names and values.
const updateDynamic = async (table, keys, data) => {

  //logger.info('updateDynamic', data);

  try {

    const dataKeys = Object.keys(data);
    const dataKeyLength = dataKeys.length;
    const values = {};
    const names = {};

    let updateExpression = 'SET';

    for (let index = 0; index < dataKeyLength; index++) {
      const key = dataKeys[index];
      const value = data[key];
      const char = utils.baseAlpha.encode(index);

      const paramName = `#${char}`;
      const paramKey = `:${char}`;

      if (index > 0) {
        updateExpression += ',';
      }

      updateExpression += ` ${paramName}=${paramKey}`;
      names[paramName] = key;
      values[paramKey] = value;
    }

    const params = {
      TableName: table,
      Key: keys,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ReturnValues: "ALL_NEW"
    };
    //UPDATED_NEW 
    //logger.debug('updateDynamic - params', params);
    let result = await updateDDBItem(params);

    //logger.debug('updateDynamic - result', result);
    if (result && result.Attributes) {
      result = result.Attributes;
    }
    return result;
  } catch (error) {
    logger.error(error);
  }
}

// This function performs a query operation on a DynamoDB table with the provided parameters.
const query = async (params) => {
  try {
    return await ddb.query(params).promise();
  } catch (error) {
    logger.error(error);
  }
}
// This function is performing a scan operation on an Amazon DynamoDB table using the parameters passed to it and returning the result.
const scan = async (params) => {
  try {
    return await ddb.scan(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

(async () => {

})();

module.exports = {
  getParameter,
  putParameter,
  getParametersByPath,
  getParametersByPathSync,
  putDDBItem,
  getDDBItem,
  updateDDBItem,
  query,
  scan,
  docScan,
  docQuery,
  docDelete,
  describeTable,
  createTable,
  incrementDDBItem,
  decrementDDBItem,
  updateDynamic,
  sendSNS,
  getSignedUrl,
  parseS3,
  isS3,
  getSecret
};