import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,W,H} from './game.js';
import {BOMB_COOLDOWN,BOOST_LIMIT,LIFE_LIMIT,supplyTickets} from './economy.js';
import {purchasePrice,canPurchase,purchaseCombatSupply} from './combat-purchases.js';
import {equipmentPrice,canUpgradeEquipment,affordableEquipmentCount} from './armory.js';
import {captureRun,restoreRun,writeProgress,SaveConflictError} from './run-save.js';
import {bossRewards} from './bosses.js';
import { World, ORIGIN_Y, distanceAt, biomeAt, biomeBlendAt } from './world.js';
import { enemyForZone, updateEnemy } from './enemies.js';
import { bossTypes, updateBoss, updateHazards, hazardContains } from './bosses.js';

test('movement stays within horizontal bounds and diagonal movement is normalized',()=>{
  const a=isolated(),b=isolated();
  const x=a.p.x,y=a.p.y;a.update(.05,{x:1,y:0});b.update(.05,{x:1,y:1});
  assert.ok(Math.abs(Math.hypot(b.p.x-x,b.p.y-y)-(a.p.x-x))<.0001);
  for(let i=0;i<500;i++)a.update(.05,{x:1,y:1});
  assert.equal(a.p.x,W-25);assert.ok(a.p.y>H);
});
test('a fast bullet crosses and kills an enemy, drops coins, and awards only once',()=>{
  const g=new Game();g.start();g.enemies=[];g.spawnClock=100;g.shootClock=100;
  const e=g.spawn(0,250,200);e.speed=0;e.hp=10;
  g.bullets.push({x:220,y:200,vx:1200,vy:0,life:1,damage:15,crit:false,hits:new Set(),pierce:0});
  g.update(.05);assert.equal(g.kills,1);assert.equal(g.enemies.length,0);assert.equal(g.drops.filter(d=>d.type==='coin').length,1);
  g.hit(e,100);assert.equal(g.kills,1);
});
test('gold persists without granting XP; crystals open upgrades and choices resume combat',()=>{
  const events=[];const g=new Game({onEvent:(...e)=>events.push(e)});g.start();
  g.drops=[{x:g.p.x,y:g.p.y,type:'coin',value:8,phase:0}];g.update(.016);
  assert.equal(g.coins,8);assert.equal(g.level,1);assert.equal(g.xp,0);assert.equal(g.state,'playing');assert.ok(events.some(e=>e[0]==='coin'&&e[1]===8));
  g.drop(g.p.x,g.p.y,22,'xp');g.update(.016);assert.equal(g.level,2);assert.equal(g.nextXp,39);assert.equal(g.state,'upgrade');
  const t=g.time;g.update(.05,{x:1,y:0});assert.equal(g.time,t);
  assert.equal(g.choose(g.choices[0].id),false);for(let i=0;i<20;i++)g.update(.05);
  g.choices=[{id:'power'}];const damage=g.damage;assert.equal(g.choose('power'),true);assert.equal(g.damage,damage*1.3);assert.equal(g.state,'playing');assert.equal(g.choose('power'),false);
});
test('pause freezes simulation and nova has a real cooldown',()=>{
  const g=new Game();g.start();g.spawn(0,g.p.x+20,g.p.y);assert.equal(g.nova(),true);assert.ok(g.kills>0);assert.equal(g.nova(),false);
  g.pause();const time=g.time,cooldown=g.novaCooldown;g.update(.05);assert.equal(g.time,time);assert.equal(g.novaCooldown,cooldown);g.pause();for(let i=0;i<3;i++)g.update(.05);assert.ok(g.novaCooldown<cooldown);
});
test('lethal contact ends run and new game resets run while respecting permanent equipment',()=>{
  const g=new Game({gear:[2,3,1,2]});assert.equal(g.damage,26);assert.equal(g.p.maxHp,180);g.start();g.lives=1;g.p.hp=1;g.spawn(3,g.p.x,g.p.y);g.shootClock=100;g.update(.01);assert.equal(g.state,'dead');assert.equal(g.p.hp,0);
  const next=new Game({gear:[2,3,1,2]});assert.equal(next.coins,0);assert.equal(next.level,1);assert.equal(next.p.hp,180);
});
test('a long expedition cycles all bosses and keeps world/combat memory bounded',(t)=>{
  let seed=42;t.mock.method(Math,'random',()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296));
  const g=new Game();g.start();g.p.maxHp=g.p.hp=1e9;g.damage=500;g.multi=7;g.pierce=3;g.magnet=1000;
  const bosses=new Set();g.onEvent=(t,name)=>{if(t==='boss')bosses.add(name);};
  // Allow enough simulated time for different seeded upgrades to clear repeated boss phases.
  for(let i=0;i<18000;i++){if(g.state==='upgrade')g.choose(g.choices[0].id);if(g.state==='relic')g.chooseRelic(g.choices[0].id);g.update(.05,{x:Math.sin(i/200)*.3,y:-1});if(i%240===0)g.nova();}
  assert.equal(bosses.size,3);assert.ok(g.bossKills>=6);assert.ok(g.distance>3000);assert.ok(g.kills>500);assert.ok(g.bullets.length<500);assert.ok(g.particles.length<=500);assert.ok(g.drops.length<=500);assert.ok(g.world.chunks.size<=5);assert.ok(Number.isFinite(g.p.hp));
});

function isolated(){const g=new Game();g.start();g.enemies=[];g.spawnClock=1e6;g.nextBossTime=1e6;g.nextBossDistance=1e6;g.nextElite=1e6;g.nextRegionEvent=1e6;return g;}
function grant(g,id){g.state='upgrade';g.choices=[{id}];assert.equal(g.choose(id),true);}

