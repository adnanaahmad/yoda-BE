# DirectID service
## Description
Coming

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
1. Create a read-only account to the didservice repo.
2. Store these credentials by enabling this:
   ```bash 
    git config credential.helper store
    ```
3. Add the remote:
   ```bash 
    git remote add origin https://gitlab.com/fortifid/internal/engineering/didservice.git
    ```
4. Then run *./update.sh* and enter the credentials from step 1.
5. Now the service can be easily updated by hitting the */update/* endpoint.

