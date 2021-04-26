const utils = require('./utils');
const logger = require('./logger').logger;
const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION
});

const ssm = new AWS.SSM();
const ddb = new AWS.DynamoDB();
const sns = new AWS.SNS();

//TODO: Amazon's library causes this: Warning: Accessing non-existent property 'INVALID_ALT_NUMBER' of module exports inside circular dependency 
// export NODE_NO_WARNINGS=1
const AmazonDaxClient = require('amazon-dax-client');
const ddbOptions = {};

let hasDax = false;

if (process.env.DAX_URL) {
  try {
    const dax = new AmazonDaxClient({
      endpoints: [process.env.DAX_URL],
      region: process.env.AWS_REGION
    });
    ddbOptions.service = dax;
    hasDax = true;
  } catch (error) {
    logger.error(error);
  }
}

const ddbClient = new AWS.DynamoDB.DocumentClient();

const daxClient = hasDax ? new AWS.DynamoDB.DocumentClient(ddbOptions) : undefined;

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
    logger.error('getParameter', name, error);
  }
};

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
      const result = ssm.getParametersByPath(params);
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
    logger.error('getParametersByPath', path, error);
  }
};

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
        temp[value.Name.substr(value.Name.lastIndexOf('/') + 1)] = value.Value;
      })
      values = temp;
    }

    return values;
  } catch (error) {
    logger.error('getParametersByPath', path, error);
  }
};

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
    logger.error('putParameter', name, error);
  }
};

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

const updateDDBItem = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.update(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

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

const createTable = async (params) => {
  try {
    return await ddb.createTable(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

const docQuery = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.query(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

const docScan = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.scan(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

const docDelete = async (params, dax = true) => {
  try {
    const client = hasDax && dax ? daxClient : ddbClient;
    return await client.delete(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

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


const query = async (params) => {
  try {
    return await ddb.query(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

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
  sendSNS
};