test('three lives revive twice in place with protection; the third death ends the run once',()=>{
  const events=[],g=isolated();g.onEvent=(type)=>events.push(type);g.p.x=130;g.p.y=-1234;grant(g,'power');
  const damage=g.damage;
  for(const remaining of [2,1]){
    g.p.hp=0;g.enemyShots=[{x:130,y:-1234}];g.hazards=[{}];g.resolveDeath();
    assert.equal(g.lives,remaining);assert.equal(g.state,'playing');assert.equal(g.p.hp,g.p.maxHp);
    assert.equal(g.p.x,130);assert.equal(g.p.y,-1234);assert.equal(g.damage,damage);
    assert.equal(g.hurt(1e6),false);assert.equal(g.enemyShots.length,0);assert.equal(g.hazards.length,0);
  }
  g.p.hp=0;g.resolveDeath();g.resolveDeath();assert.equal(g.lives,0);assert.equal(g.state,'dead');
  assert.equal(events.filter(e=>e==='revive').length,2);assert.equal(events.filter(e=>e==='dead').length,1);
  assert.equal(restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g)))).state,'dead');
});

test('boss loot scatters, is collected before rewards, and life drops have a dry-streak guarantee',(t)=>{
  t.mock.method(Math,'random',()=>.99);
  const g=isolated();g.lifeDryStreak=2;const b=g.spawnBoss();g.finishBoss(b);
  assert.equal(g.state,'loot');assert.ok(g.drops.filter(d=>d.bossLoot).length>=54);
  assert.ok(g.drops.some(d=>d.type==='life'));const coin=g.drops.find(d=>d.type==='coin'),x=coin.x;
  g.update(.05);assert.notEqual(coin.x,x);assert.equal(g.coins,0);
  for(let i=0;i<65;i++)g.update(.05);
  assert.equal(g.state,'relic');assert.equal(g.lives,4);assert.ok(g.coins>=108);assert.equal(g.drops.filter(d=>d.bossLoot).length,0);
  assert.equal(g.lifeDryStreak,0);assert.equal(g.choices[0].id,'bulwark');
  const oldHp=g.p.maxHp;g.chooseRelic('bulwark');assert.equal(g.p.maxHp,oldHp+60);
  g.lives=5;g.drop(g.p.x,g.p.y,1,'life');g.collectDrops(0);assert.equal(g.lives,5);
  const sets=[0,1,2].map(bossType=>bossRewards(g,{bossType}).map(r=>r.id));
  assert.deepEqual(sets.map(s=>s[0]),['bulwark','spore','wing']);assert.ok(sets.every(s=>!s.includes('phoenix')));
});

test('a complete expedition restores boss references, bullet hits, lives, world history and pending choices',()=>{
  const g=isolated();g.p.y=-2500;g.world.update(g.p.y);g.world.collect(1);g.lives=2;
  for(const id of ['power','power','speed','speed'])grant(g,id);
  const b=g.spawnBoss();b.hp=b.maxHp*.3;b.phaseLevel=2;b.shieldTime=1.7;g.fire(0);g.bullets[0].hits.add(b.id);
  g.drop(g.p.x+90,g.p.y,7,'coin');
  const roundTrip=()=>restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
  const restored=roundTrip();assert.equal(restored.state,'paused');assert.equal(restored.weaponName,'炼狱加特林');
  assert.equal(restored.lives,2);assert.equal(restored.p.y,-2500);assert.equal(restored.boss,restored.enemies.find(e=>e.id===b.id));
  assert.equal(restored.boss.shieldTime,1.7);assert.equal(restored.bullets[0].hits.has(b.id),true);assert.equal(restored.world.isUsed(1),true);
  restored.pause();assert.doesNotThrow(()=>restored.update(.05));
  g.finishBoss(b);const loot=roundTrip();assert.equal(loot.state,'loot');assert.deepEqual(loot.choices,g.choices);
  for(let i=0;i<65;i++)g.update(.05);
  const reward=roundTrip();assert.equal(reward.state,'relic');assert.deepEqual(reward.choices,g.choices);
  assert.equal(reward.chooseRelic(reward.choices[0].id),true);assert.equal(reward.chooseRelic(reward.choices[0]?.id),false);
});

test('atomic profile plus run save does not duplicate collected gold and rejects corrupt snapshots',()=>{
  const g=isolated();g.coins=12;g.lives=2;let value;
  writeProgress({getItem:()=>null,setItem:(key,json)=>{assert.equal(key,'wildfire-save');value=json;}},{bank:112,gear:[0,0,0,0]},g);
  const saved=JSON.parse(value),restored=restoreRun(new Game(),saved.run);
  assert.equal(saved.bank,112);assert.equal(restored.coins,12);restored.pause();restored.collectDrops(0);assert.equal(restored.coins,12);
  saved.run.data.lives=0;assert.throws(()=>restoreRun(new Game(),saved.run),/存档/);
  assert.throws(()=>writeProgress({getItem:()=>null,setItem:()=>{throw new Error('quota');}},{},g),/quota/);
});

test('evolution guidance tracks run choices, previews the finishing choice and matches real evolution',()=>{
  const g=new Game({gear:[10,0,0,0]});
  assert.equal(g.evolutions[0].remaining,4); // permanent gun levels do not count
  assert.equal(g.evolutionHint('heal'),null);
  grant(g,'power');grant(g,'power');
  assert.match(g.evolutionHint('power').text,/仍需极速扳机 ×2/);
  assert.equal(g.evolutions[0].requirements[0].current,2);
  grant(g,'speed');
  const before=JSON.stringify(g.levels);
  assert.equal(g.evolutionHint('speed').complete,true);
  assert.match(g.evolutionHint('speed').text,/立即进化 → 炼狱加特林/);
  assert.equal(JSON.stringify(g.levels),before);
  grant(g,'speed');assert.equal(g.weaponName,'炼狱加特林');
  assert.equal(g.evolutions[0].remaining,0);
  assert.match(g.evolutionHint('speed').text,/已进化/);
  grant(g,'power');assert.equal(g.evolutions[0].requirements[0].current,2);
  for(const [id,finish] of [['shotgun','multi'],['orbit','nova']]){
    grant(g,id);grant(g,id);grant(g,id);
    assert.equal(g.evolutionHint(finish).complete,true);grant(g,finish);
  }
  assert.equal(g.evolved.size,3);
  assert.equal(new Game().evolutions[0].remaining,4);
});

