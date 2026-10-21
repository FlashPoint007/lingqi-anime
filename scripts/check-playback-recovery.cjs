const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/playback-recovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
let now=1000;
const recovery=context.exports.createPlaybackRecovery(()=>now),first={subjectId:7,number:29},other={subjectId:7,number:30};
recovery.begin(first,true);recovery.recordMedia(first,'https://cdn.example/shared.mp4');assert.equal(recovery.failedMedia('https://cdn.example/shared.mp4'),true);assert.equal(recovery.failedMedia('https://cdn.example/other.mp4'),false);recovery.record(first,'A','https://example.com/29');
assert.equal(recovery.failed('A','https://example.com/29'),true);
assert.equal(recovery.failed('B','https://example.com/29'),false);
assert.equal(recovery.claim(first),true);assert.equal(recovery.claim(first),true);assert.equal(recovery.claim(first),true);assert.equal(recovery.claim(first),false,'only three automatic replacements per failure chain');
recovery.begin(first,true);assert.equal(recovery.failed('A','https://example.com/29'),true,'find another source retains this episode\'s failed pages');
assert.equal(recovery.claim(first),true);now+=90001;assert.equal(recovery.claim(first),false,'one total deadline covers the whole recovery chain');assert.equal(recovery.remaining(),0);
recovery.begin(first,true,true);assert.equal(recovery.failed('A','https://example.com/29'),false,'explicit retry can retry a failed page');assert.equal(recovery.claim(first),true);
recovery.confirmed();now+=100000;assert.equal(recovery.claim(first),true,'a later playback stall gets a fresh bounded recovery window');
recovery.cancel();assert.equal(recovery.claim(first),false);assert.equal(recovery.remaining(),0);
recovery.begin(other,true);assert.equal(recovery.claim(other),true);assert.equal(recovery.failedMedia('https://cdn.example/shared.mp4'),false,'media failures are scoped to one episode');assert.equal(recovery.failed('A','https://example.com/29'),false,'failures never leak across episodes');
assert.equal(recovery.claim({subjectId:0,number:1}),false,'custom videos cannot trigger unrelated catalogue searches');assert.equal(recovery.claim({subjectId:7}),false,'unknown episode identity cannot be guessed');
console.log('PASS: scoped failed pages, bounded retries/deadline, explicit retry, confirmed playback, cancel and unknown-episode guards');

// A steady transfer may need a tail request for MP4's moov box; idle and total
// deadlines are independent and neither survives loadeddata/source cleanup.
let clock=0,sequence=0;const scheduled=new Map(),guardModule={exports:{},setTimeout:(fn,ms)=>{scheduled.set(++sequence,{fn,due:clock+ms});return sequence;},clearTimeout:id=>scheduled.delete(id)};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/player-controls.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,guardModule);
const advance=ms=>{const end=clock+ms;while(true){const next=[...scheduled].filter(([,v])=>v.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;clock=next[1].due;scheduled.delete(next[0]);next[1].fn();}clock=end;};
let expired=0;const init=guardModule.exports.createStartupGuard(()=>expired++);advance(10000);init.progress();advance(10000);assert.equal(expired,0,'bytes arriving during initialization must extend the idle deadline');init.progress();advance(12000);assert.equal(expired,1,'a stalled initialization still stops');
const slow=guardModule.exports.createStartupGuard(()=>expired++);for(let i=0;i<4;i++){advance(10000);slow.progress();}advance(5000);assert.equal(expired,2,'continuous trickles cannot exceed the 45 second hard limit');slow.progress();assert.equal(scheduled.size,0);
const loaded=guardModule.exports.createStartupGuard(()=>expired++);loaded.stop();advance(60000);assert.equal(expired,2,'loaded or replaced media cancels all startup timers');assert.equal(scheduled.size,0);
console.log('PASS: MP4 initialization progress, idle timeout, absolute startup limit and cleanup');
