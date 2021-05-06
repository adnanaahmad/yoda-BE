#!/bin/bash

FILE=~/fortifid/.env
if test -f "$FILE"; then
    . $FILE
fi

echo "$(date)" >> /home/ec2-user/reboots

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep instanceId | awk -F\" '{print $4}')
sed -i "s/\(INSTANCE_ID=\)\(.*\)/\1$INSTANCE_ID/" $FILE

if [ -n "$ALLOCATION_ID" ]; then
    aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOCATION_ID
fi

#/home/ec2-user/fortifid/data/update.sh reload >/home/ec2-user/last-update.txt
