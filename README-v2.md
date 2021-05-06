# Yoda Installation and Updating

## Admin Service

Your account must have the role of "admin" in order to use this.
https://{server}.fortifid.com/admin/v1/

https://z.dev.fortifid.com/admin/v1/

When the instance starts up or reboots it auto-updates the "binaries" and all the dependencies.

Place the following in userdata. Make sure to change the HOST if needed.
```bash 
#!/bin/bash

if [ -d /home/ec2-user/fortifid -a ! -h /home/ec2-user/fortifid ]; then
     echo "Already installed."
else 
    export HOST=axax.prod.fortifid.com
    sudo -u ec2-user bash -c "echo "HOST=$HOST" >/home/ec2-user/.host && curl https://i.dev.fortifid.com/data/od7kTXfGxDax/setup-v2.sh | sh"
fi
```
# for userdata:

#
#OR
#curl https://i.dev.fortifid.com/data/od7kTXfGxDax/setup-v2.sh | sh -s i.prod.fortifid.com
