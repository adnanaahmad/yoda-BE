const awsClient = require('./aws-client');

(async () => {
    let params = {
        'TableName': 'DIRECTID_INCOME',
        'BillingMode': 'PAY_PER_REQUEST',
        'AttributeDefinitions': [
          {
            'AttributeName': 'requestId',
            'AttributeType': 'S'
          }
        ],
        'KeySchema': [
          {
            'AttributeName': 'requestId',
            'KeyType': 'HASH'
          }
        ]
    };

    let result = await awsClient.createTable(params);
    if(typeof(result) !== 'undefined') {
        console.log('Table has been created.');
    }
})();
