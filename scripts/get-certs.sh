#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

if [ -z "$1" ]; then
    log "Domain name required. Cannot continue."
    exit 1
fi

if [! -d "/etc/nginx/ssl" ]; then
    
    exit 1
fi

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

log "Certificate check/update for $1"

aws ssm get-parameter --name "/config/apigw/client/chain.pem" > /etc/nginx/ssl/chain.pem --with-decryption --output text --query Parameter.Value

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
