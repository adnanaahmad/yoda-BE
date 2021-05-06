#!/bin/bash

FILE=/home/ec2-user/.cfg
if test -f "$FILE"; then
    . $FILE
fi

timestamp() {
  date +"%Y-%m-%d %H:%M:%S.%3N"
}

log() {
    echo "$(timestamp): $1"
}

if [ -n "$HOST" ]
then
    log "Setup for $HOST started." 

    cd /home/ec2-user

    sudo amazon-linux-extras install nginx1 -y
    #sudo yum install socat -y 

    sudo chown -R ec2-user:nginx /usr/share/nginx/
    sudo chown -R ec2-user:ec2-user /etc/nginx/

    mkdir -p /etc/nginx/ssl 
    #TODO: This makes it more secure but takes a few minutes by itself.
    #openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

    #TODO: For aws-cli v2
    # curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.0.30.zip" -o "awscliv2.zip"
    # unzip awscliv2.zip
    # sudo ./aws/install
    # rm -rf .aws

    sudo chmod g+s /etc/cron.allow
    sudo -u root bash -c "sudo echo ec2-user > /etc/cron.allow"

    (crontab -l ; echo "@reboot sh /home/ec2-user/fortifid/data/startup.sh") | crontab - > /dev/null 2>&1
    
    (crontab -l ; echo "37 3 */30 * * /home/ec2-user/fortifid/data/get-certs.sh $HOST") | crontab - > /dev/null 2>&1

    source ~/.bashrc

    #TODO: Could change tthis wiith aws s3 cp later
    curl -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

    mkdir  -p /home/ec2-user/fortifid

    tar -xvf didservice.tar.gz --directory fortifid

    mkdir -p ./backups
    version=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' ./fortifid/package.json`
    log "Backing up archive ($version)..."
    mv didservice.tar.gz "./backups/$version.tar.gz"

    sudo chown -R ec2-user:ec2-user fortifid

    cd fortifid

    rsync -av --delete "assets/html/" "/usr/share/nginx/html"  
    rsync -av "assets/nginx/" "/etc/nginx"  

    sudo systemctl enable nginx.service
  
    sudo -u ec2-user bash -c "./data/get-certs.sh $HOST"
    
    sudo -u ec2-user bash -c "./setup.sh"

    log "Fortifid setup finished."
else
    echo "HOST not set."
fi