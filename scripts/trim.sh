#!/bin/bash

BACKUP_DIR=/home/ec2-user/backups

if [ ! -d "$BACKUP_DIR" ]; then
    log "$BACKUP_DIR does not exist. Cannot continue."
    exit 1
fi

rm "$BACKUP_DIR/(ls $BACKUP_DIR -t | awk 'NR>5')"
echo 'Done.'