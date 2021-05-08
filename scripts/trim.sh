#!/bin/bash

BACKUP_DIR=/home/ec2-user/backups

if [ ! -d "$BACKUP_DIR" ]; then
    log "$BACKUP_DIR does not exist. Cannot continue."
    exit 1
fi

cd $BACKUP_DIR
if [ "$(pwd)" != "$BACKUP_DIR" ]; then
    echo "Unable to switch to $BACKUP_DIR. Cannot continue."
    exit 1
fi

ls -t | tail -n +6 | xargs rm --

echo 'Done.'