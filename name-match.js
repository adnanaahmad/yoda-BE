'use strict';
/*jshint esversion: 8 */

const similarity = require('string-similarity');

let debug = false;

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
        //Hyst an indicator that it was an exact match
        return 1.3;
    }
    
    if(debug) {
        console.log(a , '~', b);
    }

    a = clean(a, true);
    b = clean(b, true);

    if(a === b) {
        //Hyst an indicator that it was an exact match
        return a.split(' ').length > 2 ? 1.2 : 1.1;
    }

    if(ignoreMiddle) {
        const removeMiddle = (name)=> {
            const parts = name.split(' ');
            if(parts.length > 2) {
                return parts[0] + ' ' + parts[parts.length -1]; 
            } else  {
                return name;
            }

        }
        a = removeMiddle(a);
        b = removeMiddle(b);
        //TODO
    }

    // Dice's Coefficient 
    // https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient
    // Mostly better than Levenshtein distance 
    // https://en.wikipedia.org/wiki/Levenshtein_distance
    if(debug) {
        console.log(a , '~', b);
    }
    return similarity.compareTwoStrings(a, b);
}

function test() {
    debug = true;
    console.log(pattern);
    console.log(compare('Mr Cisco Caceres, M.D.', 'Cisco Caceres'));
    console.log(compare('Mr Cisco Gerardo Caceres', 'Mister Cisco G Caceres'));
    console.log(compare('Cisco Gerardo Caceres', 'Cisco G. Caceres', false));

    console.log(compare('Cisco Gerardo Caceres', 'Cisco G. Caceres', true));

    console.log(compare('Mr T Greenr', 'Mr T Greenr'));
    console.log(compare('Mr T Greenr', 'T Greenr'));
    console.log(compare('Mr T Greenr', 'Thomas Greenr'));
    console.log(compare('Mr T Greenr', 'T Green'));
    console.log(compare('Mr T Greenr', 'Mr T'));
    console.log(compare('Mr T Greenr', 'Mr T'));

    console.log(compare('Vincent        zhou', 'WEI MIN Zhou', true));
    console.log(compare('FRANCIS GERARD LACSON', 'Francis Gerard Lacson', true));

    debug = false;
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
    //test();

})();


module.exports = {
    compare
}
