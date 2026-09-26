import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sound, audioFiles, musicModes } from './audio.js';

function context() {
  const ctx={state:'running',currentTime:0,sampleRate:1000,sources:[],destination:{},close(){this.state='closed';}};
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const node=()=>({connect(){},disconnect(){this.disconnected=true;},gain:param(),frequency:param(),Q:param(),pan:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()});
  for(const name of ['createGain','createBiquadFilter','createDynamicsCompressor','createStereoPanner'])ctx[name]=node;
  const source=()=>{const n={...node(),start(...args){this.started=args;},stop(){this.stopped=true;}};ctx.sources.push(n);return n;};
  ctx.createBufferSource=source;ctx.createOscillator=source;ctx.createBuffer=(channels,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)});
  ctx.decodeAudioData=async()=>({duration:1});return ctx;
}
function readySound(){const s=new Sound();s.createGraph(context());for(const name of Object.keys(audioFiles))s.buffers.set(name,{name,duration:name==='music'?83:1});return s;}

test('battle intensity changes without restarting music; pause and mute preserve playback position',()=>{
  const s=readySound(),g={state:'playing',musicMode:'explore'};s.update(g);const initial=s.musicSource;
  for(const mode of ['combat','boss','explore']){g.musicMode=mode;s.update(g);assert.equal(s.musicSource,initial);assert.equal(s.musicFilter.frequency.value,musicModes[mode].cutoff);}
  s.ctx.currentTime=12;s.play('shoot');g.state='paused';s.update(g);assert.equal(s.musicSource,null);assert.equal(s.musicOffset,12);assert.equal(s.voices.size,0);
  s.ctx.currentTime=20;g.state='playing';s.update(g);assert.equal(s.musicSource.started[1],12);
  s.enabled=false;s.update(g);assert.equal(s.musicSource,null);assert.equal(s.fxBus.gain.value,0);
  const count=s.ctx.sources.length;s.play('shotgun');assert.equal(s.ctx.sources.length,count);
  s.enabled=true;s.setVolumes(0,.4);s.update(g);assert.equal(s.musicSource,null);s.play('shoot');assert.ok(s.voices.size>0);
  s.setVolumes(.5,0);s.update(g);assert.ok(s.musicSource);assert.equal(s.fxBus.gain.value,0);
  s.dispose();assert.equal(s.ctx.state,'closed');assert.equal(s.voices.size,0);
});

test('recorded weapons differ, music is ducked, rapid fire is bounded and first shot is audible',()=>{
  const s=readySound();s.play('shoot');assert.equal(s.voices.size,1);assert.equal(s.ctx.sources.at(-1).buffer.name,'rifle');
  s.play('shoot');assert.equal(s.voices.size,1);
  s.ctx.currentTime=.2;s.play('shotgun');assert.ok(s.ctx.sources.some(n=>n.buffer?.name==='shotgun'));assert.ok(s.ctx.sources.some(n=>n.buffer?.name==='bolt'));
  s.ctx.currentTime=.4;s.play('gatling');assert.equal(s.ctx.sources.at(-1).buffer.name,'gatling');
  for(let i=0;i<300;i++){s.ctx.currentTime+=.04;s.play('gatling');assert.ok(s.voices.size<=48);}
  assert.ok(s.ctx.sources.some(n=>n.stopped&&n.disconnected));s.stopFx();assert.equal(s.voices.size,0);
});

test('failed audio assets are visible and retry fetches only missing assets',async t=>{
  const s=new Sound({assetBase:'/test/audio/'});s.createGraph(context());let broken=true;const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return {ok:!(broken&&url.endsWith('rifle.wav')),status:503,arrayBuffer:async()=>new ArrayBuffer(8)};});
  t.mock.method(console,'warn',()=>{});
  await s.loadAssets();assert.equal(s.status,'error');assert.equal(s.buffers.size,4);assert.ok(s.errors.has('rifle'));
  broken=false;await s.loadAssets();assert.equal(s.status,'ready');assert.equal(requests.length,6);assert.equal(requests.at(-1),'/test/audio/rifle.wav');
});

test('sample assets contain short non-clipped PCM transients with no long start silence',()=>{
  for(const name of ['rifle','gatling','shotgun','bolt']){
    const data=readFileSync(new URL(`../public/audio/${name}.wav`,import.meta.url));assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.readUInt32LE(24),44100);let max=0,energy=0,onset=-1;
    for(let offset=44;offset<data.length;offset+=2){const value=data.readInt16LE(offset)/32768;max=Math.max(max,Math.abs(value));energy+=value*value;if(onset<0&&Math.abs(value)>.05)onset=(offset-44)/2/44100;}
    assert.ok(max>.5&&max<.99);assert.ok(energy>1);assert.ok(onset>=0&&onset<.03);assert.ok((data.length-44)/2/44100<1);
  }
});
