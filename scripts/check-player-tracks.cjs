const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{},TextEncoder,Blob};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/player-tracks.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {createMediaTracks}=context.exports;
const events={AUDIO_TRACKS_UPDATED:'audioUpdated',AUDIO_TRACK_SWITCHED:'audioSwitched',SUBTITLE_TRACKS_UPDATED:'subtitleUpdated',SUBTITLE_TRACKS_CLEARED:'subtitleCleared',SUBTITLE_TRACK_SWITCH:'subtitleSwitch'};
function target(value={}){const listeners=new Map();return Object.assign(value,{addEventListener(name,fn){const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},fire(name){[...(listeners.get(name)||[])].forEach(fn=>fn());},listenerCount(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}});}
const track=(label,mode='disabled',kind='subtitles')=>({label,language:'ja',kind,mode});
function setup(video){let state,updates=0;const messages=[];const controls=createMediaTracks(video,value=>{state=value;updates++;},value=>messages.push(value));return {controls,messages,get state(){return state;},get updates(){return updates;}};}
const native=target({textTracks:target([track('日本語','showing'),track('中文字幕')]),audioTracks:target([{label:'日语',language:'ja',enabled:true},{label:'国语',language:'zh',enabled:false}])});
const n=setup(native);assert.equal(n.state.subtitleId,'native:0');n.controls.selectSubtitle('native:1');assert.equal(native.textTracks[0].mode,'disabled');assert.equal(native.textTracks[1].mode,'showing');assert.equal(n.state.subtitleId,'native:1');
n.controls.selectAudio('native:1');assert.equal(native.audioTracks[0].enabled,false);assert.equal(native.audioTracks[1].enabled,true);assert.equal(n.state.audioId,'native:1');
const local=track('本地字幕');native.textTracks.push(local);n.controls.setLocal(local);n.controls.selectSubtitle('local');assert.equal(local.mode,'showing');assert.equal(native.textTracks[1].mode,'disabled');assert.equal(n.state.subtitles.filter(t=>t.id==='local').length,1);
n.controls.selectSubtitle('off');assert.ok(native.textTracks.every(t=>t.mode==='disabled'));n.controls.setLocal(local);assert.equal(local.mode,'disabled','re-reading tracks must not revive Off');
native.textTracks[0].mode='showing';native.textTracks.fire('change');assert.equal(native.textTracks[0].mode,'disabled','late native default selection must respect explicit Off');
n.controls.selectSubtitle('native:99');assert.equal(n.state.subtitleId,'off');assert.match(n.messages.at(-1),/已变化/);
const before=n.updates;n.controls.destroy();native.fire('loadedmetadata');native.textTracks.fire('change');assert.equal(n.updates,before);assert.equal(native.listenerCount()+native.textTracks.listenerCount()+native.audioTracks.listenerCount(),0);
const hlsTarget=target({audioTracks:[{name:'Japanese',lang:'ja'},{name:'Chinese',lang:'zh'}],audioTrack:0,subtitleTracks:[{name:'中文',lang:'zh'},{name:'English',lang:'en'}],subtitleTrack:0,subtitleDisplay:true});
const hls={...hlsTarget,on(name,fn){hlsTarget.addEventListener(name,fn);},off(name,fn){hlsTarget.removeEventListener(name,fn);}};
const hv=target({textTracks:target([])}),h=setup(hv);h.controls.attachHls(hls,events);assert.equal(h.state.audio.length,2);assert.equal(h.state.subtitleId,'hls:0');h.controls.selectAudio('hls:1');assert.equal(hls.audioTrack,1);h.controls.selectSubtitle('hls:1');assert.equal(hls.subtitleTrack,1);
const imported=track('本地字幕');hv.textTracks.push(imported);h.controls.setLocal(imported);h.controls.selectSubtitle('local');assert.equal(hls.subtitleTrack,-1);assert.equal(hls.subtitleDisplay,false);assert.equal(imported.mode,'showing');
hls.subtitleTrack=0;hls.subtitleDisplay=true;hlsTarget.fire(events.SUBTITLE_TRACK_SWITCH);assert.equal(hls.subtitleTrack,-1,'late HLS default cannot cover an imported subtitle');assert.equal(h.state.subtitleId,'local');
h.controls.selectSubtitle('hls:0');assert.equal(imported.mode,'disabled');assert.equal(hls.subtitleDisplay,true);h.controls.selectSubtitle('off');assert.equal(hls.subtitleTrack,-1);assert.equal(h.state.subtitleId,'off');h.controls.setLocal(null);assert.ok(h.state.subtitles.every(t=>t.id!=='local'));
const hBefore=h.updates;h.controls.destroy();hlsTarget.fire(events.AUDIO_TRACKS_UPDATED);assert.equal(h.updates,hBefore);assert.equal(hlsTarget.listenerCount(),0);
const plain=setup(target({}));assert.equal(plain.state.audio.length,0);assert.equal(plain.state.subtitles.length,0);plain.controls.destroy();
const deniedTrack={label:'系统字幕',kind:'subtitles',language:'zh',get mode(){return 'disabled';},set mode(_){throw Error('not supported');}};
const denied=setup(target({textTracks:target([deniedTrack])}));denied.controls.selectSubtitle('native:0');assert.match(denied.messages.at(-1),/无法切换/);denied.controls.destroy();
const extras={exports:{},TextEncoder,Blob};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/player-extras.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,extras);
const resume=extras.exports.playbackResumeStart;assert.equal(resume(95,100),0);assert.equal(resume(94.9,100),94.9);assert.equal(resume(150,100),0);assert.equal(resume(30,Infinity),30);assert.equal(resume(NaN,100),0);
console.log('PASS: production HLS/native audio and subtitle switching, local/embedded exclusion, explicit Off against late defaults, stale selections, unsupported APIs, event cleanup, and upstream five-second resume threshold');
