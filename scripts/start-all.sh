#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

START=service-admin,service-mfa,service-veriff,service-did,handler-email,handler-twilio,handler-webhook,helper-scheduler,helper-shortener,helper-uploader

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 0
fi

if [ -n "$START" ]; then
    IFS=',' read -ra ID <<< "$START"
    for i in "${ID[@]}"; do
        pm2 start "$i.js"
    done
    pm2 save
fi