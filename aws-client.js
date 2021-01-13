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
    logger.error(error, name);
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
    logger.error(error);
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

(async () => {

})();

module.exports = {
  getParameter,
  putParameter,
  putDDBItem,
  updateDDBItem,
  describeTable,
  createTable
};