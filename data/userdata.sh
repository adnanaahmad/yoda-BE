  #!/bin/bash

  echo "didservice setup starting..."

  cd /home/ec2-user

  aws s3 cp s3://barb-dev/didservice-master.tar.gz didservice-master.tar.gz
  tar -xvf didservice-master.tar.gz

  mv didservice-master didservice
  rm didservice-master.tar.gz

  sudo chown -R ec2-user:ec2-user didservice

  cd didservice

  sudo -u ec2-user bash -c './setup.sh'
  echo "didservice setup finished."
  