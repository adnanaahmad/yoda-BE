#!/bin/bash

FILE=~/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

acme.sh --upgrade --auto-upgrade 

acme.sh --issue --dns dns_aws -d $HOST

acme.sh --install-cert -d $HOST  \
--key-file       /etc/nginx/ssl/key.pem  \
--fullchain-file /etc/nginx/ssl/cert.pem \
--reloadcmd     "sudo service nginx restart"