test('level and firepower gradually strengthen new enemies without erasing the upgrade advantage',()=>{
  const g=isolated(), old=g.spawn(0,20,20), oldHp=old.hp;
  const initialTarget=g.targetThreatGrowth;g.level=8;
  assert.ok(g.targetThreatGrowth>initialTarget);
  for(const id of ['power','power','speed','speed'])grant(g,id);
  const target=g.targetThreatGrowth;
  assert.ok(target>2);assert.equal(g.threatGrowth,1);
  assert.equal(old.hp,oldHp);
  g.buffs.haste=12;g.novaPower=20;
  assert.equal(g.targetThreatGrowth,target); // temporary burst is a reward, not a difficulty penalty
  g.enemies=[];
  for(let i=0;i<360;i++)g.update(.05);
  assert.ok(g.threatGrowth>1&&g.threatGrowth<target);
  const tougher=g.spawn(0,20,20);
  assert.ok(tougher.hp>oldHp);assert.ok(tougher.speed>old.speed);assert.ok(tougher.damage>old.damage);
  assert.ok(tougher.hp/oldHp<g.powerRatio); // evolved gun still clears faster
});

test('evolved burst builds must fight through repeated boss attacks and spawn health stays fixed',()=>{
  for(let type=0;type<3;type++){
    const g=isolated();g.level=8;g.p.hp=g.p.maxHp=1e9;
    for(const id of ['power','power','speed','speed','power','multi','multi'])grant(g,id);
    g.bossIndex=type;const b=g.spawnBoss(),maxHp=b.maxHp;
    assert.ok(maxHp>10000);
    grant(g,'power');assert.equal(b.maxHp,maxHp);assert.equal(b.hp,maxHp);
    for(let i=0;i<3000&&g.boss;i++){g.spawnClock=1e9;g.update(.05);if(g.state==='upgrade')g.choose(g.choices[0].id);}
    assert.equal(g.boss,null);assert.ok(g.time>20&&g.time<100,`boss ${type}: ${g.time}s`);
    assert.ok(b.attackCount>=6);assert.equal(b.phaseLevel,2);
  }
});

test('starting southward can reach and collect items beyond the former invisible boundary',()=>{
  const g=isolated();g.p.hp=50;g.drop(g.p.x,ORIGIN_Y+450,35,'heal');
  for(let i=0;i<60;i++)g.update(.05,{x:0,y:1});
  assert.ok(g.p.y>ORIGIN_Y+400);assert.equal(g.p.hp,85);assert.equal(g.drops.length,0);
  assert.equal(g.distance,0);assert.equal(g.biome.name,'迷雾森林');
  for(let i=0;i<60;i++)g.update(.05,{x:0,y:-1});
  assert.ok(Math.abs(g.p.y-ORIGIN_Y)<1e-8);assert.ok(g.world.chunks.size<=5);
});

test('phone viewport resize preserves world position, camera framing and offscreen spawns',()=>{
  const g=isolated(), y=g.p.y;
  for(const height of [980,680,H]){
    g.resizeViewport(height);assert.equal(g.p.y,y);assert.equal(g.distance,0);
    assert.ok(Math.abs(g.p.y-g.cameraY-height*.52)<1e-8);
    for(let i=0;i<30;i++){
      const e=g.spawn(0),screenY=e.y-g.cameraY;
      assert.ok(e.x<0||e.x>W||screenY<0||screenY>height);
    }
  }
});

test('ordinary charges cannot hurt along their future path before making contact',()=>{
  const g=isolated(), wolf=g.spawn(4,g.p.x,g.p.y-180);wolf.attackClock=0;
  updateEnemy(g,wolf,.01);const hp=g.p.hp;
  updateHazards(g,.86);assert.ok(wolf.dash);assert.equal(g.p.hp,hp);
  g.shootClock=1e6;
  for(let i=0;i<10;i++)g.update(.05);
  assert.ok(g.p.hp<hp);
});

