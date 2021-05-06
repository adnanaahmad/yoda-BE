#!/bin/bash

FILE=~/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

# export LE_WORKING_DIR="/home/ec2-user/.acme.sh"
# ACME="/home/ec2-user/.acme.sh/acme.sh"

# $ACME --upgrade --auto-upgrade

# $ACME --issue --dns dns_aws -d $HOST
    
# $ACME --install-cert -d $HOST  \
# --key-file       /etc/nginx/ssl/key.pem  \
# --fullchain-file /etc/nginx/ssl/cert.pem \
# --reloadcmd     "sudo service nginx restart"

#echo sudo /usr/local/bin/certbot certonly -n --agree-tos -m itsec@fortifid.com --dns-route53 -d "$1"
sudo /usr/local/bin/certbot certonly -n --agree-tos -m itsec@fortifid.com --dns-route53 -d "$1"

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

if test -f "$CHAIN"; then
    sudo cp "$CHAIN" /etc/nginx/ssl/cert.pem
    sudo cp "$KEY" /etc/nginx/ssl/key.pem
    sudo chown -R ec2-user:ec2-user /etc/nginx/ssl
    sudo service nginx start
fi
