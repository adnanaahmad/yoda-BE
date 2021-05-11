#!/bin/bash

if [ -z "$SHARED_LOADED" ]; then
    . "/home/ec2-user/fortifid/scripts/shared.sh"
fi

BACKUP_DIR=/home/ec2-user/backups

if [ ! -d "$BACKUP_DIR" ]; then
    log "$BACKUP_DIR does not exist. Cannot continue."
    exit 0
fi

cd $BACKUP_DIR
if [ "$(pwd)" != "$BACKUP_DIR" ]; then
    log "Unable to switch to $BACKUP_DIR. Cannot continue."
    exit 0
fi

ls -t | tail -n +6 | xargs rm --

echo 'Done.'
