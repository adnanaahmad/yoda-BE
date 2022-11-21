#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

CFG_FILE=/home/ec2-user/.cfg

if [ -f "$CFG_FILE" ]; then
    . $CFG_FILE
fi

log "Setup starting..."

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 0
fi

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 0
fi

if [ -z "$START" ]; then
    START="service-did.js helper-scheduler.js handler-twilio.js handler-email.js"
fi

if [ -d ~/.nvm -a ! -h ~/.nvm ]; then
    log "Node Version Manager already installed."
else
    log "Downloading and installing Node Version Manager..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
    source ~/.bashrc
fi

#TODO: node -v compare and install if different
if testcmd node ; then
    log "Node already installed."
else    
    log "Installing Node v$NODE..."
    nvm install $NODE > /dev/null 2>&1
    #Just to make sure since sometimes it installs an older version
    #npm install -g npm@latest
fi

if [ -d ./node_modules -a ! -h ./node_modules ]; then
    log "Updating FortifID services..."
else
    log "Installing FortifID services..."
fi

source ~/.bashrc

. "$FORTIFID_DIR/scripts/sync.sh"

npm i #> /dev/null 2>&1

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
    IFS=' ' read -ra ID <<< "$START"
    for i in "${ID[@]}"; do
        if [[ -f "$i" ]]; then
            pm2 start "$i" --exp-backoff-restart-delay=100 #-i max
            sleep 0.3
        else 
            echo "$i not found."
        fi
    done
    #pm2 start $START --exp-backoff-restart-delay=100 #--stop-exit-codes 111
    #pm2 start $START -i max --exp-backoff-restart-delay=100
    pm2 start helper-scheduler.js service-did.js --exp-backoff-restart-delay=100 #--stop-exit-codes 111
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