test('northward travel scrolls camera without an upper boundary and backtracking cannot lower difficulty',()=>{
  const g=isolated();for(let i=0;i<1200;i++)g.update(.05,{x:0,y:-1});
  assert.ok(g.p.y<-8000);assert.ok(Math.abs(g.p.y-g.cameraY-ORIGIN_Y)<1e-8);assert.ok(g.distance>700);
  const distance=g.distance;for(let i=0;i<100;i++)g.update(.05,{x:0,y:1});assert.equal(g.distance,distance);
  assert.equal(biomeAt(ORIGIN_Y-12*400).name,'失落王城');assert.equal(biomeAt(ORIGIN_Y-12*800).name,'孢子禁区');assert.equal(biomeAt(ORIGIN_Y-12*1200).name,'迷雾森林');
});
test('regenerated supply chunks cannot be farmed by revisiting and old history is bounded',()=>{
  const world=new World();world.update(ORIGIN_Y-H*1.5);const s=world.supplies().find(s=>s.id===1);assert.ok(s);assert.equal(world.collect(1),true);
  world.update(-H*10);world.update(s.y);assert.ok(!world.supplies().some(s=>s.id===1));assert.equal(world.collect(1),false);
  for(let i=0;i<2000;i++){world.update(ORIGIN_Y-H*i);world.collect(i);}
  assert.ok(world.chunks.size<=5);assert.ok(world.used.size<=201);world.update(s.y);assert.equal(world.collect(1),false);
});
test('supply station heals, charges nova and awards its coins once',()=>{
  const g=isolated();g.world.update(ORIGIN_Y-H*1.5);const s=g.world.supplies().find(s=>s.id===1);g.p.x=s.x;g.p.y=s.y;g.p.hp=30;g.novaCooldown=10;
  g.update(.016);assert.ok(g.p.hp>30);assert.equal(g.novaCooldown,0);const coins=g.coins;g.update(.016);assert.equal(g.coins,coins);assert.equal(g.world.isUsed(1),true);
});
test('three boss archetypes telegraph different attacks and warnings cannot damage early',()=>{
  for(let type=0;type<3;type++){
    const g=isolated();g.bossIndex=type;const b=g.spawnBoss();b.attackClock=0;b.speed=0;updateBoss(g,b,.01);
    assert.ok(g.hazards.length>0);const h=g.hazards[0];const hp=g.p.hp;updateHazards(g,.5);assert.equal(g.p.hp,hp);
    if(type===1){assert.equal(h.poison,true);assert.ok(g.hazards.length===3);}else assert.equal(h.shape,'line');
    b.attackClock=0;updateBoss(g,b,.01);
    if(type===0)assert.ok(g.hazards.some(h=>h.shape==='cone'));
    if(type===1)assert.ok(g.enemies.filter(e=>!e.isBoss).length===4);
    if(type===2){assert.ok(g.hazards.some(h=>h.burst));updateHazards(g,1.5);assert.ok(g.enemyShots.length>0);}
  }
});
test('warning geometry supports dodging and active hazards hurt only inside their real shape',()=>{
  const cone={shape:'cone',x:0,y:0,angle:0,spread:.7,radius:100};assert.equal(hazardContains(cone,{x:50,y:0}),true);assert.equal(hazardContains(cone,{x:-50,y:0}),false);
  const g=isolated();const hp=g.p.hp;
  g.hazards=[{shape:'circle',x:g.p.x,y:g.p.y,radius:50,age:0,warn:1,active:1,damage:20,owner:-1}];
  updateHazards(g,.9);assert.equal(g.p.hp,hp);g.p.x+=100;updateHazards(g,.2);assert.equal(g.p.hp,hp);g.p.x-=100;updateHazards(g,.1);assert.equal(g.p.hp,hp-20);
});
test('boss gates block running past encounters, freeze on pause and clear after victory',()=>{
  const g=isolated();const b=g.spawnBoss();g.shootClock=1e6;
  for(let i=0;i<80;i++)g.updateWorld(.05,{x:0,y:-1});assert.ok(g.p.y>=g.bossGate-235);
  g.pause();const clock=b.attackClock;g.update(.05);assert.equal(b.attackClock,clock);g.pause();
  g.hazards=[{owner:b.id}];g.enemyShots=[{owner:b.id}];
  for(let i=0;i<40&&b.hp>0;i++){b.shieldTime=0;g.hit(b,b.maxHp);}
  assert.equal(g.state,'loot');for(let i=0;i<65;i++)g.update(.05);assert.equal(g.state,'relic');assert.equal(g.boss,null);assert.equal(g.bossGate,null);assert.equal(g.hazards.length,0);assert.equal(g.enemyShots.length,0);
  assert.equal(g.chooseRelic('bulwark'),true);assert.equal(g.p.hp,180);assert.equal(g.chooseRelic('bulwark'),false);assert.equal(g.state,'playing');
});
test('all three evolution combinations unlock once and change actual weapon behavior',()=>{
  const events=[];const g=isolated();g.onEvent=(t,n)=>{if(t==='evolution')events.push(n);};
  for(const id of ['power','power','speed','speed','shotgun','shotgun','shotgun','multi','orbit','orbit','orbit','nova'])grant(g,id);
  assert.equal(g.evolved.size,3);g.checkEvolutions();assert.equal(events.length,3);assert.equal(g.weaponName,'炼狱加特林');
  const e=g.spawn(0,g.p.x+100,g.p.y);e.hp=e.maxHp=1e8;e.speed=0;g.update(.01);
  assert.ok(g.shootClock<g.interval);assert.ok(g.bullets.some(b=>b.blast));assert.ok(g.bullets.some(b=>b.pierce>=1));
  const before=g.p.speed;g.p.speed=250;grant(g,'magnet');assert.ok(g.p.speed>250);assert.ok(before>0);
});
test('explosive shotgun hits nearby enemies instead of only the direct target',()=>{
  const g=isolated();g.shootClock=1e6;const a=g.spawn(0,g.p.x+30,g.p.y),b=g.spawn(0,g.p.x+30,g.p.y+40);a.hp=b.hp=200;a.speed=b.speed=0;
  g.bullets=[{x:g.p.x,y:g.p.y,vx:900,vy:0,life:1,damage:20,crit:false,hits:new Set(),pierce:0,blast:true}];g.update(.05);
  assert.ok(a.hp<200);assert.ok(b.hp<200);assert.ok(g.rings.length>0);
});

test('high gear bosses survive burst damage and both phase shields require real combat time',()=>{
  const g=new Game({gear:[10,10,10,10]});g.start();const b=g.spawnBoss();
  assert.ok(b.maxHp>9000);g.hit(b,1e9);assert.ok(b.hp>=b.maxHp*.95);
  for(const phase of [1,2]){
    while(b.phaseLevel<phase)g.hit(b,1e9);
    const hp=b.hp;assert.equal(b.shieldTime,3);g.hit(b,1e9);assert.equal(b.hp,hp);
    updateBoss(g,b,2.9);g.hit(b,1e9);assert.equal(b.hp,hp);
    updateBoss(g,b,.11);g.hit(b,1e9);assert.ok(b.hp<hp);
  }
});

