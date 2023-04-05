'use strict';
/*jshint esversion: 8 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION
});

const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

// This function formats and enhances error messages in Winston logger.
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

// This function formats log messages to include the message and any additional data as a JSON string.
const format = (message, ...rest) => {
  message = typeof (message) === 'object' ? JSON.stringify(message) : message;
  return `${message} ${typeof(rest) !=='undefined' ? rest.map(r => `${JSON.stringify(r)}`).join('\n') : ''}`
}

// This function formats log messages to include the log level and any additional data.
const formatter = ({
  level,
  message,
  [Symbol.for('splat')]: args = []
}) => {
  level = level.substring(0, 1).toUpperCase();
  return `${level}/${format(message, ...args)}`;
}

//This function is formatting logs to include the current date and time, log level, and log message.
const formatterDate = ({
  level,
  message,
  [Symbol.for('splat')]: args = []
}) => {
  level = level.substring(0, 1).toUpperCase();
  return `${new Date().toISOString()} ${level}/${format(message, ...args)}`;
}

//This function creates a logger object that can log errors and messages to the console or to Amazon CloudWatch based on the logGroupName and logStreamName parameters, and sets the log level and format.
const createLogger = (logGroupName, logStreamName) => {

  let cloud = process.env.RUN_MODE !== 'DEV' && typeof (logGroupName) !== 'undefined';

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
      logGroupName: logGroupName || process.env.LOG_GROUP_NAME || 'service-did',
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
// These functions are wrappers around the logger.log() method, which is used to log messages at different levels (error, warn, info, http, verbose, debug, silly). They take a message parameter that contains the message to be logged and an optional extra parameter that can contain additional information to be logged. The type parameter in the doLog() function is not used in the code you provided.
const doLog = (type, message, extra) => {}

const error = (message, extra) => logger.log('error', message, extra);
const warn = (message, extra) => logger.log('warn', message, extra);
const info = (message, extra) => logger.log('info', message, extra);
const http = (message, extra) => logger.log('http:', message, extra);
const verbose = (message, extra) => logger.log('verbose', message, extra);
const debug = (message, extra) => logger.log('debug', message, extra);
const silly = (message, extra) => logger.log('silly', message, extra);

// This is a class representing a logger with methods for logging messages at different levels, and a child method to create a new logger instance with the same configuration.
class Logger {
  constructor(...args) {
    //console.log(args, 'HA!');
    this.args = args;
  }
  info(msg) {
    console.log("info", msg);
  }
  error(msg) {
    console.error("error", msg);
  }
  debug(msg) {
    console.log("debug", msg);
  }
  fatal(msg) {
    console.log("fatal", msg);
  }
  warn(msg) {
    console.log("warn", msg);
  }
  trace(msg) {
    console.log("trace", msg);
  }

  child() {
    return new Logger();
  }
}

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
  Logger,
}