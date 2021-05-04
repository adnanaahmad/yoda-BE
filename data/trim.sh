#!/bin/bash

rm `ls /homes/ec2-user/backups -t | awk 'NR>3'`
echo 'Done.'