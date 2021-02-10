const axios = require('axios').default;
const logger = require('./logger').createLogger('forwarder');
const timeout = 10000;

const cleanString = (str) => {
    if (typeof (str) !== "string" || str.length < 1)
        return '';

    let cleaned = str.replace(/(<([^>]+)>)|\r?\n|\r|[^\x20-\x7E]/ig, ' ').replace(/\s\s/g, '')
        .trim();;

    return cleaned;
}

const checkUrl = async (data, query, headers)=> {
    if(typeof(data) === 'undefined' || !query || !data.customerReference) {
        
        return;
    }
    
    const customerReference =  data.customerReference;
    const parts = customerReference.split(':');

    if(parts.length === 3) {
        
        let url;
        data.customerReference = `${parts[1]}:${parts[2]}`;
        switch(parts[0]) {
            case 'test': {
                url = 'https://webhook.site/b9550492-0c96-4b91-a495-43e93af1069c';
                break;
            }
            case 'dev': {{
                break;
            }}
        }

        if(url) {
            url = `${url}${query}`;
            let config = {
                method: 'post',
                url,
                //headers,
                data,
                timeout,
              }
            try {
                let results = await axios(config);
                if(results) {
                    logger.silly(`Results: ${results.status} ${results.statusText}`)
                }
            } catch (error) {   
                const data = error.response;
                let e = {
                    status: data.status,
                    error: cleanString(data.data)
                };
                logger.error(e);
            }

            return true;
        }
       
    }    
}

module.exports = {
    checkUrl,
}