const fs = require('fs');
const syncRequest = require("sync-request");
const request = require("request");
const _ = require('lodash');
const natural = require('natural');
const url = require('url');
const helpers = require('./helpers');

const GITHUB = 'api.github.com';
const KEY = fs.readFileSync('key.txt', 'utf-8');
const BLACKLIST = new Set(JSON.parse(fs.readFileSync('blacklist.json')));
const ROOTS_CACHE = new Map();
const STEMMED_CACHE = new Map();
const JS_TASKS = 'javascript-tasks-';
const VERSTKA_TASKS = 'verstka-tasks-';
const TASK_COUNT = 1; // с 10 долго :(

function downloadTaskReadmes() {
    var tasks = [];
    for (var i = 1; i <= TASK_COUNT; i++) {
        tasks.push(getReadme(JS_TASKS, i));
        tasks.push(getReadme(VERSTKA_TASKS, i));
    }
    return tasks;
}

function getReadme(courseType, taskIndex) {
    var readmeUrl = url.format({
        protocol: 'https:',
        host: GITHUB,
        pathname: '/repos/urfu-2015/' + courseType + taskIndex + '/readme',
        query: {'access_token': KEY}
    });
    var options = {
        headers: {
            'User-Agent': 'request'
        }
    };
    var res = syncRequest('GET', encodeURI(readmeUrl), options);
    var json = JSON.parse(res.getBody());
    return Buffer(json['content'], json['encoding'])
        .toString('utf-8')
        .toLocaleLowerCase();
}
function getWordsByRoot() {
    var tasks = downloadTaskReadmes();
    return tasks.reduce((roots, taskText) => {
        getWordsFromText(taskText)
            .forEach(word => {
                var root = getWordRoot(word);
                console.log(`Root: ${root} Word ${word}`);
                updateRoots(roots, root, word);
            });
        return roots;
    }, new Map());
}

function updateRoots(roots, root, word) {
    if (roots.has(root)) {
        roots.get(root).push(word);
    } else {
        roots.set(root, [word]);
    }
}

function fillWordsByRootAsync(roots) {
    var tasks = downloadTaskReadmes();
    var words = getWordsFromText(tasks.join(' '));
    console.log("Total words count: " + words.length);
    return Promise.all(words.map(w => fillRootsAsync(w, roots)));
}

function fillRootsAsync(word, roots, host) {
    return new Promise(resolve => {
        host = host || helpers.VNUTRI_SLOVA;
        var stemmedWord = STEMMED_CACHE.has(word)
            ? STEMMED_CACHE.get(word)
            : natural.PorterStemmerRu.stem(word);
        STEMMED_CACHE.set(word, stemmedWord);
        if (ROOTS_CACHE.has(stemmedWord)) {
            roots.get(word).push(ROOTS_CACHE.get(stemmedWord));
            resolve();
            return;
        }
        var rootRequestUrl = helpers.urlBuilders[host](word);
        request(encodeURI(rootRequestUrl), function (error, response, body) {
            var root;
            root = helpers.siteParsers[host](body);
            if (body.indexOf('Нет такой страницы') > 0 || root === '') {
                root = stemmedWord;
            }
            ROOTS_CACHE.set(stemmedWord, root);
            updateRoots(roots, root, word);
            resolve();
        });
    });
}

function getWordRoot(word, host) {
    host = host || helpers.MORPHEME_ONLINE;
    if (ROOTS_CACHE.has(word)) {
        return ROOTS_CACHE.get(word);
    }
    var rootRequestUrl = helpers.urlBuilders[host](word);
    var res = syncRequest('GET', encodeURI(rootRequestUrl));
    if (res.statusCode === 404) {
        return natural.PorterStemmer.stem(word);
    }
    var root = helpers.siteParsers[host](res.getBody());

    if (root === '') {
        root = natural.PorterStemmer.stem(word);
    }
    ROOTS_CACHE.set(word, root);
    return root;
}

function getWordsFromText(text) {
    return text
        .split(/[^а-яё]/)
        .filter(item => item !== '')
        .filter(item => !BLACKLIST.has(item));
}
function getMostOccurringElement(array) {
    return _
        .chain(array)
        .groupBy()
        .orderBy('length', 'desc')
        .map(arr => [arr[0], arr.length])
        .value();
}
function count(word) {
    var sameWords = getWordsByRoot().get(getWordRoot(word));
    return _
        .chain(sameWords)
        .countBy(curWord => curWord === word)
        .value()['true'];
}
function top(n) {
    var rootToWords = list(getWordsByRoot().entries());
    return _
        .chain(rootToWords)
        .orderBy('[1].length', 'desc')
        .take(n)
        // [root, [array of words with this root]
        .map(pair => pair[1][0] + ": " + pair[1].length)
        .value();
}
function countAsync(word, cb) {
    var roots = new Map();
    var root = getWordRoot(word, helpers.VNUTRI_SLOVA);
    fillWordsByRootAsync(roots).then(() => {
        var ans = roots.get(root) || 0;
        cb(ans.length);
        console.log(new Date());
    });
}

function topAsync(n, cb) {
    var roots = new Map();
    fillWordsByRootAsync(roots).then(() => {
        cb(_
            .chain(list(roots.entries()))
            .orderBy('[1].length', 'desc')
            .take(n)
            // [root, [array of words with this root]
            .map(pair => pair[1][0] + ": " + pair[1].length)
            .value());
        console.log(new Date());
    })
}
module.exports.topAsync = topAsync;
module.exports.top = top;
module.exports.countAsync = countAsync;
module.exports.count = count;

function list(iterator) {
    var res = [];
    while (true) {
        var current = iterator.next();
        if (current.done) {
            break;
        }
        res.push(current.value);
    }
    return res;
}

