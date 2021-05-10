#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

cd /home/ec2-user

log "Updating Yoda..."

log "Downloading latest version..."

curl -s -O -J -L "https://i.dev.fortifid.com/data/od7kTXfGxDax/$ARCHIVE"

if [ ! -s "./$ARCHIVE" ]; then
    log "Failed to download archive. Cannot continue."    
    exit 1
fi

FILESIZE=$(stat -c%s "./$ARCHIVE")
if [ $FILESIZE -lt 100000 ]; then
    log "Invalid archive. $FILESIZE"
    exit 1
fi

cp "$FORTIFID_DIR/package.json" "$FORTIFID_DIR/package.json.old" 

log "Installing..."
#TODO: Maybe do rsync for this part as well after un-taring.
tar -zxf "./$ARCHIVE" --directory fortifid

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 1
fi

#Very important that the version is bumped each time
version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
old_version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json.old` 

if [ "$version" == "$old_version" ]; then
    log "Version $version is the same as the current version. Skipping update." 
    exit 1
fi 

mkdir -p ./backups
log "Backing up archive ($version)..."
mv "./$ARCHIVE" "./backups/$version.tar.gz"

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    log "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

#log "Deleting older backups..."
#sudo -u ec2-user bash -c "./scripts/trim.sh"

if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
    log "Syncing web server..."
    if [ -d /usr/share/nginx/html/data ]; then
        mv /usr/share/nginx/html/data /tmp/data
    fi

    RSYNC=$(rsync -av --delete "assets/html/" "/usr/share/nginx/html")        
    
    if [ -d /tmp/data ]; then
        mv /tmp/data /usr/share/nginx/html/data
    fi

    CHANGED=$($RYSNC | wc -l)
    if [ $CHANGED -gt 5 ]; then
        log "$RSYNC"
    else
        log "No changes detected."
    fi

    log "Syncing web server configuration files..."
    RSYNC=$(rsync -av "assets/nginx/" "/etc/nginx")
    CHANGED=$($RYSNC | wc -l)
    if [ $CHANGED -gt 4 ]; then
        log "$RSYNC"
        start_nginx
    else
        log "No changes detected."
    fi
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

log "Done. Version $version installed."
