import { biomeAt } from './world.js';

const omitted = new Set(['onEvent','world','biome','boss','evolved','bullets','particles','texts','rings','arcs','upgradeIntro','reviveTimer','novaFx','impactStop']);
const states = ['playing','paused','upgrade','loot','relic','dead'];
export class SaveConflictError extends Error {}

export function captureRun(game) {
  if(!game || !states.includes(game.state))return null;
  const data = Object.fromEntries(Object.entries(game).filter(([key]) => !omitted.has(key)));
  return { version:1, data, bossId:game.boss?.id ?? null, evolved:[...game.evolved],
    bullets:game.bullets.map(b => ({...b,hits:[...b.hits]})), world:{used:[...game.world.used],furthest:game.world.furthest} };
}

function finiteTree(value, depth=0) {
  if(depth>12)return false;
  if(typeof value==='number')return Number.isFinite(value);
  if(value===null || typeof value==='string' || typeof value==='boolean')return true;
  if(Array.isArray(value))return value.length<=2000 && value.every(v=>finiteTree(v,depth+1));
  if(typeof value==='object')return Object.entries(value).every(([k,v])=>!['__proto__','constructor','prototype'].includes(k)&&finiteTree(v,depth+1));
  return false;
}

export function restoreRun(game, snapshot) {
  const invalid=()=>{throw new Error('本局存档损坏或版本不兼容，永久装备仍保留。');};
  if(!snapshot || snapshot.version!==1 || !finiteTree(snapshot))invalid();
  const d={...snapshot.data};
  // Migrate existing version-one saves without discarding their expedition.
  if(!('regionEvent' in d))d.regionEvent=null;
  if(!('nextRegionEvent' in d))d.nextRegionEvent=Math.max(110,(d.distance??0)+90);
  for(const key of ['bombsBought','boostsBought','livesBought','coinsSpent','bombCooldown'])if(!(key in d))d[key]=0;
  if(!('upgradeSelection' in d))d.upgradeSelection='';
  if(!('paidRevival' in d))d.paidRevival=false;
  if(!states.includes(d.state) || !Number.isInteger(d.lives) || d.lives<0 || d.lives>5 || !d.p || d.p.maxHp<d.p.hp)invalid();
  if(d.state==='dead'?(d.lives!==0||d.p.hp!==0):(d.lives<1||d.p.hp<=0))invalid();
  for(const [key,value] of Object.entries(game)){
    if(omitted.has(key))continue;
    if(!(key in d) || (value!==null && typeof d[key]!==typeof value) || (Array.isArray(value)&&!Array.isArray(d[key])))invalid();
  }
  for(const key of ['time','distance','coins','xp','bossKills','revives','uid'])if(d[key]<0)invalid();
  for(const key of ['bombsBought','boostsBought','livesBought','coinsSpent'])if(!Number.isSafeInteger(d[key])||d[key]<0)invalid();
  for(const key of ['level','nextXp','damage','interval','threatGrowth'])if(!(d[key]>0))invalid();
  if(!['x','y','hp','maxHp','speed','invuln','face'].every(k=>Number.isFinite(d.p[k])))invalid();
  if(!d.enemies.every(e=>['x','y','hp','maxHp','id','speed','size'].every(k=>Number.isFinite(e[k]))))invalid();
  if(!d.drops.every(drop=>['coin','xp','heal','magnet','bomb','haste','shield','chest','life'].includes(drop.type)&&Number.isFinite(drop.x)&&Number.isFinite(drop.y)))invalid();
  if(!Array.isArray(snapshot.evolved)||!snapshot.evolved.every(id=>['gatling','blast','storm'].includes(id))||!Array.isArray(snapshot.bullets)||!snapshot.bullets.every(b=>Array.isArray(b.hits)))invalid();
  if(!snapshot.world||!Array.isArray(snapshot.world.used)||!snapshot.world.used.every(Number.isInteger)||!Number.isFinite(snapshot.world.furthest))invalid();
  if(snapshot.bossId!==null&&!d.enemies.some(e=>e.id===snapshot.bossId&&e.isBoss&&e.hp>0))invalid();
  if(d.upgradeSelection && (d.state!=='upgrade'||!game.availableUpgrades.some(u=>u.id===d.upgradeSelection)||!(d.levels[d.upgradeSelection]>0)))invalid();
  if(d.state==='upgrade'&&d.choices.length!==(d.upgradeSelection?0:3))invalid();
  if(d.state==='relic'&&d.choices.length!==3)invalid();
  if(['loot','relic'].includes(d.state)&&(!d.lastBoss || typeof d.lastBoss.name!=='string' || !Number.isFinite(d.lastBoss.gold)))invalid();
  // Restore only known fields, then reconnect references and regenerate world chunks.
  for(const key of Object.keys(game))if(!omitted.has(key))game[key]=d[key];
  game.evolved=new Set(snapshot.evolved);game.bullets=snapshot.bullets.map(b=>({...b,hits:new Set(b.hits)}));
  game.boss=game.enemies.find(e=>e.id===snapshot.bossId)??null;
  game.world.used=new Set(snapshot.world.used);game.world.furthest=snapshot.world.furthest;
  game.world.chunks.clear();game.world.update(game.p.y);game.biome=biomeAt(game.p.y);game.resizeViewport(game.viewHeight);
  game.autoAdvance=false;
  if(game.state==='playing')game.state='paused';
  return game;
}

// Profile and expedition are one atomic localStorage write, preventing duplicated banked loot.
export function writeProgress(storage, profile, game) {
  const latest=JSON.parse(storage.getItem('wildfire-save')||'null');
  if((latest?.revision??0)!==(profile.revision??0))throw new SaveConflictError('另一个页面已更新进度');
  const saved={...profile,run:game?.state==='ready'?(profile.run??null):captureRun(game),savedAt:Date.now(),revision:(profile.revision??0)+1};
  const serialized=JSON.stringify(saved);
  storage.setItem('wildfire-save',serialized);
  // Keep in-memory continuation identical to a reload, without live game references.
  return JSON.parse(serialized);
}
