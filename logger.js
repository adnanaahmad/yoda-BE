'use strict';
/*jshint esversion: 8 */
const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION
});

const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const enumerateErrorFormat = winston.format(info => {
  if (info.message instanceof Error) {
    info.message = Object.assign({
      message: info.message.message,
      stack: info.message.stack
    }, info.message);
  }

  if (info instanceof Error) {
    return Object.assign({
      message: info.message,
      stack: info.stack
    }, info);
  }

  return info;
});

const format = (message, ...rest) => {
  message = typeof (message) === 'object' ? JSON.stringify(message) : message;
  return `${message} ${typeof(rest) !=='undefined' ? rest.map(r => `${JSON.stringify(r)}`).join('\n') : ''}`
}

const formatter = ({
  level,
  message,
  [Symbol.for('splat')]: args = []
}) => {
  level = level.substring(0, 1).toUpperCase();
  return `${level}/${format(message, ...args)}`;
}

const formatterDate = ({
  level,
  message,
  [Symbol.for('splat')]: args = []
}) => {
  level = level.substring(0, 1).toUpperCase();
  return `${new Date().toISOString()} ${level}/${format(message, ...args)}`;
}

const createLogger = (logGroupName, logStreamName) => {

  let cloud = process.env.RUN_MODE !== 'DEV' && typeof(logGroupName) !== 'undefined';

  const logger = new winston.createLogger({
    level: 'error',
    format: winston.format.combine(
      enumerateErrorFormat(),
      winston.format.json()
    )
  });

  if (cloud) {
    const cloudwatchConfig = {
      level: process.env.LOG_LEVEL || 'http',
      logGroupName: logGroupName ||process.env.LOG_GROUP_NAME || 'service-did',
      logStreamName: logStreamName || process.env.INSTANCE_ID || 'default',
      messageFormatter: formatter
    }
    logger.add(new WinstonCloudWatch(cloudwatchConfig))
  } else {
    logger.add(new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'silly',
      format: winston.format.printf(formatterDate),
    }))
  }
  
  return logger;
}

const logger = createLogger('service-did');

//TODO
const doLog = (type, message, extra)=> {
}

const error = (message, extra) => logger.log('error', message, extra);
const warn = (message, extra) => logger.log('warn', message, extra);
const info = (message, extra) => logger.log('info', message, extra);
const http = (message, extra) => logger.log('http:', message, extra);
const verbose = (message, extra) => logger.log('verbose', message, extra);
const debug = (message, extra) => logger.log('debug', message, extra);
const silly = (message, extra) => logger.log('silly', message, extra);

module.exports = {
  logger,
  createLogger,
  error,
  warn,
  info,
  http,
  verbose,
  debug,
  silly,
}