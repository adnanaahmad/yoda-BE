'use strict';
/*jshint esversion: 8 */

const prefixes = [
    'Alderman',
    'Dr',
    'Miss',
    'Mr',
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

function clean(str) {
    return str.replace(/[^a-z-A-Z ]/g, "").replace(/ +/, " ")
}

let pattern;



(async () => {
    prefixes.forEach(item => {
        item = clean(item.toLowerCase());
        combined.push(`${item} *`);
    })

    suffixes.forEach(item => {
        item = clean(item.toLowerCase());
        combined.push(` ${item}`);
    })

        //let pattern = /\b(?:Prof\.? *|Dr\. *|, Phd)\b/g;
    pattern = `/\b(?:${combined.join('|')})\b/g`;
    pattern = `(?:${combined.join('|')})`;
    let test = new RegExp(pattern, 'gi');
    console.log('mr francis lacson'.replace(test, ''));
   
})();