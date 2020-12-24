#!/bin/bash

git pull origin master > /dev/null 2>&1
npm install > /dev/null 2>&1
pm2 restart index.js > /dev/null 2>&1
