# DirectID service
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

## Notes
This is designed to run many micro-services but for simplicity it is currently being run as one service.

The other services have been written for dual-mode: As libraries and as stand-alone service mode. They can be switched very easily but they require a running Redis cluster. With the Redis cluster each service can have as many instances as needed without needing any coordination; that is handled automatically. 
