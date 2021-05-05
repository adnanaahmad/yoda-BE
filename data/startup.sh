#!/bin/bash

echo "Last reboot time: $(date)" > /etc/motd
#sudo -u ec2-user bash -c "./update.sh reload"
