#!/bin/bash
FORTIFID_DIR=/home/ec2-user/fortifid
ENV_FILE="$FORTIFID_DIR/.env"

NODE=14.16.1
NPM=6.14.13

ARCHIVE="didservice.tar.gz"

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
            sudo service nginx restart
        else
            sudo service nginx start
        fi
    else
        log "Required certificate(s) missing. Cannot start nginx."
        return 1
    fi        
}

if [ "$(whoami)" != "ec2-user" ]; then
  log "Only ec2-user can run this script."
  exit 1
fi

if [ ! -d "$FORTIFID_DIR" ]; then
    log "$FORTIFID_DIR does not exist. Setup cannot continue."
    exit 1
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
fi

cp "$FORTIFID_DIR/package.json" "$FORTIFID_DIR/package.json.old" 

log "Installing..."
#TODO: Maybe do rsync for this part as well after un-taring.
tar -zxf didservice.tar.gz --directory fortifid

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 1
fi

#Very important that the version is bumped each time
version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
old_version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json.old` 

if [ "$version" == "$old_version" ]; then
    log "Version $version is the same as the current version. Skipping the rest." 
    exit 1
fi 

mkdir -p ./backups
log "Backing up archive ($version)..."
mv didservice.tar.gz "./backups/$version.tar.gz"

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    log "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

if [ "$IGNORE_HTTPD" != "1"  ]; then
    if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
        log "Syncing web server..."
        rsync -av --delete "assets/html/" "/usr/share/nginx/html"
        log "Syncing web server configuration files..."
        rsync -av "assets/nginx/" "/etc/nginx"
        start_nginx
    fi
fi

if [ "$(npm -v)" != "$NPM" ]; then
    log "Installing NPM $NPM..."
    npm i -g "npm@$NPM"
fi

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

log "Done."
