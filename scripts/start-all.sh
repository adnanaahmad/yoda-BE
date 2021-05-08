#!/bin/bash

FORTIFID_DIR=/home/ec2-user/fortifid
START=service-admin,service-mfa,service-veriff,service-did,handler-email,handler-twilio,handler-webhook,helper-scheduler,helper-shortener,helper-uploader

if [ ! -d "$FORTIFID_DIR" ]; then
    log "$FORTIFID_DIR does not exist. Setup cannot continue."
    exit 1
fi

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

if [ -n "$START" ]; then
    IFS=',' read -ra ID <<< "$START"
    for i in "${ID[@]}"; do
        pm2 start "$i.js"
    done
    pm2 save
fi