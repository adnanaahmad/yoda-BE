'use strict';

export default class Answer {
    #parameters = [];
    constructor(parameters) {
        if (parameters) {
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