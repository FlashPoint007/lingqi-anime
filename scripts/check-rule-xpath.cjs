const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/web-core.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);const core=context.exports;
// Observe the exact string passed into the native engine. Native DOM evaluation
// is additionally verified in the browser's rule-test page against the real source.
function expressionSent(expression,relative=false){let actual;const item={nodeType:1},doc={nodeType:9,evaluate(expr,node,_resolver,type){actual=expr;assert.equal(node,relative?item:doc);assert.equal(type,7);return {snapshotLength:1,snapshotItem:()=>item};}};item.ownerDocument=doc;assert.equal(core.xpath(relative?item:doc,expression)[0],item);return actual;}
const snapshot=JSON.parse(fs.readFileSync('lib/rules-snapshot.json','utf8')),tvt=snapshot.entries.find(entry=>entry.rule.name==='TvTFun').rule;
assert.equal(expressionSent(tvt.chapterRoads),"//ol[(@class and contains(@class,'tvt-watch-episodes'))]");
assert.equal(expressionSent(tvt.chapterResult,true),'.//li/a','chapter queries remain relative to the selected road');
assert.equal(expressionSent('//'),'.');assert.equal(expressionSent('/self::*',true),'./self::*');
assert.equal(expressionSent('//a[@data-kind *= "series"][ @class*=\'active\']'),`//a[(@data-kind and contains(@data-kind,"series"))][ (@class and contains(@class,'active'))]`);
assert.equal(expressionSent("//a[@class*='']"),"//a[(@class and contains(@class,''))]",'an absent attribute must not match an empty attribute substring');
for(const expression of ['//ul[@class="anthology-list-play size"]',"//div[contains(@class, 'module-player-list')]","//div[starts-with(@id, 'playlist')][contains(@class, 'lists-box')]",'//a[@title="@class*=\'literal\'"]',"//a[contains(@title, '@class*=\"literal\"')]",'//a[@title="//ol[@class*=\'literal\']"]'])assert.equal(expressionSent(expression),expression,'valid XPath and quoted literals must not be rewritten: '+expression);
assert.equal(expressionSent(`//a[@title="@class*='literal'"][@data-id*='12']`),`//a[@title="@class*='literal'"][(@data-id and contains(@data-id,'12'))]`);
assert.equal(expressionSent("//a[@class*='unterminated]"),"//a[@class*='unterminated]",'leave malformed literals to native XPath validation');
for(const entry of snapshot.entries){for(const field of ['searchList','searchName','searchResult','chapterRoads','chapterResult']){const expression=entry.rule[field];if(!expression||expression==='//'||expression.includes('*='))continue;assert.equal(expressionSent(expression),expression,'standard upstream selectors remain unchanged: '+entry.rule.name+'/'+field);}}
console.log('PASS: upstream TvTFun attribute-contains compilation, single/double quotes, literal protection, existing standard XPath selectors, relative chapter scope and document shorthand');
