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

cd /home/ec2-user


if [ -d ./fortifid -a ! -h ./fortifid ]; then
    log "Updating Fortifid..."
    curl -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

    tar -xvf didservice.tar.gz --directory fortifid

    rm -rf didservice.tar.gz
else
    log "fortifid directory not found"
fi

# cd fortifid
# #npm i
# pm2 restart all

#./setup.sh
