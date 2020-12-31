#!/bin/bash

curl -s -O https://dev.barbarians.com/data/xx/didservice-master.tar.gz
tar -xvf didservice-master.tar.gz
rsync -auv didservice-master/ didservice/
rm -rf didservice-master*
cd didservice
npm install 
npm update
pm2 restart index.js 
