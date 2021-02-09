'use strict';

module.exports = class Question {

    #parameters = [];

    constructor(dataSourceID, personaID, transactionID, parameters) {
        this.dataSourceID = dataSourceID;
        this.personaID = personaID;
        this.transactionID = transactionID;
        if(parameters) {
            this.#parameters = parameters;
        }
    }

    get parameters() {
        return this.#parameters;
    }

    set parameters(params) {
        this.#parameters = params;
    }

}

