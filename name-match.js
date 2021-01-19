'use strict';
/*jshint esversion: 8 */

const similarity = require('string-similarity');

const prefixes = [
    'Alderman',
    'Dr',
    'Miss',
    'Mr',
    'Mister',
    'Mrs',
    'Ms',
    'Prof',
    'Rev'
]

const suffixes = [
    'A.B',
    'B.A.',
    'B.E',
    'B.F.A.',
    'B.S.',
    'B.Sc.',
    'B.Tech.',
    'D.Phil.',
    'Ed.D.',
    'Eng.D.',
    'Esquire',
    'Esq',    
    'L.L.B',
    'LL.D',
    'LL.M',
    'M.A.',
    'M.B.A.',
    'M.D.',
    'M.Eng',
    'M.F.A.',
    'M.L.A.',
    'M.S.',
    'M.Sc.',
    'Ph.D.'
];

const combined = [];
let pattern;

function clean(value, strip = false) {
    value =  value.replace(/[^a-z-A-Z ]/g, "").toLowerCase().replace(/ +/, " ");
    
    if(strip) {
        value = value.replace(pattern, '');
    }

    return value;
}

const compare =(a, b, ignoreMiddle = false)=> {
    if(a === null || b === null || typeof(a) !== 'string' || typeof(b) !== 'string' || a.length === 0 || b.length === 0 ) {
        return 0;
    }

    if(a === b) {
        return 1;
    }

    a = clean(a, true);
    b = clean(b, true);

    if(ignoreMiddle) {
        //TODO
    }

    // Dice's Coefficient 
    // https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient
    // Mostly better than Levenshtein distance 
    // https://en.wikipedia.org/wiki/Levenshtein_distance
    return similarity.compareTwoStrings(a, b);
}

function test() {
    console.log(pattern);
    console.log(compare('Mr Cisco Caceres, M.D.', 'Cisco Caceres'));
    console.log(compare('Mr Cisco Gerardo Caceres', 'Mister Cisco G Caceres'));
    console.log(compare('Cisco Gerardo Caceres', 'Cisco G. Caceres'));

    console.log(compare('Mr T Greenr', 'Mr T Greenr'));
    console.log(compare('Mr T Greenr', 'T Greenr'));
    console.log(compare('Mr T Greenr', 'Thomas Greenr'));
    console.log(compare('Mr T Greenr', 'T Green'));
    console.log(compare('Mr T Greenr', 'Mr T'));
}

(async () => {
    prefixes.forEach(item => {
        item = clean(item.toLowerCase());
        combined.push(`${item} *`);
    })

    suffixes.forEach(item => {
        item = clean(item.toLowerCase());
        combined.push(` ${item}$`);
    })

    pattern = new RegExp(combined.join('|'), 'g');
})();


module.exports = {
    compare
}
