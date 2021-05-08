#!/bin/bash

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

start_nginx() {
    if [ -f /etc/nginx/ssl/cert.pem -a -f /etc/nginx/ssl/key.pem -a -f /etc/nginx/ssl/chain.pem ]; then
        if systemctl is-active --quiet nginx ; then
            sudo service nginx restart
        else
            sudo service nginx start
        fi
    else
        log "Required certificate(s) missing. Cannot start nginx."
        return 1
    fi        
}
