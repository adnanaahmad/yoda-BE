#!/bin/bash

cd /home/ec2-user

curl -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

tar -xvf didservice.tar.gz --directory fortifid

rm -rf didservice.tar.gz

cd fortifid
npm i
pm2 restart all

#./setup.sh
