var counter = require('./counter');

console.log(new Date());
var callbackForTopAsync = data => data.forEach(d => console.log(d));
var callbackForCountAsync = ans => console.log(ans);
//counter.topAsync(10, callbackForTopAsync);
console.log(counter.top(10));
//counter.countAsync("kek", callbackForCountAsync);
//counter.countAsync("пользователь", ans => console.log(ans));

//counter.countAsync("скрипт", callbackForCountAsync);
//counter.countAsync("задание", callbackForCountAsync);
