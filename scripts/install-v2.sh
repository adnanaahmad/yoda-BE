#!/bin/bash

# This will set up a brand new instance with the micro-services.

FORTIFID_DIR=/home/ec2-user/fortifid
CFG_FILE=/home/ec2-user/.cfg

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
    exit 1
fi

if [ -z "$HOST" ]; then
    log "HOST not set. Cannot continue."
    exit 1
fi

log "Install for $HOST started..." 

REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
if [ -z "$REGION" ]; then
    log "REGION not available. Cannot continue."
    exit 1
fi

sudo -u ec2-user aws configure set region $REGION

cd /home/ec2-user

log "Installing extra services..."
sudo amazon-linux-extras install nginx1 -y
#sudo yum install socat -y 

sudo chown -R ec2-user:ec2-user /etc/nginx/
mkdir -p /etc/nginx/ssl

aws ssm get-parameter --name "/config/apigw/client/chain.pem" > /etc/nginx/ssl/chain.pem --with-decryption --output text --query Parameter.Value

sudo chown -R ec2-user:nginx /usr/share/nginx/

#TODO: This makes it more secure but takes a few minutes by itself.
#openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

sudo systemctl enable nginx.service

#TODO: For aws-cli v2
# curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.0.30.zip" -o "awscliv2.zip"
# unzip awscliv2.zip
# sudo ./aws/install
# rm -rf .aws

log "Adding scheduled tasks..."
sudo chmod g+s /etc/cron.allow
sudo -u root bash -c "sudo echo ec2-user > /etc/cron.allow"

(crontab -l ; echo "@reboot sh /home/ec2-user/fortifid/scripts/startup.sh") | crontab - > /dev/null 2>&1

(crontab -l ; echo "37 3 */30 * * /home/ec2-user/fortifid/scripts/get-certs.sh $HOST") | crontab - > /dev/null 2>&1

source ~/.bashrc

#TODO: Could change this wiith aws s3 cp later
log "Downloading latest version..."
curl -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

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

if [ -d /etc/nginx -a ! -h /etc/nginx ]; then
    rsync -av --delete "assets/html/" "/usr/share/nginx/html"  
    rsync -av "assets/nginx/" "/etc/nginx"  
fi

sudo -u ec2-user bash -c "./scripts/get-certs.sh $HOST"

sudo -u ec2-user bash -c "./scripts/setup.sh"

log "Fortifid setup finished."
