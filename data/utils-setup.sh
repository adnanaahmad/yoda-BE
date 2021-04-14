#!/bin/bash

sudo su ec2-user 

cd /homes/ec2-user
mkdir dev
mkdir test
mkdir server
mkdir utils

sudo amazon-linux-extras install nginx1 -y
sudo yum install socat git -y 

sudo systemctl enable nginx.service
sudo systemctl start nginx.service

sudo chown -R ec2-user:nginx /usr/share/nginx/html/
sudo chown -R ec2-user:ec2-user /etc/nginx/

mkdir /etc/nginx/ssl 
openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

sudo echo ec2-user > /etc/cron.allow 

curl https://get.acme.sh | sh -s email=support@fortifid.com 

source ~/.bashrc

acme.sh --upgrade --auto-upgrade 

#acme.sh --issue -d z.dev.fortifid.com -w /usr/share/nginx/html --keylength ec-256
#--ecc

acme.sh --issue -d z.dev.fortifid.com -w /usr/share/nginx/html

acme.sh --install-cert -d z.dev.fortifid.com  \
--key-file       /etc/nginx/ssl/key.pem  \
--fullchain-file /etc/nginx/ssl/cert.pem \
--reloadcmd     "sudo systemctl force-reload nginx.service"


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


sudo su ec2-user
cd /home/ec2-user/didservice/templates/emails
curl -O -J -L https://i.dev.fortifid.com/data/od7kTX/directid_email.html

cd /home/ec2-user/didservice
curl -O -J -L https://i.dev.fortifid.com/data/od7kTX/service-did.js
curl -O -J -L https://i.dev.fortifid.com/data/od7kTX/utils.js
pm2 restart service-did

curl -F upload=@name-match.js https://i.dev.fortifid.com/u/?key=1234

curl -O -J -L https://i.dev.fortifid.com/data/od7kTX/alex-1.0.0.jar
