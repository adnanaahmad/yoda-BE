#!/bin/bash

FORTIFID_DIR=/home/ec2-user/fortifid
ENV_FILE="$FORTIFID_DIR/.env"

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

if [ "$(whoami)" != "ec2-user" ]; then
  log "Only ec2-user can run this script."
  exit 1
fi

if [ ! -d "$FORTIFID_DIR" ]; then
    log "$FORTIFID_DIR does not exist. Setup cannot continue."
    exit 1
fi

if [ -f "$ENV_FILE" ]; then
    . $ENV_FILE
fi

cd /home/ec2-user

log "Updating Yoda..."

log "Downloading latest version..."
curl -s -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

if [ ! -s "./didservice.tar.gz" ]; then
    log "Failed to download archive. Cannot continue."    
    exit 1
fi

log "Installing..."
#TODO: Maybe do rsync for this part as well after un-taring.
tar -zxf didservice.tar.gz --directory fortifid

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 1
fi

mkdir -p ./backups
version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
log "Backing up archive ($version)..."
mv didservice.tar.gz "./backups/$version.tar.gz"

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

if [ "$IGNORE_HTTPD" != "1"  ]; then
    if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
        rsync -av --delete "assets/html/" "/usr/share/nginx/html"  
        rsync -av "assets/nginx/" "/etc/nginx"
        sudo service nginx restart
    fi
fi

#todo conditional npm i
log "Checking and updating all packages..."
npm i

if [ "$1" = "reload" ]; then
    pm2 reload all
fi

log "Done."
