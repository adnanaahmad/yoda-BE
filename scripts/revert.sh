#!/bin/bash

FORTIFID_DIR=/home/ec2-user/fortifid

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

if [ -z "$1" ]; then
    log "Version required."
    exit 1
fi

VERSION_FILE="/home/ec2-user/backups/$1"

if [ ! -d "$FORTIFID_DIR" ]; then
    log "$FORTIFID_DIR does not exist. Cannot continue."
    exit 1
fi
 
if [ ! -f "$VERSION_FILE" ]; then
    log "Version does not exist. Cannot continue."
    exit 1
fi

cd /home/ec2-user

log "Reverting Yoda to $1..."

cp $VERSION_FILE ./didservice.tar.gz

if [ ! -f "./didservice.tar.gz" ]; then
    log "Unable to copy version. Cannot continue."
    exit 1
fi

log "Installing..."
tar -zxf didservice.tar.gz --directory fortifid

log "Deleting archive..."
rm -f didservice.tar.gz

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

log "Checking and updating all packages..."
npm i

if [ "$1" = "reload" ]; then
    pm2 reload all
fi

log "Done."
