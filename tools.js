'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');

(async () => {
    let orig = require('./data/paramList.json');
    const fields = {};

    orig.forEach(field => {
        let name = field.Name.replace(/\//g, '.').substr(1);
        utils.parseDotNotation(name, field.Value, fields);
    });


    utils.fileWrite('./data/didservice.json', JSON.stringify(fields, null, 2));
})();