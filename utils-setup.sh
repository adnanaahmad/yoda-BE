#!/bin/bash

sudo su ec2-user 

cd /homes/ec2-user
mkdir server
mkdir utils
mkdir dev

sudo amazon-linux-extras install nginx1 -y
sudo yum install socat git -y 

sudo chown -R ec2-user:nginx /usr/share/nginx/html 
sudo chown -R ec2-user:ec2-user /etc/nginx/ 

mkdir /etc/nginx/ssl 
openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

sudo echo ec2-user > /etc/cron.allow 

curl https://get.acme.sh | sh -s email=cisco@fortifid.com 

source ~/.bashrc

acme.sh --upgrade --auto-upgrade 

acme.sh --issue -d i.dev.fortifid.com -w /usr/share/nginx/html --keylength ec-256

acme.sh --install-cert -d i.dev.fortifid.com \
--key-file       /etc/nginx/ssl/key.pem  \
--fullchain-file /etc/nginx/ssl/cert.pem \
--reloadcmd     "sudo service nginx force-reload"


curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
source ~/.bashrc
nvm install 14.16.0
npm i -g pm2@latest
source ~/.bashrc

pm2 startup


pm2 start shotener.js
pm2 start forwarder.js

pm2 save


https://dev.barbarians.com/data/od7kTX/alex-1.0.0.jar

curl -O -J -L https://i.dev.fortifid.com/data/od7kTX/alex-1.0.0.jar
