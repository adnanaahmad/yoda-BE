#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

if [ -z "$1" ]; then
    log "Domain name required. Cannot continue."
    exit 1
fi

if [ ! -d "/etc/nginx/ssl" ]; then
    log "/etc/nginx/ssl does not exist. Cannot continue."
    exit 1
fi

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

copy() {
    if sudo test -f "$CHAIN" ; then
        if ! test -f /etc/nginx/ssl/cert.pem -o $(sudo diff "$CHAIN" /etc/nginx/ssl/cert.pem | wc -l) -gt 0 ; then
            log "Copying certs..."
            sudo cp -f "$CHAIN" /etc/nginx/ssl/cert.pem
            sudo cp -f "$KEY" /etc/nginx/ssl/key.pem
            sudo chown -R ec2-user:ec2-user /etc/nginx/ssl
            return 0
        else 
            return 1
        fi
    else 
        log "Certs not available to copy."
        return 1
    fi
}

log "Certificate check/update for $1"

log "Copying latest chain.pem from the parameter store."
#TODO: We have to track and restart if this changed.
aws ssm get-parameter --name "/config/apigw/client/chain.pem" > /etc/nginx/ssl/chain.pem --with-decryption --output text --query Parameter.Value

if sudo test -f "$CHAIN" ; then
    if sudo /usr/local/bin/certbot renew ; then
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
