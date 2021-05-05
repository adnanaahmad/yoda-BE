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

  const paramsCache = {
    "TableName": "CACHE_01",
    'BillingMode': 'PAY_PER_REQUEST',

    "AttributeDefinitions": [{
        "AttributeName": "_key",
        "AttributeType": "S"
      },
      {
        "AttributeName": "_type",
        "AttributeType": "S"
      }
    ],
    "KeySchema": [{
        "AttributeName": "_type",
        "KeyType": "HASH"
      },
      {
        "AttributeName": "_key",
        "KeyType": "RANGE"
      }
    ]
  }

  const cacheTTL = {
    "TableName": paramsCache.TableName,
    "TimeToLiveSpecification": {
      "AttributeName": "_expiresAt",
      "Enabled": true
    }
  }

  //let result = await awsClient.describeTable('DIRECTID_INCOME');
  const funcs = [];
  funcs.push(awsClient.createTable(paramsDirectIDIncome));
  funcs.push(awsClient.createTable(paramsDirectIDIncomeArchived));
  funcs.push(awsClient.createTable(paramsCache, cacheTTL));
  let result = await Promise.all(funcs);
  if (typeof (result) !== 'undefined') {
    console.log('Tables have been created.');
    //console.log(JSON.stringify(result, null, 2));
  }
})();