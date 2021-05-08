const OPAL = {};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function codeRun() {
    if (bodyData) {
        let id = parsed.query.id;
        let data = OPAL[id];
        if (data) {
            const start = utils.time();
            let results;
            let error;
            try {
                if (data.async) {
                    results = await data.func(bodyData);
                } else {
                    results = data.func(bodyData);
                }
            } catch (err) {
                error = err;
                logger.warn('codeRun', err);
            }

            const duration = utils.time() - start;
            // console.log(results)
            // if(Array.isArray(results)) {
            //     results =results.join(',');
            // }

            let returnData = {
                results: results,
                duration: duration
            };

            if (error) {
                returnData.error = error;
            }
            utils.sendData(res, returnData);

            addLogExtra('results', returnData);
            //fun({a: 10, b: 20}).then(response => { console.log(response) });
        } else {
            utils.sendData(res, 'Function not found.', 404);
        }
    } else {
        utils.sendData(res, 'Missing parameter', 422);
    }
}

function codeSubmit() {
    if (bodyData) {
        let id = parsed.query.id;

        let async = typeof (parsed.query.async) !== 'undefined' ? parsed.query.async : false;

        let data = {
            id: id,
            code: utils.compressString(bodyData),
            hash: utils.hash(bodyData, 'sha256'),
            created: Date.now(),
            status: 0,
            size: bodyData.length,
            async
        };

        try {
            utils.sendData(res, data);
            const func = async ?new AsyncFunction('data', bodyData): new Function('data', bodyData);
            OPAL[id] = {
                ...data,
                func
            };
            logger.debug('codeSubmit', data);
        } catch (error) {
            utils.sendData(res, error);
            logger.warn('codeSubmit', error);
        }
    } else {
        utils.sendData(res, 'Missing parameter', 422);
    }
}
