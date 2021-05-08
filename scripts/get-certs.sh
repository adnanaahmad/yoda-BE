#!/bin/bash

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

copy() {
    if [ -f "$CHAIN" ]; then
        log "Copying certs..."
        sudo cp -f "$CHAIN" /etc/nginx/ssl/cert.pem
        sudo cp -f "$KEY" /etc/nginx/ssl/key.pem
        sudo chown -R ec2-user:ec2-user /etc/nginx/ssl
        return 0
    else 
        log "Certs not available to copy."
        return 1
    fi
}

if [ -f "$CHAIN" ]; then
    if [ sudo /usr/local/bin/certbot renew > /dev/null ]; then
        if [ copy ] ; then
            sudo service nginx restart
        fi
    fi    
else 
    sudo /usr/local/bin/certbot certonly -n --agree-tos -m itsec@fortifid.com --dns-route53 -d "$1"
    if [ copy ] ; then
        sudo service nginx start
    fi
fi
