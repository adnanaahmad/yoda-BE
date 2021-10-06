#!/bin/bash

START_TIME=$(date +%s%3N)

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

if [ -z "$1" ]; then
    log "Version required."
    exit 0
fi

VERSION_FILE="/home/ec2-user/backups/$1"

if [ ! -d "$FORTIFID_DIR" ]; then
    log "$FORTIFID_DIR does not exist. Cannot continue."
    exit 0
fi

cd /home/ec2-user
version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`

if [ "$version" == "$1" ]; then 
   log "Current version is already $1."
    exit 0
fi

if [ ! -f "$VERSION_FILE" ]; then
    log "Version does not exist. Cannot continue."
    exit 0
fi

cp "$FORTIFID_DIR/package.json" "$FORTIFID_DIR/package.json.old" 

log "Reverting FortifID to $1..."

cp $VERSION_FILE "$ARCHIVE"

if [ ! -s "./$ARCHIVE" ]; then
    log "Unable to copy version. Cannot continue."
    exit 0
fi

FILESIZE=$(stat -c%s "./$ARCHIVE")
if [ $FILESIZE -lt 100000 ]; then
    log "Invalid archive. $FILESIZE"
    exit 0
fi

log "Installing..."
tar -zxf "./$ARCHIVE" --directory fortifid

log "Deleting archive..."
rm -f "./$ARCHIVE"

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 0
fi

if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
    log "Syncing web server..."
    rsync -av --exclude "assets/html/data" --delete "assets/html/" "/usr/share/nginx/portal"
    log "Syncing web server configuration files..."
    rsync -av "assets/nginx/" "/etc/nginx"
    start_nginx
fi

. "$FORTIFID_DIR/scripts/sync.sh"

CHANGED=$(diff "$FORTIFID_DIR/package.json" "$FORTIFID_DIR/package.json.old" | wc -l)
if [ $CHANGED -gt 4 ]; then
    log "Checking and updating all packages..."
    npm i
else 
    log "Skipping package check and update."
fi

if [ "$1" = "reload" ]; then
    pm2 reload all
fi

END_TIME=$(date +%s%3N)
DURATION=`expr $END_TIME - $START_TIME`

log "Finished in ${DURATION}ms."
