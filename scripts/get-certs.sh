#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

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