test('terrain blends continuously over each boundary including the return to forest',()=>{
  for(const boundary of [380,760,1140]){
    const at=m=>biomeBlendAt(ORIGIN_Y-m*12);
    assert.equal(at(boundary-50).amount,0);assert.equal(at(boundary+50).amount,1);
    assert.equal(at(boundary).amount,.5);assert.notEqual(at(boundary).from,at(boundary).to);
    assert.ok(Math.abs(at(boundary+.01).amount-at(boundary-.01).amount)<.001);
    assert.equal(at(boundary-51).from,at(boundary).from);assert.equal(at(boundary+51).from,at(boundary).to);
  }
});

test('biomes spawn distinct enemies with real ranged, charge and finite split behaviors',()=>{
  const pools=[0,1,2].map(zone=>new Set(Array.from({length:100},(_,i)=>enemyForZone(zone,i/100))));
  assert.ok(pools[0].has(4)&&!pools[1].has(4));assert.ok(pools[1].has(7)&&!pools[2].has(7));assert.ok(pools[2].has(12)&&!pools[0].has(12));
  const g=isolated(),archer=g.spawn(7,g.p.x,g.p.y-200);archer.attackClock=0;updateEnemy(g,archer,.01);
  assert.equal(g.enemyShots.length,0);updateHazards(g,.81);assert.equal(g.enemyShots.length,1);
  const wolf=g.spawn(4,g.p.x,g.p.y-180);wolf.attackClock=0;updateEnemy(g,wolf,.01);updateHazards(g,.86);assert.ok(wolf.dash);
  const blob=g.spawn(12,g.p.x+100,g.p.y);g.hit(blob,1e6);const children=g.enemies.filter(e=>e.splitChild);assert.equal(children.length,2);
  for(const child of children)g.hit(child,1e6);assert.equal(g.enemies.filter(e=>e.splitChild).length,2);
});

test('consumables heal, attract, boost fire, absorb hits and bomb kills retain their loot',()=>{
  const g=isolated();g.p.hp=30;
  for(const type of ['heal','magnet','haste','shield'])g.drop(g.p.x,g.p.y,type==='heal'?35:1,type);
  g.collectDrops(0);assert.equal(g.p.hp,65);assert.equal(g.buffs.magnet,10);assert.equal(g.buffs.haste,12);assert.equal(g.shieldCharges,3);
  assert.equal(g.hurt(100),false);assert.equal(g.p.hp,65);assert.equal(g.shieldCharges,2);
  const e=g.spawn(0,g.p.x+100,g.p.y);e.speed=0;g.drop(g.p.x,g.p.y,1,'bomb');g.collectDrops(0);
  assert.equal(e.hp<=0,true);assert.ok(g.drops.some(d=>d.type==='xp'));assert.ok(g.drops.some(d=>d.type==='coin'));
  const oldXp=g.xp;g.drop(g.p.x,g.p.y,1,'chest');g.collectDrops(0);assert.ok(g.coins>=30);assert.equal(g.xp,oldXp);assert.ok(g.drops.some(d=>['magnet','haste','shield'].includes(d.type)));
  g.drops=[];g.drop(g.p.x,g.p.y-700,1,'xp');g.collectDrops(.05);assert.ok(g.drops[0].y>g.p.y-700);
  g.pause();g.update(.05);assert.equal(g.buffs.haste,12);
});


test('stale home writes are rejected before storage events and lobby saves retain the expedition',()=>{
  let raw=null;const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const profile={bank:100,gear:[0,0,0,0]},active=isolated();active.time=123;active.lives=2;
  active.spawn(0,100,100);
  const saved=writeProgress(storage,profile,active),before=raw;
  assert.throws(()=>writeProgress(storage,{bank:0,gear:[0,0,0,0]},new Game()),SaveConflictError);
  assert.equal(raw,before);
  const lobby=writeProgress(storage,{...saved,audio:{music:.5,fx:.7}},new Game());
  assert.equal(lobby.bank,100);assert.equal(lobby.run.data.time,123);assert.equal(lobby.run.data.lives,2);
  const resumed=restoreRun(new Game(),lobby.run);
  assert.equal(resumed.time,123);assert.equal(resumed.lives,2);
  resumed.p.hp=1;assert.notEqual(active.p.hp,1);
  const abandoned=writeProgress(storage,{...lobby,run:null},new Game());
  assert.equal(abandoned.run,null);assert.equal(abandoned.bank,100);
  assert.throws(()=>writeProgress(storage,lobby,active),SaveConflictError);
});

test('relic-capped weapons still offer the missing evolution choices without exceeding caps',()=>{
  const g=isolated();
  for(let i=0;i<3;i++){g.state='relic';g.choices=[{id:'reactor'}];g.chooseRelic('reactor');}
  grant(g,'orbit');grant(g,'orbit');grant(g,'nova');
  assert.equal(g.orbits,5);assert.equal(g.evolved.has('storm'),false);
  assert.equal(g.availableUpgrades.find(u=>u.id==='orbit').tag,'进化补全');
  grant(g,'orbit');assert.equal(g.orbits,5);assert.equal(g.evolved.has('storm'),true);
  assert.equal(g.availableUpgrades.some(u=>u.id==='orbit'),false);
  for(let i=0;i<6;i++){g.state='relic';g.choices=[{id:'barrage'}];g.chooseRelic('barrage');}
  for(let i=0;i<3;i++)grant(g,'shotgun');
  assert.equal(g.availableUpgrades.find(u=>u.id==='multi').tag,'进化补全');
  grant(g,'multi');assert.equal(g.multi,7);assert.equal(g.evolved.has('blast'),true);
});

