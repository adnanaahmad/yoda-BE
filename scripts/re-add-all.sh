#!/bin/bash

pm2 delete all
pm2 start service-admin.js service-did.js service-mfa.js service-synthetic-id.js service-veriff.js handler-email.js handler-twilio.js handler-webhook.js helper-forwarder.js helper-scheduler.js helper-shortener.js helper-uploader.js
pm2 save

