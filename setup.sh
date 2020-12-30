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
    curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    source ~/.bashrc
fi

if testcmd node; then
    log "Node already installed."
else    
    log "Installing Node v$NODE..."
    nvm install $NODE > /dev/null 2>&1
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
    #log "Running secondary setup script..." 
    #node setup.js
    log "Configuring AWS region data..."
    REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
    sudo -u ec2-user aws configure set region $REGION
    echo "AWS_REGION=$REGION" > ./.env
fi

if [ -d ~/.pm2 -a ! -h ~/.pm2 ]; then
    log "PM2 already installed."
else
    log "Installing PM2..."
    npm i -g pm2@latest > /dev/null 2>&1
    source ~/.bashrc
    
    log "Installing pm2-logrotate..."
    pm2 install pm2-logrotate > /dev/null 2>&1
    pm2 set pm2-logrotate:compress true > /dev/null 2>&1

    log "Adding startup command."
    startup=$(pm2 startup systemd| tail -1)
    eval $startup > /dev/null 2>&1

    pm2 start index.js
    pm2 save
fi

if [ "$1" == "params" ] || [ "$2" == "params" ] 
then
    log "Creating parameters..."
    node create-params.js
fi

if [ "$1" == "tables" ] || [ "$2" == "tables" ] 
then
    log "Creating tables..."
    node create-tables.js
fi

log "Setting  execute permissions..."
chmod +x ./update.sh

log "Setup complete."
