#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

START=service-admin.js service-certs.js service-did.js service-mfa.js service-plaid-ach.js service-synthetic-id.js service-veriff.js handler-email.js handler-twilio.js handler-webhook.js helper-forwarder.js helper-shortener.js helper-uploader.js

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 0
fi

if [ -n "$START" ]; then
    #IFS=',' read -ra ID <<< "$START"
    # for i in "${ID[@]}"; do
    #     pm2 start "$i.js"
    # done
    pm2 start $START -i max --exp-backoff-restart-delay=100
    pm2 start helper-scheduler.js --exp-backoff-restart-delay=100
    pm2 save
fi