#!/bin/bash

CHAIN="/etc/letsencrypt/live/$1/fullchain.pem"
KEY="/etc/letsencrypt/live/$1/privkey.pem"

copy() {
    echo "Copying certs..."
    sudo cp -i "$CHAIN" /etc/nginx/ssl/cert.pem
    sudo cp -i "$KEY" /etc/nginx/ssl/key.pem
    sudo chown -R ec2-user:ec2-user /etc/nginx/ssl
}

if test -f "$CHAIN"; then
    if sudo /usr/local/bin/certbot renew > /dev/null
    then
        copy
        sudo service nginx restart
    fi    
else 
    sudo /usr/local/bin/certbot certonly -n --agree-tos -m itsec@fortifid.com --dns-route53 -d "$1"
    copy
    sudo service nginx start
fi
