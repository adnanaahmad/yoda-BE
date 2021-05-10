#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

echo "$(date)" >> /home/ec2-user/reboots

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep instanceId | awk -F\" '{print $4}')
sed -i "s/\(INSTANCE_ID=\)\(.*\)/\1$INSTANCE_ID/" $ENV_FILE

if [ -n "$ALLOCATION_ID" ]; then
    aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOCATION_ID
fi

. "$FORTIFID_DIR/scripts/update.sh" reload >/home/ec2-user/last-update.txt
