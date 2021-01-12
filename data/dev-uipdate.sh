#!/bin/bash
curl -s -O https://dev.barbarians.com/data/od7kTX/didservice.tar.gz
tar -xvf didservice.tar.gz
rsync -auv didservice-master/ didservice/
rm -rf didservice-master*
cd didservice
npm install 
npm update
./setup.sh
pm2 restart index.js 
