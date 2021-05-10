#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

if [ "$(npm -v)" != "$NPM" ]; then
    log "Installing NPM $NPM..."
    npm i -g "npm@$NPM"
else
    log "NPM version checked."
fi

#TOD: Need to sync pm2 and Node
