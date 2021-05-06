#!/bin/bash

#export HOST="$1"
if [ -z "$HOST" ]
then
    echo "\$HOST not set."
else
    sudo su ec2-user 

    cd /home/ec2-user

    sudo amazon-linux-extras install nginx1 -y
    sudo yum install socat -y 

    sudo chown -R ec2-user:nginx /usr/share/nginx/
    sudo chown -R ec2-user:ec2-user /etc/nginx/

    mkdir /etc/nginx/ssl 
    #TODO: This makes it more secure but takes a few minutes by itself.
    #openssl dhparam -out /etc/nginx/ssl/dhparams.pem 2048 

    #TODO: For aws-cli v2
    # curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.0.30.zip" -o "awscliv2.zip"
    # unzip awscliv2.zip
    # sudo ./aws/install
    # rm -rf .aws

    #sudo echo ec2-user > /etc/cron.allow 
    sudo chmod g+s /etc/cron.allow
    sudo -u root bash -c "sudo echo ec2-user > /etc/cron.allow"

    (crontab -l ; echo "@reboot sh /home/ec2-user/fortifid/data/startup.sh") | crontab - > /dev/null 2>&1
    curl https://get.acme.sh | sh -s email=support@fortifid.com 

    source ~/.bashrc

    acme.sh --upgrade --auto-upgrade 

    #acme.sh --issue -d z.dev.fortifid.com -w /usr/share/nginx/html --keylength ec-256
    #--ecc
    #TXT _acme-challenge.j.prod.fortifid.com
    #acme.sh --issue -d $HOST -w /usr/share/nginx/html
    
    acme.sh --issue --dns dns_aws -d $HOST
    
    acme.sh --install-cert -d $HOST  \
    --key-file       /etc/nginx/ssl/key.pem  \
    --fullchain-file /etc/nginx/ssl/cert.pem \
    --reloadcmd     "sudo systemctl force-reload nginx.service"
    
    curl -O -J -L https://i.dev.fortifid.com/data/od7kTXfGxDax/didservice.tar.gz

    mkdir  /home/ec2-user/fortifid

    tar -xvf didservice.tar.gz --directory fortifid

    rm -rf didservice.tar.gz

    sudo chown -R ec2-user:ec2-user fortifid

    cd fortifid

    #rm -rf /usr/share/nginx/html/
    #mv assets/html/ /usr/share/nginx/

    rsync -av --delete "assets/html/" "/usr/share/nginx/html"  
    rsync -av "assets/nginx/" "/etc/nginx"  

    sudo systemctl enable nginx.service
    sudo systemctl start nginx.service

    sudo -u ec2-user bash -c "./setup.sh"

    echo "Fortifid setup finished."
fi