#!/bin/bash

#Make sure to set the S3 bucket
#export DID_S3_BUCKET=s3://barb-dev/latest && export T=0 && export P=0 && aws s3 --quiet cp $DID_S3_BUCKET/install.sh /tmp/ && chmod +x /tmp/install.sh && /tmp/install.sh

if [ -z "$DID_S3_BUCKET" ]
then
    echo "\$DID_S3_BUCKET not set."
else
    echo "DirectID Service setup starting..."

    cd /home/ec2-user

    aws s3 --quiet cp $DID_S3_BUCKET/didservice.tar.gz .

    tar -xvf didservice.tar.gz --directory didservice

    rm -rf didservice.tar.gz

    sudo chown -R ec2-user:ec2-user didservice

    cd didservice
    
    sudo -u ec2-user bash -c "./setup.sh"

    echo "DirectID Service setup finished."    
fi
