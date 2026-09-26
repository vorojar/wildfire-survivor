import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,W,H} from './game.js';
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
  g.choices=[{id:'power'}];const damage=g.damage;assert.equal(g.choose('power'),true);assert.equal(g.damage,damage*1.3);assert.equal(g.state,'playing');assert.equal(g.choose('power'),false);
});
test('pause freezes simulation and nova has a real cooldown',()=>{
  const g=new Game();g.start();g.spawn(0,g.p.x+20,g.p.y);assert.equal(g.nova(),true);assert.ok(g.kills>0);assert.equal(g.nova(),false);
  g.pause();const time=g.time,cooldown=g.novaCooldown;g.update(.05);assert.equal(g.time,time);assert.equal(g.novaCooldown,cooldown);g.pause();g.update(.05);assert.ok(g.novaCooldown<cooldown);
});
test('lethal contact ends run and new game resets run while respecting permanent equipment',()=>{
  const g=new Game({gear:[2,3,1,2]});assert.equal(g.damage,26);assert.equal(g.p.maxHp,180);g.start();g.p.hp=1;g.spawn(3,g.p.x,g.p.y);g.shootClock=100;g.update(.01);assert.equal(g.state,'dead');assert.equal(g.p.hp,0);
  const next=new Game({gear:[2,3,1,2]});assert.equal(next.coins,0);assert.equal(next.level,1);assert.equal(next.p.hp,180);
});
test('a long expedition cycles all bosses and keeps world/combat memory bounded',(t)=>{
  let seed=42;t.mock.method(Math,'random',()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296));
  const g=new Game();g.start();g.p.maxHp=g.p.hp=1e9;g.damage=500;g.multi=7;g.pierce=3;g.magnet=1000;
  const bosses=new Set();g.onEvent=(t,name)=>{if(t==='boss')bosses.add(name);};
  for(let i=0;i<12000;i++){if(g.state==='upgrade')g.choose(g.choices[0].id);if(g.state==='relic')g.chooseRelic('hunter');g.update(.05,{x:Math.sin(i/200)*.3,y:-1});if(i%240===0)g.nova();}
  assert.equal(bosses.size,3);assert.ok(g.bossKills>=6);assert.ok(g.distance>3000);assert.ok(g.kills>500);assert.ok(g.bullets.length<500);assert.ok(g.particles.length<=500);assert.ok(g.drops.length<=500);assert.ok(g.world.chunks.size<=5);assert.ok(Number.isFinite(g.p.hp));
});

function isolated(){const g=new Game();g.start();g.enemies=[];g.spawnClock=1e6;g.nextBossTime=1e6;g.nextBossDistance=1e6;g.nextElite=1e6;return g;}
function grant(g,id){g.state='upgrade';g.choices=[{id}];assert.equal(g.choose(id),true);}

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
  assert.equal(g.state,'relic');assert.equal(g.boss,null);assert.equal(g.bossGate,null);assert.equal(g.hazards.length,0);assert.equal(g.enemyShots.length,0);
  assert.equal(g.chooseRelic('guardian'),true);assert.equal(g.p.hp,160);assert.equal(g.chooseRelic('guardian'),false);assert.equal(g.state,'playing');
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