test('older saved expeditions migrate regional event fields without losing weapons or lives',()=>{
  const g=isolated();g.distance=520;g.lives=2;grant(g,'power');
  const old=JSON.parse(JSON.stringify(captureRun(g)));delete old.data.regionEvent;delete old.data.nextRegionEvent;
  const restored=restoreRun(new Game(),old);
  assert.equal(restored.distance,520);assert.equal(restored.lives,2);assert.equal(restored.levels.power,1);
  assert.equal(restored.regionEvent,null);assert.equal(restored.nextRegionEvent,610);
});

test('regional challenges reward only completed targets, survive saves and pause during bosses',()=>{
  for(let zone=0;zone<3;zone++){
    const g=isolated();g.zone=zone;g.distance=120+zone*380;g.nextRegionEvent=g.distance;g.updateRegionEvent(.01);
    assert.equal(g.regionEvent.type,zone);const event=g.regionEvent;
    const restored=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
    assert.deepEqual(restored.regionEvent,event);
    g.spawnBoss();const remaining=event.remaining;g.updateRegionEvent(5);assert.equal(event.remaining,remaining);g.boss=null;
    while(event.kills<event.goal){for(const e of [...g.enemies])if(e.eventId===event.id)g.hit(e,1e9);if(event.kills<event.goal){event.clock=0;g.updateRegionEvent(.01);}}
    const chests=g.drops.filter(d=>d.type==='chest').length;g.updateRegionEvent(.01);
    assert.equal(g.regionEvent,null);assert.equal(g.drops.filter(d=>d.type==='chest').length,chests+1);
    const count=g.drops.length;g.updateRegionEvent(20);assert.equal(g.drops.length,count);
  }
  const expired=isolated();expired.distance=120;expired.nextRegionEvent=110;expired.updateRegionEvent(.01);expired.updateRegionEvent(31);
  assert.equal(expired.regionEvent,null);assert.equal(expired.drops.length,0);
});


test('upgrade presentation freezes combat, blocks accidental picks and saves the pending choices',()=>{
  const g=isolated();g.xp=g.nextXp;g.checkLevel();const choices=g.choices.map(x=>x.id),time=g.time,x=g.p.x;
  assert.ok(g.upgradeIntro>0);assert.equal(g.choose(choices[0]),false);
  for(let i=0;i<8;i++)g.update(.05,{x:1,y:1});assert.equal(g.time,time);assert.equal(g.p.x,x);assert.ok(g.upgradeIntro>0);
  const restored=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
  assert.equal(restored.state,'upgrade');assert.deepEqual(restored.choices.map(x=>x.id),choices);assert.equal(restored.level,2);assert.equal(restored.upgradeIntro,0);
  for(let i=0;i<12;i++)g.update(.05);assert.equal(g.upgradeIntro,0);assert.equal(g.choose(choices[0]),true);assert.equal(g.state,'playing');
});

test('revival presentation freezes danger and preserves all four seconds of protection',()=>{
  const g=isolated();g.p.hp=0;g.resolveDeath();const time=g.time,x=g.p.x;
  for(let i=0;i<20;i++)g.update(.05,{x:1,y:1});assert.equal(g.time,time);assert.equal(g.p.x,x);assert.equal(g.p.invuln,4);assert.equal(g.lives,2);assert.equal(g.nova(),false);
  g.pause();const remaining=g.reviveTimer;g.update(.05);assert.equal(g.reviveTimer,remaining);g.pause();
  for(let i=0;i<10;i++)g.update(.05);assert.equal(g.reviveTimer,0);assert.ok(g.p.invuln>3.8);
  const restored=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));assert.equal(restored.lives,2);assert.equal(restored.reviveTimer,0);
});

test('nova impact is brief, clears nearby shots and does not change damage or hit distant targets',()=>{
  const g=isolated(),near=g.spawn(0,g.p.x+100,g.p.y),far=g.spawn(0,g.p.x+300,g.p.y);
  near.hp=near.maxHp=1000;far.hp=far.maxHp=1000;g.enemyShots=[{x:g.p.x+30,y:g.p.y},{x:g.p.x+300,y:g.p.y}];
  assert.equal(g.nova(),true);assert.equal(near.hp,900);assert.equal(far.hp,1000);assert.equal(g.enemyShots.length,1);
  const t=g.time;g.update(.05);assert.equal(g.time,t);assert.ok(g.novaFx);assert.equal(g.nova(),false);
  for(let i=0;i<20;i++)g.update(.05);assert.equal(g.novaFx,null);assert.equal(g.impactStop,0);assert.ok(g.time>t);
});

test('armory notifications follow affordability, purchases and maximum equipment levels',()=>{
  assert.equal(equipmentPrice(0),80);assert.equal(affordableEquipmentCount(79,[0,0,0,0]),0);
  assert.equal(affordableEquipmentCount(80,[0,1,2,10]),1);assert.equal(affordableEquipmentCount(140,[0,1,2,10]),2);
  assert.equal(affordableEquipmentCount(140-equipmentPrice(0),[1,1,2,10]),0);
  assert.equal(canUpgradeEquipment(10000,10),false);assert.equal(affordableEquipmentCount(10000,[10,10,10,10]),0);
});

function purchaseFixture(g=isolated(),bank=1000,tickets=10){
  let raw=null;
  const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const profile=writeProgress(storage,{bank,tickets,gear:[0,0,0,0]},g);
  return {g,storage,profile};
}

