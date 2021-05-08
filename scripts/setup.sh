#!/bin/bash

# Which node version to use
NODE=14.16.1
FORTIFID_DIR=/home/ec2-user/fortifid

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

wait() {
    while [ ! -f $1 ]; do
        sleep 0.1 
    done
}

testcmd () {
    command -v "$1" >/dev/null
}

if [ "$(whoami)" != "ec2-user" ]; then
  log "Only ec2-user can run this script."
  exit 1
fi

if [ ! -d $FORTIFID_DIR ]; then
    log "$FORTIFID_DIR does not exist. Setup cannot continue."
    exit 1
fi

log "Setup begin."

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 1
fi

FILE=/home/ec2-user/.cfg
if [ -f "$FILE" ]; then
    . $FILE
fi

if [ -z "$START" ]; then
    START=service-did,helper-scheduler
fi

if [ -d ~/.nvm -a ! -h ~/.nvm ]; then
    log "Node Version Manager already installed."
else
    log "Downloading and installing Node Version Manager..."
    curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    source ~/.bashrc
fi

if [ testcmd node ]; then
    log "Node already installed."
else    
    log "Installing Node v$NODE..."
    nvm install $NODE > /dev/null 2>&1
    #Just to make sure since sometimes it installs an older version
    #npm install -g npm@latest
fi

if [ -d ./node_modules -a ! -h ./node_modules ]; then
    log "Updating DirectID service..."
else
    log "Installing DirectID service..."
fi

source ~/.bashrc

npm install #> /dev/null 2>&1

mkdir -p .cache
mkdir -p uploads

if [ -f "./.env" ]; then
    log ".env already exist."
else
    #log "Running secondary setup script..." 
    #node setup.js
    log "Creating .env file..."
    CREATED=$(date +%s%N | cut -b1-13)
    echo "CREATED=$CREATED" > ./.env

    if [ -n "$HOST" ]; then
        echo "HOST=$HOST" >> ./.env
    fi

    REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
    sudo -u ec2-user aws configure set region $REGION
    echo "AWS_REGION=$REGION" >> ./.env
    
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep instanceId | awk -F\" '{print $4}')
    echo "INSTANCE_ID=$INSTANCE_ID" >> ./.env
    
    #TODO!
    #ALLOCATION_ID=$(aws ec2 describe-addresses --filters "Name=instance-id,Values=$INSTANCE_ID" | grep AllocationId | awk -F\" '{print $4}')
    #echo "ALLOCATION_ID=$ALLOCATION_ID" >> ./.env

    echo "LOG_GROUP_NAME=didservice" >> ./.env
    #echo "LOG_LEVEL=http" >> ./.env
    # For now until this is production ready.
    echo "LOG_LEVEL=debug" >> ./.env

    echo "RUN_MODE=PROD" >> ./.env

    if [ -n "$DID_S3_BUCKET" ]; then
        echo "DID_S3_BUCKET=$DID_S3_BUCKET" >> ./.env
    fi

    log "Configuring apigw command..."
    APIGWCMD=$(curl -o- -s http://169.254.169.254/latest/user-data |grep "/apigw")
    if [ -n "$APIGWCMD" ]; then
        echo "APIGWCMD=\"$APIGWCMD\"" $ >> ./.env
    fi

    if [ -n "$START" ]; then
        echo "START=$START" >> ./.env
    fi
fi

if [ -d ~/.pm2 -a ! -h ~/.pm2 ]; then
    log "PM2 already installed."
    source ~/.bashrc
    # This will ensure the even when updating PM2 it starts the services.
    pm2 delete  all
else
    log "Installing PM2..."
    npm i -g pm2@latest > /dev/null 2>&1
    source ~/.bashrc
    
    # Since we're now logging to CloudWatch we probably don't need this
    # log "Installing pm2-logrotate..."
    # pm2 install pm2-logrotate > /dev/null 2>&1
    # pm2 set pm2-logrotate:compress true > /dev/null 2>&1

    log "Adding startup command."
    startup=$(pm2 startup systemd| tail -1)
    eval $startup > /dev/null 2>&1
fi

if [ -n "$START" ]; then
    IFS=',' read -ra ID <<< "$START"
    for i in "${ID[@]}"; do
        pm2 start "$i.js"
    done
    pm2 save
fi

if [ "$P" == "1" ]; then
    log "Creating parameters..."
    node create-params.js
fi

if [ "$T" == "1" ]; then
    log "Creating tables..."
    node create-tables.js
fi

log "Setup complete."
