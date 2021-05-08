#!/bin/bash

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

echo dirname "$0"

if [ -f utils.sh ]; then
    . utils.sh
fi

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

if [ -z "$1" ]; then
    log "Domain name required. Cannot continue."
    exit 1
fi

if [ -f "$CHAIN" ]; then
    if [ sudo /usr/local/bin/certbot renew > /dev/null ]; then
        if copy ; then
           start_nginx
        fi
    fi  
else 
    sudo /usr/local/bin/certbot certonly -n --agree-tos -m itsec@fortifid.com --dns-route53 -d "$1"
    if copy ; then
        start_nginx
    fi
fi
