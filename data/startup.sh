#!/bin/bash

echo "$(date)" >> /home/ec2-user/reboots
echo "$(whoami)" > /home/ec2-user/who
sudo -u ec2-user bash -c "./update.sh reload >/home/ec2-user/last-update.txt"

