#!/bin/bash

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

cd /home/ec2-user
 
if [ -d ./fortifid -a ! -h ./fortifid ]; then
    log "Reverting Yoda to $1..."
    cp "/home/ec2-user/backups/$1" ./didservice.tar.gz
    
    if [ -s "didservice.tar.gz" ]; then 
        log "Installing..."
        tar -zxf didservice.tar.gz --directory fortifid
        rm -rf didservice.tar.gz
        log "Deleting archive..."
        cd fortifid
        #todo conditional npm i
        log "Checking and updating all packages..."
        npm i
        #pm2 reload all
        log "Done."
    fi
else
    log "fortifid directory not found"
fi
