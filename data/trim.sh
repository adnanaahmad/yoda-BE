#!/bin/bash

rm `ls /homes/ec2-user/backups -t | awk 'NR>5'`
echo 'Done.'