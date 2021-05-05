#!/bin/bash

echo "$(date)" >> /home/ec2-user/reboots

sudo -u ec2-user bash -c "/home/ec2-user/fortifid/data/update.sh reload >/home/ec2-user/last-update.txt"
