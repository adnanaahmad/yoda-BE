#!/bin/bash

cd /home/ec2-user

curl -s -O https://dev.barbarians.com/data/od7kTX/didservice.tar.gz
tar -xvf didservice.tar.gz --directory didservice

rm -rf didservice.tar.gz

sudo chown -R ec2-user:ec2-user didservice

cd didservice
sudo -u ec2-user bash -c "./setup.sh"