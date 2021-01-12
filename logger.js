'use strict';
/*jshint esversion: 8 */
const AWS = require('aws-sdk');
const utils = require('./utils');

AWS.config.update({
  region: process.env.AWS_REGION
});

const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const formatter = ({
  level,
  message,
  additionalInfo
}) => {

  let extraType = typeof (additionalInfo);

  message = typeof (message) === 'object' ? JSON.stringify(message) : message;
  additionalInfo = extraType === 'object' ? JSON.stringify(additionalInfo) : additionalInfo;

  level = level.substring(0, 1).toUpperCase();
  let data = `${level}/${message}${extraType !== 'undefined' ? `\n${additionalInfo}` : ''}`
  return data;
};

const logger = new winston.createLogger();

if (process.env.RUN_MODE === 'DEV') {
  logger.add(new winston.transports.Console({
    level: 'silly',
    format: winston.format.simple(),
  }))
} else {
  const cloudwatchConfig = {
    level: 'silly',
    logGroupName: 'didservice',
    logStreamName: process.env.INSTANCE_ID || 'default',
    messageFormatter: formatter
  }
  logger.add(new WinstonCloudWatch(cloudwatchConfig))
}


module.exports = {
  logger
}