test('bought bombs clear armored and splitting enemies, bullets and hazards without spending the free nova',()=>{
  const {g,storage,profile}=purchaseFixture();g.novaCooldown=8;
  const armored=g.spawn(0,g.p.x+50,g.p.y);armored.armor=.8;armored.hp=50000;
  g.spawn(12,g.p.x+70,g.p.y);const far=g.spawn(0,g.p.x,g.p.y+2000);
  g.enemyShots=[{x:g.p.x,y:g.p.y}];g.hazards=[{x:g.p.x,y:g.p.y}];
  const result=purchaseCombatSupply(storage,profile,g,'bomb');
  assert.equal(result.saved.bank,1000);assert.equal(result.saved.tickets,9);assert.equal(g.coinsSpent,0);assert.equal(g.bombsBought,1);
  assert.equal(g.enemies.filter(e=>e.hp>0).length,1);assert.ok(g.enemies.find(e=>e.id===far.id).hp>0);
  assert.equal(g.enemyShots.length,0);assert.equal(g.hazards.length,0);assert.equal(g.novaCooldown,8);
  assert.ok(g.drops.some(d=>d.type==='coin'));assert.ok(g.kills>=4);
  assert.equal(purchaseCombatSupply(storage,result.saved,g,'bomb'),null);
  g.updateEffects(BOMB_COOLDOWN);assert.equal(purchasePrice(g,'bomb'),1);
  const next=purchaseCombatSupply(storage,result.saved,g,'bomb');assert.equal(next.saved.bank,1000);assert.equal(next.saved.tickets,8);
  assert.equal(restoreRun(new Game(),next.saved.run).bombsBought,2);
});

test('bombs damage and stagger bosses but honor their phase shields',()=>{
  const {g,storage,profile}=purchaseFixture();g.spawnBoss();let boss=g.boss;const hp=boss.hp;
  let result=purchaseCombatSupply(storage,profile,g,'bomb');boss=g.boss;
  assert.ok(Math.abs(boss.hp-hp*.85)<.001);assert.ok(boss.attackClock>=1.2);
  g.updateEffects(BOMB_COOLDOWN);boss.shieldTime=3;const shieldHp=boss.hp;
  result=purchaseCombatSupply(storage,result.saved,g,'bomb');assert.equal(g.boss.hp,shieldHp);
  assert.equal(g.state,'playing');assert.equal(g.bossKills,0);
});

test('chosen upgrades offer one optional additive boost, preserve free continuation and do not scale threat',()=>{
  const {g,storage,profile}=purchaseFixture();g.xp=g.nextXp;g.checkLevel();g.upgradeIntro=0;
  const id=g.choices[0].id;assert.equal(g.choose(id,{hold:true}),true);
  assert.equal(g.state,'upgrade');assert.equal(g.upgradeSelection,id);assert.equal(g.choose(id,{hold:true}),false);
  const baseline=g.sustainedDps,threat=g.targetThreatGrowth;
  const result=purchaseCombatSupply(storage,profile,g,'boost');
  assert.equal(result.saved.bank,1000);assert.equal(result.saved.tickets,8);assert.equal(g.state,'playing');assert.equal(g.damageBonus,20);
  assert.equal(g.sustainedDps,baseline);assert.equal(g.targetThreatGrowth,threat);
  const e=g.spawn(0,g.p.x+100,g.p.y);e.hp=1000;g.hit(e,100);assert.equal(e.hp,880);
  assert.equal(purchaseCombatSupply(storage,result.saved,g,'boost'),null);
  g.xp=g.nextXp;g.checkLevel();g.upgradeIntro=0;g.choose(g.choices[0].id,{hold:true});
  const pending=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
  assert.equal(pending.state,'upgrade');assert.ok(pending.upgradeSelection);assert.equal(pending.choices.length,0);
  assert.equal(pending.finishUpgrade(),true);assert.equal(pending.damageBonus,20);
  const second=purchaseCombatSupply(storage,result.saved,g,'boost');assert.equal(second.saved.bank,1000);assert.equal(second.saved.tickets,6);assert.equal(g.damageBonus,40);
  assert.equal(new Game().damageBonus,0);
});

test('paid life resumes the same dead run once, persists price and full invulnerability',()=>{
  const {g,storage,profile}=purchaseFixture();g.lives=1;g.p.hp=0;g.time=87;g.resolveDeath();
  const deathSave=writeProgress(storage,profile,g),restored=restoreRun(new Game(),deathSave.run);
  assert.equal(restored.state,'dead');const pos={x:g.p.x,y:g.p.y};
  const result=purchaseCombatSupply(storage,deathSave,g,'life');
  assert.equal(result.saved.bank,1000);assert.equal(result.saved.tickets,7);assert.equal(g.lives,1);assert.equal(g.p.hp,g.p.maxHp);assert.equal(g.p.invuln,4);
  assert.equal(g.p.x,pos.x);assert.equal(g.p.y,pos.y);assert.equal(g.time,87);assert.equal(g.livesBought,1);
  assert.equal(purchaseCombatSupply(storage,result.saved,g,'life'),null);
  const next=restoreRun(new Game(),result.saved.run);assert.equal(next.lives,1);assert.equal(purchasePrice(next,'life'),3);
  for(let i=0;i<20;i++)g.update(.05);assert.equal(g.p.invuln,4);
});

test('failed, stale, insufficient and wrong-state purchases never charge or mutate the live game',()=>{
  const {g,storage,profile}=purchaseFixture();const before=JSON.stringify(captureRun(g));
  assert.equal(canPurchase(g,0,'bomb'),false);assert.equal(purchaseCombatSupply(storage,{...profile,bank:1000000,tickets:0},g,'bomb'),null);
  assert.equal(purchaseCombatSupply(storage,profile,g,'life'),null);
  assert.equal(purchaseCombatSupply(storage,profile,g,'boost'),null);
  assert.throws(()=>purchaseCombatSupply({...storage,setItem:()=>{throw new Error('disk full');}},profile,g,'bomb'),/disk full/);
  assert.equal(JSON.stringify(captureRun(g)),before);assert.equal(profile.bank,1000);
  writeProgress(storage,profile,g);
  assert.throws(()=>purchaseCombatSupply(storage,profile,g,'bomb'),SaveConflictError);
  assert.equal(JSON.stringify(captureRun(g)),before);assert.equal(JSON.parse(storage.getItem()).bank,1000);
});

