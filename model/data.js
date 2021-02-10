'use strict';

export default class Data {
    constructor(key, value) {
        this.#key = key;
        this.#value = value;
    }

    get key() {
        return this.#key;
    }

    set key(key) {
        this.#key = key;
    }

    get value() {
        return this.#value;
    }

    set value(value) {
        this.#value = value;
    }

    equals(data) {
        if(this === data) {
            return true;
        }       

        if(!data && (this.#key || this.#value)) {
            return false;
        }

        return data.key === this.#key && data.value === this.#value; 
    }
}