#!/bin/bash

FILE=~/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

export LE_WORKING_DIR="/home/ec2-user/.acme.sh"
ACME="/home/ec2-user/.acme.sh/acme.sh"

$ACME --upgrade --auto-upgrade --force

$ACME --issue --dns dns_aws -d $HOST --force
    
$ACME --install-cert -d $HOST  \
--key-file       /etc/nginx/ssl/key.pem  \
--fullchain-file /etc/nginx/ssl/cert.pem \
--reloadcmd     "sudo service nginx restart" --force