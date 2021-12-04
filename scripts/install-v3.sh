#!/bin/bash

START_TIME=$(date +%s%3N)
# This will set up a brand new instance with the micro-services.
FORTIFID_DIR=/home/ec2-user/fortifid
CFG_FILE=/home/ec2-user/.cfg
ARCHIVE="didservice.tar.gz"

if [ -f "$CFG_FILE" ]; then
    . $CFG_FILE
fi

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

if [ -d "$FORTIFID_DIR" ]; then
    log "FortifID already installed. Cannot continue."
    exit 0
fi

if [ -z "$HOST" ]; then
    log "HOST not set. Cannot continue."
    exit 0
fi

log "Install for $HOST started..." 

REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
if [ -z "$REGION" ]; then
    log "REGION not available. Cannot continue."
    exit 0
fi

sudo -u ec2-user aws configure set region $REGION

cd /home/ec2-user

log "Installing extra services..."
sudo yum update -y
sudo amazon-linux-extras install nginx1 -y
sudo yum install socat -y 

sudo chown -R ec2-user:ec2-user /etc/nginx/
mkdir -p /etc/nginx/ssl

sudo chown -R ec2-user:nginx /usr/share/nginx/

#TODO: This makes it more secure but takes a few minutes by itself.
#openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

sudo systemctl enable nginx.service

log "Adding scheduled tasks..."
sudo chmod g+s /etc/cron.allow
sudo -u root bash -c "sudo echo ec2-user > /etc/cron.allow"
(crontab -l ; echo "@reboot sh /home/ec2-user/fortifid/scripts/startup.sh") | crontab - > /dev/null 2>&1

source ~/.bashrc

rm -rf /usr/share/nginx/html
mkdir /usr/share/nginx/html

#TODO: Could change this wiith aws s3 cp later
log "Downloading latest version..."
curl -O -J -L "https://api-uat.fortifid.com/data/od7kTXfGxDax/$ARCHIVE"

mkdir -p $FORTIFID_DIR

tar -xvf "./$ARCHIVE" --directory fortifid

if [ ! -f "$FORTIFID_DIR/package.json" ]; then
    log "package.json not found. Cannot continue."
    exit 0
fi

version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`

log "Backing up archive ($version)..."
mkdir -p ./backups
mv "./$ARCHIVE" "./backups/$version.tar.gz"

sudo chown -R ec2-user:ec2-user fortifid
sudo chown -R ec2-user:ec2-user backups

cd $FORTIFID_DIR
if [ "$(pwd)" != "$FORTIFID_DIR" ]; then
    echo "Unable to switch to $FORTIFID_DIR. Cannot continue."
    exit 0
fi

if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
    rsync -av --exclude "assets/html/data" --delete "assets/html/" "/usr/share/nginx/portal"
    rsync -av "assets/nginx/" "/etc/nginx"  
fi

log "Certificate check/update for $HOST"

#TODO: We have to track and restart if this changed.
if [ ! -f /etc/nginx/ssl/chain.pem ]; then
    log "Copying latest chain.pem from the parameter store."
    aws ssm get-parameter --name "/config/apigw/client/chain.pem" > /etc/nginx/ssl/chain.pem --with-decryption --output text --query Parameter.Value
fi

mv /etc/nginx/conf.d/setup.conf.disabled /etc/nginx/conf.d/setup.conf
mv /etc/nginx/conf.d/server.conf /etc/nginx/conf.d/server.conf.disabled

if systemctl is-active --quiet nginx ; then
    log "Restarting nginx..."
    sudo service nginx restart
else
    log "Starting nginx..."
    sudo service nginx start
fi
#sudo -u ec2-user bash -c "$FORTIFID_DIR/scripts/get-certs.sh $HOST"

acme.sh --issue -d "$HOST" -w /usr/share/nginx/portal

acme.sh --install-cert -d "$HOST" \
--key-file       /etc/nginx/ssl/key.pem \
--fullchain-file /etc/nginx/ssl/cert.pem \
--reloadcmd     "sudo service nginx force-reload"

if [ -f /etc/nginx/ssl/key.pem ]; then
    log "Enabling HTTPS..."
    mv /etc/nginx/conf.d/setup.conf /etc/nginx/conf.d/setup.conf.disabled
    mv /etc/nginx/conf.d/server.conf.disabled /etc/nginx/conf.d/server.conf
    sudo service nginx restart
else 
    log "Certificate request failed."
fi

sudo -u ec2-user bash -c "$FORTIFID_DIR/scripts/setup.sh"

END_TIME=$(date +%s%3N)
DURATION=`expr $END_TIME - $START_TIME`

log "FortifID install finished in ${DURATION}ms."
