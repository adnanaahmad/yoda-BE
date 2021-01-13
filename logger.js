'use strict';
/*jshint esversion: 8 */
const AWS = require('aws-sdk');
const utils = require('./utils');

AWS.config.update({
  region: process.env.AWS_REGION
});

const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const format = (message, ...rest)=> {  
  message = typeof (message) === 'object' ? JSON.stringify(message) : message;
  return `${message}${typeof(rest) !=='undefined' ? rest.map(r => `${JSON.stringify(r)}`).join('\n') : ''}`
}

const formatter = ({level, message, [Symbol.for('splat')]: args = []})=> {
  level = level.substring(0, 1).toUpperCase();
  return `${level}/${format(message, ...args)}`;
}

const logger = new winston.createLogger();

if (process.env.RUN_MODE === 'DEV') {
  logger.add(new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'silly',
    format: winston.format.simple(),
  }))
} else {
  const cloudwatchConfig = {
    level: process.env.LOG_LEVEL || 'silly',
    logGroupName: 'didservice',
    logStreamName: process.env.INSTANCE_ID || 'default',
    messageFormatter: formatter
  }
  logger.add(new WinstonCloudWatch(cloudwatchConfig))
  
}

const error= (message, extra)=> logger.log('error', message, extra);
const warn = (message, extra)=> logger.log('warn', message, extra);
const info= (message, extra)=> logger.log('info', message, extra);
const http = (message, extra)=> logger.log('http:', message, extra);
const verbose = (message, extra)=> logger.log('verbose', message, extra);
const debug= (message, extra)=> logger.log('debug', message, extra);
const silly= (message, extra)=> logger.log('silly', message, extra);

module.exports = {
  logger,
  error,
  warn,
  info,
  http,
  verbose,
  debug,
  silly,
}