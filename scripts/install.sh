#!/bin/bash

# This is for setting up the did service.
FORTIFID_DIR=/home/ec2-user/fortifid
ENV_FILE="$FORTIFID_DIR/.env"

# Make sure to set the S3 bucket
# dev us-east-1
#export DID_S3_BUCKET=s3://opalapp-opal-dev-use1-ap-fortifidstaticassetsbuck-fcko7emh9u2i/build/directid && export T=0 && export P=0 && aws s3 cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# dev us-west-1
#(export DID_S3_BUCKET=s3://opalapp-opal-dev-usw1-ap-fortifidstaticassetsbuck-kgbssmqm2man/build/directid && export T=0 && export P=0 && aws s3 cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh) >/home/ec2-user/install.txt 2>&1 

# dev us-west-2
#export DID_S3_BUCKET=s3://fortifid-opalv2-dev-usw2-fortifidstaticassetsbuck-45sqjyoln3uf/build/directid && export T=0 && export P=0 && aws s3 cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# sandbox us-east-1
#export DID_S3_BUCKET=s3://opalapp-opal-sandbox-use-fortifidstaticassetsbuck-7o971gu4b9lk/build/directid && export T=0 && export P=0 && aws s3 cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# global
#export DID_S3_BUCKET=https://i.dev.fortifid.com/data/od7kTXfGxDax && export T=0 && export P=0 && cd /home/ec2-user/ && curl -s -O -J -L "$DID_S3_BUCKET/install.sh" && chmod +x ./install.sh && ./install.sh

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

if [ -d "$FORTIFID_DIR" ]; then
    log "FortifID already installed. Cannot continue."
    exit 1
fi

if [ -z "$DID_S3_BUCKET" ]; then
    log "DID_S3_BUCKET not set."
    exit 1
fi

if [ -f "$ENV_FILE" ]; then
    . $ENV_FILE
fi

log "Yoda install starting..."

cd /home/ec2-user

#temp workaround for cert permission issues
if [ -d /etc/letsencrypt ]; then
    sudo chown root:ec2-user -R /etc/letsencrypt
    sudo chmod g+r -R /etc/letsencrypt
    sudo chmod g+x /etc/letsencrypt/live/
    sudo chmod g+x /etc/letsencrypt/archive/
fi
###########################################

log "Downloading latest version..."
if [[ "$DID_S3_BUCKET" =~ ^s3.* ]]; then
    aws s3 cp "$DID_S3_BUCKET/didservice.tar.gz" .
else
    curl -s -O -J -L "$DID_S3_BUCKET/didservice.tar.gz"
fi

mkdir -p $FORTIFID_DIR

tar -xvf didservice.tar.gz --directory fortifid

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 1
fi

version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
log "Backing up archive ($version)..."
mkdir -p ./backups
mv didservice.tar.gz "./backups/$version.tar.gz"

sudo chown -R ec2-user:ec2-user fortifid
sudo chown -R ec2-user:ec2-user backups

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 1
fi

sudo -u ec2-user bash -c "./scripts/setup.sh"

log "Yoda install finished."        
