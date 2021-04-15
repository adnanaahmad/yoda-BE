#!/bin/bash

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

wait() {
    while [ ! -f $1 ]
    do
        sleep 0.1 
    done
}

testcmd () {
    command -v "$1" >/dev/null
}

FILE=/home/ec2-user/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

cd /home/ec2-user
 
if [ -d ./fortifid -a ! -h ./fortifid ]; then
    log "Updating Yoda ["$HOST"]..."
    curl -s -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz
    if [ -s "didservice.tar.gz" ]
    then 
        tar -zxf didservice.tar.gz --directory fortifid

        rm -rf didservice.tar.gz
        #TODO: actually check for success
        log Success.
    fi
else
    log "fortifid directory not found"
fi

# cd fortifid
# #npm i
# pm2 restart all

#./setup.sh
