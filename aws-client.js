const AWS = require('aws-sdk');
const utils = require('./utils');
const logger = require('./logger').logger;

AWS.config.update({
  region: process.env.AWS_REGION
});

const ssm = new AWS.SSM();
const ddb = new AWS.DynamoDB({
  apiVersion: '2012-08-10'
});
const DynamoDB = new AWS.DynamoDB.DocumentClient();

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

const putDDBItem = async (table, data) => {
  //TODO
  let params = {
    TableName: table,
    Item: data
  };

  try {
    return await DynamoDB.put(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

const updateDDBItem = async (params) => {
  try {
    return await DynamoDB.update(params).promise();
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

const docQuery = async (params) => {
  try {
    return await DynamoDB.query(params).promise();
  } catch (error) {
    logger.error(error);
  }
}

const docScan = async (params) => {
  try {
    return await DynamoDB.scan(params).promise();
  } catch (error) {
    logger.error(error);
  }
}


const docDelete = async (params) => {
  try {
    return await DynamoDB.delete(params).promise();
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
  putDDBItem,
  updateDDBItem,
  query,
  scan,
  docScan,
  docQuery,
  docDelete,
  describeTable,
  createTable
};