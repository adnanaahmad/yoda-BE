#!/bin/bash

# Which node version to use
NODE=14.15.3

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

wait() {
    while [ ! -f $1 ]
    do
        sleep 0.1 
    done
}

testcmd () {
    command -v "$1" >/dev/null
}

log "Setup begin."

if [ -d ~/.nvm -a ! -h ~/.nvm ]; then
    log "Node Version Manager already installed."
else
    log "Downloading and installing Node Version Manager..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    source ~/.bashrc
fi

if testcmd node; then
    log "Node already installed."
else    
    log "Installing Node v$NODE..."
    nvm install $NODE
fi

if [ -d ./node_modules -a ! -h ./node_modules ]; then
    log "Updating DirectID service..."
else
    log "Installing DirectID service..."
fi
npm install > /dev/null 2>&1

if test -f "./.env"; then
    log ".env already exist."
else
    log "Running secondary setup script..." 
    node setup.js
    wait ./.env
fi

if [ -d ~/.pm2 -a ! -h ~/.pm2 ]; then
    log "PM2 already installed."
else
    log "Installing PM2..."
    npm i -g pm2@latest

    log "Installing pm2-logrotate..."
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:compress true

    log "Adding startup command."
    startup=$(pm2 startup systemd| tail -1)
    eval $startup > /dev/null 2>&1

    pm2 start index.js
    pm2 save
fi

log "Setting  execute permissions..."
chmod +x ./update.sh

log "Setup complete."
