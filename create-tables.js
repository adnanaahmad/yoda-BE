const awsClient = require('./aws-client');

(async () => {
    let params = {
        'TableName': 'DIRECTID_INCOME',
        'BillingMode': 'PAY_PER_REQUEST',
        'AttributeDefinitions': [
          {
            'AttributeName': 'CustomerAccountID',
            'AttributeType': 'S'
          },
          {
            "AttributeName": "RequestTimestamp",
            "AttributeType": "S"
          }
        ],
        'KeySchema': [
          {
            'AttributeName': 'CustomerAccountID',
            'KeyType': 'HASH'
          },
          {
            "AttributeName": "RequestTimestamp",
            "KeyType": "RANGE"
          }
        ]
    };
    //let result = await awsClient.describeTable('DIRECTID_INCOME4');
    //console.log(JSON.stringify(result, null, 2));
    let result = await awsClient.createTable(params);
    if(typeof(result) !== 'undefined') {
        console.log('Table has been created.');
    }
})();