test('pre-purchase saves migrate and malformed purchase counters are rejected',()=>{
  const g=isolated(),old=JSON.parse(JSON.stringify(captureRun(g)));
  for(const key of ['bombsBought','boostsBought','livesBought','coinsSpent','upgradeSelection','bombCooldown','paidRevival'])delete old.data[key];
  const restored=restoreRun(new Game(),old);assert.equal(restored.damageBonus,0);assert.equal(purchasePrice(restored,'life'),3);
  old.data.boostsBought=-1;assert.throws(()=>restoreRun(new Game(),old),/存档损坏/);
});

test('a full-screen bomb cannot buy itself back with gold, even deep in the endless map',(t)=>{
  t.mock.method(Math,'random',()=>.99);
  for(const distance of [0,1200,6000]){
    const {g,storage,profile}=purchaseFixture(isolated(),1000000,1);g.distance=distance;
    for(let i=0;i<130;i++)g.spawn(0,g.p.x+i%10,g.p.y+Math.floor(i/10));
    const result=purchaseCombatSupply(storage,profile,g,'bomb');
    assert.equal(g.kills,130);assert.equal(result.saved.tickets,0);assert.equal(result.saved.bank,1000000);
    assert.ok(g.drops.filter(d=>d.type==='coin').reduce((n,d)=>n+d.value,0)>=130);
    assert.equal(g.drops.some(d=>d.type==='ticket'),false);
    g.updateEffects(BOMB_COOLDOWN);
    assert.equal(purchaseCombatSupply(storage,result.saved,g,'bomb'),null);
  }
});

test('bosses drop exactly one ticket, saved drops award once, and crowded loot cannot discard it',()=>{
  const {g,storage,profile}=purchaseFixture(isolated(),1000,0),boss=g.spawnBoss();
  g.finishBoss(boss);g.finishBoss(boss);
  assert.equal(g.bossKills,1);assert.equal(g.drops.filter(d=>d.type==='ticket').length,1);
  const restored=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
  let earned=0;restored.onEvent=(type,value)=>{if(type==='ticket')earned+=value;};
  const ticket=restored.drops.find(d=>d.type==='ticket');
  ticket.x=restored.p.x+100;ticket.y=restored.p.y;ticket.age=0;
  restored.drops=[ticket];for(let i=0;i<520;i++)restored.drop(restored.p.x+250,restored.p.y,1);
  restored.collectDrops(0);assert.ok(restored.drops.includes(ticket));
  ticket.x=restored.p.x;ticket.y=restored.p.y;ticket.age=1;restored.collectDrops(0);restored.collectDrops(0);
  assert.equal(earned,1);
  const saved=writeProgress(storage,{...profile,tickets:profile.tickets+earned},restored);
  const reloaded=restoreRun(new Game(),saved.run);reloaded.onEvent=(type,value)=>{if(type==='ticket')earned+=value;};reloaded.collectDrops(0);
  assert.equal(earned,1);assert.equal(saved.tickets,1);
});

test('tickets persist across new runs without repeating the starter grant or spending gold',()=>{
  const {g,storage,profile}=purchaseFixture();const legacy={...profile};delete legacy.tickets;
  let saved=writeProgress(storage,legacy,g);assert.equal(saved.tickets,3);assert.equal(saved.bank,1000);
  saved=writeProgress(storage,{...saved,tickets:0},g);
  for(let i=0;i<4;i++)saved=writeProgress(storage,saved,new Game());
  assert.equal(saved.tickets,0);assert.equal(saved.bank,1000);assert.equal(supplyTickets(saved),0);
  assert.throws(()=>supplyTickets({tickets:-1}),/余额无效/);
});

test('bomb cooldown survives refresh and menus; wealthy wallets cannot bypass boost or life limits',()=>{
  let {g,storage,profile}=purchaseFixture(isolated(),1000000,100);
  let result=purchaseCombatSupply(storage,profile,g,'bomb');
  g=restoreRun(new Game(),result.saved.run);assert.equal(g.bombCooldown,BOMB_COOLDOWN);
  g.updateEffects(100);assert.equal(g.bombCooldown,BOMB_COOLDOWN);
  g.pause();g.updateEffects(19);assert.equal(canPurchase(g,100,'bomb'),false);g.updateEffects(1);assert.equal(canPurchase(g,100,'bomb'),true);
  for(let i=0;i<BOOST_LIMIT;i++){
    g.xp=g.nextXp;g.checkLevel();g.upgradeIntro=0;g.choose(g.choices[0].id,{hold:true});
    result=purchaseCombatSupply(storage,result.saved,g,'boost');assert.ok(result);
  }
  g.xp=g.nextXp;g.checkLevel();g.upgradeIntro=0;g.choose(g.choices[0].id,{hold:true});
  assert.equal(g.damageBonus,60);assert.equal(purchaseCombatSupply(storage,result.saved,g,'boost'),null);assert.equal(g.finishUpgrade(),true);
  g.boostsBought=99;assert.equal(g.damageMultiplier,1.6);
  for(let i=0;i<LIFE_LIMIT;i++){
    g.lives=1;g.p.hp=0;g.resolveDeath();result=purchaseCombatSupply(storage,result.saved,g,'life');assert.ok(result);
  }
  g.lives=1;g.p.hp=0;g.resolveDeath();
  const dead=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(g))));
  assert.equal(purchaseCombatSupply(storage,result.saved,dead,'life'),null);assert.equal(result.saved.bank,1000000);
});
