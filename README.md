# Yoda Installation and Updating

When the instance starts up or reboots it auto-updates the "binaries" and all the dependencies.

## Place the following in userdata. Make sure to change the HOST if needed.

```bash 
#!/bin/bash

if [ -d /home/ec2-user/fortifid -a ! -h /home/ec2-user/fortifid ]; then
     echo "Already installed."
else 
    export HOST=i.prod.fortifid.com
    export START=service-admin,service-mfa,service-veriff,service-did,helper-shortener,helper-uploader,helper-scheduler,handler-twilio,handler-email
    sudo -u ec2-user bash -c "(echo HOST=$HOST >/home/ec2-user/.cfg && echo START=$START >>/home/ec2-user/.cfg && curl https://i.dev.fortifid.com/data/od7kTXfGxDax/install-v2.sh | sh) >/home/ec2-user/install.txt 2>&1" 
fi
```

## Scripts
* install.sh - This is what is used by Cloud Formation to set up the DID service.
* install-v2.sh - This will completely set-up a brand new instance for the new micro-services architecture, including:
  * nginx with the revese proxies and va*rious optimizations.
  * Default website.
  * SSL cert for the server.
  * Permissions.
  * 
* finalize.sh - 
* get-certs.sh -Gets or renews the certificates.
* install-v2.sh - 
* install.sh - 
* revert.sh - Enables reverting to any previously backed-up version.
* setup.sh - Does the initial setup of all the binaries and dependencies.
* shared.sh - Shared functions and variables.
* start-all.sh - Run all the services listed in the START variable.
* startup.sh - Runs on every reboot. Runs the update script.
* sync.sh - Ensures NPM and other dependencies are up to date. 
* trim.sh - Keeps only the 5 latest backups.
* update.sh - Downloads and installs the latest versions of the binaries and keeps the dependecies up to date. This also creates a backup of each version.

## Services

* handler-email
* handler-sns
* handler-twilio
* handler-webhook

* helper-forwarder
* helper-shortener
* helper-scheduler
* helper-uploader

* service-admin
* service-auth
* service-code
* service-did
* service-experian
* service-mfa
* service-neustar
* service-opal
* service-sambasafety
* service-sl - SentiLink (disabled for now)
* service-synthetic-id
* service-veriff
 
## Admin Service

Your account must have the role of "admin" in order to use this.
https://{server}.fortifid.com/admin/v1/

https://z.dev.fortifid.com/admin/v1/


/config/shared/crypt/key_001
/config/shared/redis/url
