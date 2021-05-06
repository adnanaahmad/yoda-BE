#!/bin/bash

# Make sure to set the S3 bucket

# us-east-1
#export DID_S3_BUCKET=s3://opalapp-opal-dev-use1-ap-fortifidstaticassetsbuck-fcko7emh9u2i/build/directid && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# us-west-1
#export DID_S3_BUCKET=s3://opalapp-opal-dev-usw1-ap-fortifidstaticassetsbuck-kgbssmqm2man/build/directid && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# us-west-2
#export DID_S3_BUCKET=s3://fortifid-opalv2-dev-usw2-fortifidstaticassetsbuck-45sqjyoln3uf/build/directid && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# sandbox us-east-1
#export DID_S3_BUCKET=s3://opalapp-opal-sandbox-use-fortifidstaticassetsbuck-7o971gu4b9lk/build/directid && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh

# global
#export DID_S3_BUCKET=https://dev.barbarians.com/data/od7kTX && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /home/ec2-user/ && chmod +x /home/ec2-user/install.sh && /home/ec2-user/install.sh
#curl -O -J -L https://dev.barbarians.com/data/od7kTX/didservice.tar.gz

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}


FILE=/home/ec2-user/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

if [ -n "$DID_S3_BUCKET" ]; then
    log "Yoda install starting..."

    cd /home/ec2-user

    #temp workaround for cert permission issues
    sudo chown root:ec2-user -R /etc/letsencrypt
    sudo chmod g+r -R /etc/letsencrypt
    sudo chmod g+x /etc/letsencrypt/live/
    sudo chmod g+x /etc/letsencrypt/archive/
    ###########################################

    aws s3 cp $DID_S3_BUCKET/didservice.tar.gz .
    
    mkdir  /home/ec2-user/fortifid

    tar -xvf didservice.tar.gz --directory fortifid

    mkdir -p ./backups
    version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
    log "Backing up archive ($version)..."
    mv didservice.tar.gz "./backups/$version.tar.gz"

    sudo chown -R ec2-user:ec2-user fortifid
    sudo chown -R ec2-user:ec2-user backups

    cd fortifid
    

    sudo -u ec2-user bash -c "./setup.sh"

    log "Yoda install finished."        
else
    log "DID_S3_BUCKET not set."
fi
