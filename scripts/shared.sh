#!/bin/bash

FORTIFID_DIR=/home/ec2-user/fortifid

NODE=14.17.4
NPM=7.20.3

ARCHIVE="didservice.tar.gz"

ENV_FILE="$FORTIFID_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    . $ENV_FILE
fi

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

wait() {
    while [ ! -f $1 ]; do
        sleep 0.1 
    done
}

testcmd () {
    command -v "$1" >/dev/null
}

start_nginx() {
    if [ -f /etc/nginx/ssl/cert.pem -a -f /etc/nginx/ssl/key.pem -a -f /etc/nginx/ssl/chain.pem ]; then
        if systemctl is-active --quiet nginx ; then
            log "Restarting nginx..."
            sudo service nginx restart
        else
            log "Starting nginx..."
            sudo service nginx start
        fi
    else
        log "Required certificate(s) missing. Cannot start nginx."
        return 1
    fi        
}

if [ "$(whoami)" != "ec2-user" ]; then
  log "Only ec2-user can run this script."
  exit 0
fi

if [ ! -d $FORTIFID_DIR ]; then
    log "$FORTIFID_DIR does not exist. Cannot continue."
    exit 0
fi

#$(which bash) "./finalize.sh"
SHARED_LOADED="true"

