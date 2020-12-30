# DirectID Service

## Description
This is the DirectID micro-service. 

## Installation
Make sure git is installed.
```bash
sudo apt install git -y
#or
sudo yum install git -y
```
Then run the following:
```bash
git clone https://gitlab.com/fortifid/internal/engineering/didservice.git
cd didservice
# just in case
chmod +x ./setup.sh
./setup.sh
```
This will install everything required and initialize the environment variables to the current AWS region.

## Parameter Store
To populate the AWS parameter store:
```bash
node create-params.js
```
Then edit the SecureString values in the parameter store.
You can also edit the Values in the *./data/paramList.json* file. It's easier but it's not recommended due to security concerns.

After the parameters have been changed, restart the service:
```bash
pm2 restart index
```

## DynamoDB Table Creation
To create the DynamoDB table:
```bash
node create-tables.js
```

## Alternate Installation
Without requiring any interaction with the server, this can be achieved by the following:

1. Create a private and encrypted s3 object with the latest didservice source code (didservice-master.tar.gz).
2. Make sure the IAM role used has proper access to the s3 object.
3. When launching the instance, use the following **User data** (replace the s3 uri):
```bash
#!/bin/bash

echo "didservice setup starting..."

#CREATE_PARAMS=params
#CREATE_TABLES=tables

cd /home/ec2-user

aws s3 cp s3://barb-dev/didservice-master.tar.gz didservice-master.tar.gz
tar -xvf didservice-master.tar.gz

mv didservice-master didservice
rm didservice-master.tar.gz

sudo chown -R ec2-user:ec2-user didservice

cd didservice

sudo -u ec2-user bash -c "./setup.sh $CREATE_PARAMS $CREATE_TABLES"
echo "didservice setup finished."
```
4. Done.
  
## No hassle updating (coming soon)
The DirectID service has the ability to easily update itself. To do this do the following:
1. Create a read-only account to the didservice repo or create a read_repository access token here: https://gitlab.com/-/profile/personal_access_tokens.
2. Store these credentials by enabling this:
  ```bash 
  git config credential.helper store
  ```
4. Add the remote:
  ```bash 
  git remote add origin https://gitlab.com/fortifid/internal/engineering/didservice.git
  ```
5. Then run *./update.sh* and enter the credentials from step 1.
6. Now the service can be easily updated by hitting the */update/* endpoint.

## Rest Command Test
The api-v1.http file allows you to test the endpoints interactively.
It requires the Rest Client (humao.rest-client) extension.

## Dynamic Code
We're able to also upload and execute code on the fly without any recompilation. 

We would then have an approval and evaluation process.

The code is run in a sandbox so the code will only have access to built-in javascript functions which we can easily limit and to functions and data we give each script access to.

See api-v1.http under # Dynamic Code # for proof-of-concept examples.

When submitting code for evaluation we would have something similar in our database:
```json
{
  "id": "uuid",
  "replacing": "id_to_replace",
  "replacing_version": "old_version",
  "code": "J3VzZSBzdHJpY3QnOwoKY29uc3QgdmFsaWRhdGVJbnB1dCA9KCk9PiB7Cn3IH3N1bW1hcnkgPSBkYXRhLscPO8cebWV0YcgbxAw7CgpsZXQgb3V0cHV0OwppZijHMSkgewogICDHGiA9xw/EAWVzdGltYXRlZEluY29tZTrIcy7PGSzJMmNvbmZpZGVuY2VTY29yyzLPGdkyRmxhZ3M6IHsuLugA0dA7xSJ9ykFyZXF1ZXN0U3RhcnRYIDogMNEbQ29tcGxldGUgOiBEYXRlLm5vdygp0SZEdXJhdGlvbjogMMUbfeQBamlmICjkAT7xASXHCXx8IHt9O8sbLuwAjyA95QGHyBRfdGltZXN0YW1w1DLoAIDJXcgZ6QC/LdRkO+QAp3JldHVybscfOw==", //compressed and base-64 encoded version of the code
  "hash": "XhJohTxpAMTYVn1vUylmZa7FkCqwj/Kq25XGuOnxZlA=", //sha256 of the original code
  "author" : "user_id",
  "author_notes": "", //Keep a history of these
  "created": 1609155982515,
  "reviewed_by" : "user_id",
  "review_date": "date",
  "review_notes": "", //We should keep a history of these
  "approved_by" : "user_id", 
  "approval_date": "date",
  "test_data": "some valid test data", //We could make these arrays later for multiple tests and results
  "test_results": "", //Expected results for validation that it works
  "status": 0,
  "service_group": "", //Which service(s) this belongs to
  "size": 589 //size of the original code
}
``` 

We can make this as complex as we want but for an initial version this would suffice. We can make parts of this similar to an issue tracking system and we can also incorporate version control functionality into this.


## Notes
This is designed to run many micro-services but for simplicity it is currently being run as one service.

The other services have been written for dual-mode: As libraries and as stand-alone service mode. They can be switched very easily but they require a running Redis cluster. With the Redis cluster each service can have as many instances as needed without needing any coordination; that is handled automatically. 

## Files
* api-v1.http: 
* aws-client.js:
* create-params.js:
* create-tables.js:
* handler-email.js:
* handler-twilio.js:
* handler-webhook.js:
* index.js:
* params.json:
* README.ms: This file.
* setup.js:
* setup.sh:
* upaate.sh:
* utils-q.js
* utils.js
* data/paramList.json:

## Roadmap

## TODO
* Code documentation.
* More logging.
* Scheduled (cron) log uploader and cleanup.
*  