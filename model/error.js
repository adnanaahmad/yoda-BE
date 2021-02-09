'use strict';

module.exports = class Error {
    constructor(error_message, timestamp) {
        this.#error_message = error_message;
        this.#timestamp = timestamp;
    }

    get error_message() {
        return this.#error_message;
    }

    set error_message(error_message) {
        this.#error_message = error_message;
    }

    get timestamp() {
        return this.#timestamp;
    }

    set timestamp(timestamp) {
        this.#timestamp = timestamp;
    }
}