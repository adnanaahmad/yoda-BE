const awsClient = require('./aws-client');

(async () => {

  const paramsDirectIDIncome = {
    'TableName': 'DIRECTID_INCOME',
    'BillingMode': 'PAY_PER_REQUEST',
    'AttributeDefinitions': [{
        'AttributeName': 'CustomerAccountID',
        'AttributeType': 'S'
      },
      {
        "AttributeName": "TransactionID",
        "AttributeType": "S"
      },
      {
        "AttributeName": "requestStart",
        "AttributeType": "N"
      },
      {
        "AttributeName": "status",
        "AttributeType": "S"
      }
    ],
    'KeySchema': [{
        'AttributeName': 'CustomerAccountID',
        'KeyType': 'HASH'
      },
      {
        "AttributeName": "TransactionID",
        "KeyType": "RANGE"
      }
    ],
    "GlobalSecondaryIndexes": [{
      "IndexName": "status",
      "KeySchema": [{
          "AttributeName": "status",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "requestStart",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }]
  };

  const paramsDirectIDIncomeArchived = {
    'TableName': 'DIRECTID_INCOME_ARCHIVED',
    'BillingMode': 'PAY_PER_REQUEST',
    'AttributeDefinitions': [{
        'AttributeName': 'CustomerAccountID',
        'AttributeType': 'S'
      },
      {
        "AttributeName": "TransactionID",
        "AttributeType": "S"
      }
    ],
    'KeySchema': [{
        'AttributeName': 'CustomerAccountID',
        'KeyType': 'HASH'
      },
      {
        "AttributeName": "TransactionID",
        "KeyType": "RANGE"
      }
    ]
  };

  //let result = await awsClient.describeTable('DIRECTID_INCOME');
  const funcs = [];
  funcs.push(awsClient.createTable(paramsDirectIDIncome));
  funcs.push(awsClient.createTable(paramsDirectIDIncomeArchived));
  let result = await Promise.all(funcs);
  if (typeof (result) !== 'undefined') {
    console.log('Tables have been created.');
    //console.log(JSON.stringify(result, null, 2));
  }
})();