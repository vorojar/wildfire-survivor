import { W, H, ORIGIN_Y, World, distanceAt, biomeAt } from './world.js';
import { bossTypes, bossRewards, updateBoss, updateHazards } from './bosses.js';
import { enemyTypes, enemyForZone, updateEnemy } from './enemies.js';
import { lootTypes, rollLoot } from './loot.js';
export { enemyTypes } from './enemies.js';
export { W, H } from './world.js';
export { Sound } from './audio.js';
export { drawGame } from './renderer.js';

export const upgrades = [
  { id: 'power', name: '高爆弹头', desc: '子弹伤害 +30%', icon: 'Crosshair', tag: '火力强化' },
  { id: 'speed', name: '极速扳机', desc: '射击间隔缩短 18%', icon: 'Zap', tag: '射速强化' },
  { id: 'multi', name: '散射协议', desc: '步枪额外发射 1 枚子弹', icon: 'GitFork', tag: '弹幕升级' },
  { id: 'shotgun', name: '霰弹模组', desc: '解锁自动霰弹枪；再次选择提高威力', icon: 'Flame', tag: '新武器' },
  { id: 'pierce', name: '穿甲弹', desc: '子弹额外穿透 1 个敌人', icon: 'MoveUpRight', tag: '群体杀伤' },
  { id: 'heal', name: '战地补给', desc: '恢复 50% 生命，生命上限 +20', icon: 'Heart', tag: '生存强化' },
  { id: 'magnet', name: '磁力核心', desc: '拾取范围 +55，移动速度 +8%', icon: 'Magnet', tag: '装备升级' },
  { id: 'orbit', name: '电磁护卫', desc: '增加 1 枚青蓝色环绕护卫', icon: 'Orbit', tag: '自动武器' },
  { id: 'nova', name: '过载脉冲', desc: '冲击波伤害 +50%，冷却缩短', icon: 'Radio', tag: '技能升级' },
];
export const timeText = t => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
const evolutionRecipes = [
  { id: 'gatling', name: '炼狱加特林', art: 3, from: '突击步枪', effect: '主武器进化 · 极速连射，额外穿透', needs: [['power', 2], ['speed', 2]] },
  { id: 'blast', name: '爆裂霰弹', art: 4, from: '自动霰弹枪', effect: '副武器进化 · 更快发射，命中爆炸', needs: [['shotgun', 3], ['multi', 1]] },
  { id: 'storm', name: '电磁风暴', art: 5, from: '电磁护卫', effect: '副武器进化 · 扩大环绕，连锁闪电', needs: [['orbit', 3], ['nova', 1]] },
];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export class Game {
  constructor({ onEvent = () => {}, hero = 0, gear = [0, 0, 0, 0] } = {}) {
    this.onEvent = onEvent; this.hero = hero; this.gear = [...gear];
    this.state = 'ready'; this.time = 0; this.kills = 0; this.coins = 0; this.level = 1; this.xp = 0; this.nextXp = 22; this.threatGrowth = 1;
    this.lives = 3; this.revives = 0; this.lootTimer = 0; this.lastBoss = null; this.lifeDryStreak = 0;
    this.regionEvent=null;this.nextRegionEvent=110;
    this.upgradeIntro=0;this.reviveTimer=0;this.novaFx=null;this.impactStop=0;
    this.bombsBought=0;this.boostsBought=0;this.livesBought=0;this.coinsSpent=0;this.upgradeSelection='';this.bombCooldown=0;this.paidRevival=false;
    this.p = { x: W / 2, y: ORIGIN_Y, hp: 120 + gear[1] * 20, maxHp: 120 + gear[1] * 20, speed: 150 + gear[2] * 10, invuln: 0, face: 1 };
    this.damage = (hero ? 22 : 18) + gear[0] * 4; this.interval = hero ? .27 : .21;
    this.multi = 1; this.pierce = 0; this.magnet = 130 + gear[3] * 15; this.orbits = 0; this.novaPower = 1; this.crit = .16;
    this.enemies = []; this.bullets = []; this.drops = []; this.particles = []; this.texts = []; this.rings = []; this.arcs = [];
    this.buffs = { magnet: 0, haste: 0, shield: 0 }; this.shieldCharges = 0;
    this.hazards = []; this.enemyShots = []; this.relics = []; this.evolved = new Set();
    this.spawnClock = 0; this.shootClock = 0; this.shotgunClock = 0; this.nextElite = 40;
    this.novaCooldown = 0; this.shake = 0; this.combo = 0; this.comboClock = 0; this.uid = 0; this.choices = []; this.lastAim = 0; this.levels = {};
    this.world = new World(); this.world.update(this.p.y); this.cameraY = 0; this.viewHeight = H;
    this.distance = 0; this.zone = 0; this.biome = biomeAt(this.p.y); this.autoAdvance = false;
    this.boss = null; this.bossKills = 0; this.bossIndex = 0; this.bossGate = null; this.nextBossDistance = 220; this.nextBossTime = 55;
    for (let i = 0; i < 10; i++) { const a = i * 2.4; this.spawn(i % 3, W / 2 + Math.cos(a) * 165, H / 2 + Math.sin(a) * 260); }
    for (let i = 0; i < 9; i++) this.drop(rand(90, 390), rand(190, 620), 1);
  }
  get difficulty() { return 1 + this.distance / 430 + this.time / 240; }
  get damageBonus() { return this.boostsBought * 20; }
  get damageMultiplier() { return 1 + this.boostsBought * .2; }
  // Sustained output only: temporary haste, bombs and nova never inflate enemy health.
  get sustainedDps() {
    const primary = this.damage / (this.interval * (this.evolved.has('gatling') ? .52 : 1)) * (1 + (this.multi-1)*.55);
    const shotgunLevel = this.levels.shotgun ?? 0;
    const shotgun = shotgunLevel ? this.damage * (.65 + shotgunLevel*.12) * 3 / (this.evolved.has('blast') ? .85 : 1.35) : 0;
    const orbit = this.orbits ? this.damage * (this.evolved.has('storm') ? 2.4 : 1.7) / .35 * Math.min(1, this.orbits*.22) : 0;
    return (primary + shotgun) * (1 + this.crit*.8) + orbit;
  }
  get powerRatio() { return Math.max(1, this.sustainedDps / 97); }
  get targetThreatGrowth() { return Math.pow(this.powerRatio, .48) * (1 + (this.level-1)*.045); }
  get pressure() { return Math.min(1.5, Math.log2(this.threatGrowth)*.3); }
  get weaponName() { return this.evolved.has('gatling') ? '炼狱加特林' : '突击步枪'; }
  get musicMode() { return this.boss ? 'boss' : this.enemies.length >= 18 ? 'combat' : 'explore'; }
  get evolutions() {
    return evolutionRecipes.map(recipe => {
      const requirements = recipe.needs.map(([id, needed]) => ({ id, needed, name: upgrades.find(u => u.id === id).name, current: Math.min(needed, this.levels[id] ?? 0) }));
      const remaining = requirements.reduce((sum, r) => sum + r.needed - r.current, 0);
      return { ...recipe, requirements, remaining, ready: remaining === 0, progress: requirements.map(r => `${r.current}/${r.needed}`).join(' · ') };
    });
  }
  evolutionHint(upgradeId) {
    const route = this.evolutions.find(e => e.requirements.some(r => r.id === upgradeId));
    if (!route) return null;
    const requirement = route.requirements.find(r => r.id === upgradeId);
    if (this.evolved.has(route.id)) return { complete: false, text: `${route.name}已进化 · 继续强化属性` };
    if (requirement.current >= requirement.needed) return { complete: false, text: `${requirement.name}已达标 · 仍需${route.requirements.filter(r => r.current < r.needed).map(r => `${r.name} ×${r.needed-r.current}`).join('、')}` };
    return { complete: route.remaining === 1, text: route.remaining === 1 ? `本次选择立即进化 → ${route.name}` : `→ ${route.name} · ${requirement.current}→${requirement.current+1}/${requirement.needed}` };
  }
  start() { this.state = 'playing'; this.enemies = []; this.drops = []; for (let i = 0; i < 8; i++) this.spawn(enemyForZone(0)); this.onEvent('start'); }
  resizeViewport(height) {
    this.viewHeight = height;
    this.cameraY = this.p.y - height * .52;
  }
  spawn(type, x, y) {
    const t = enemyTypes[type], scale = this.difficulty * this.threatGrowth;
    if (x === undefined) {
      const edge = Math.floor(rand(0, 4));
      x = edge === 0 ? -24 : edge === 1 ? W + 24 : rand(25, W - 25);
      y = this.cameraY + (edge === 2 ? -24 : edge === 3 ? this.viewHeight + 24 : rand(65, this.viewHeight - 50));
    }
    const e = { ...t, type, x, y, maxHp: t.hp * scale, hp: t.hp * scale, damage: t.damage * (1 + this.distance / 2200 + this.pressure*.35), speed: t.speed * Math.min(2.5, 1 + this.distance / 1800 + this.pressure*.25), cooldown: t.cooldown ? t.cooldown/(1+this.pressure*.3) : undefined, id: ++this.uid, flash: 0, phase: rand(0, 6), orbitHit: 0, attackClock: rand(2, 4) };
    this.enemies.push(e); return e;
  }
  spawnElite(type, x, y) {
    const e=this.spawn(type,x,y), affix=Math.floor(Math.random()*3);
    e.elite=true;e.affix=['疾行','铁甲','狂暴'][affix];e.maxHp*=2.2;e.hp=e.maxHp;e.size*=1.15;
    if(affix===0)e.speed*=1.4;
    if(affix===1)e.armor=Math.min(.6,(e.armor??0)+.2);
    if(affix===2){e.damage*=1.5;if(e.cooldown)e.cooldown*=.65;}
    return e;
  }
  updateRegionEvent(dt) {
    if(this.boss)return;
    if(!this.regionEvent && this.distance>=this.nextRegionEvent){
      const type=this.zone%3;
      this.regionEvent={id:this.nextRegionEvent,type,name:['兽潮突围','遗迹守藏','孢子围猎'][type],remaining:30,clock:0,kills:0,goal:type===1?1:8};
      this.nextRegionEvent=this.distance+260;this.onEvent('region',`${this.regionEvent.name} · 击败标记敌人赢取宝箱`);
    }
    const event=this.regionEvent;if(!event)return;
    if(event.kills>=event.goal){
      this.drop(this.p.x,this.p.y-70,1,'chest');for(let i=0;i<10;i++)this.drop(this.p.x+rand(-40,40),this.p.y-70+rand(-30,30),3);
      this.onEvent('region',`${event.name}完成 · 宝箱与赏金已出现`);this.regionEvent=null;return;
    }
    event.remaining-=dt;event.clock-=dt;
    if(event.remaining<=0){this.onEvent('region',`${event.name}结束 · 下次再挑战`);this.regionEvent=null;return;}
    if(event.clock<=0){
      event.clock=event.type===1?100:7;
      if(event.type===1){const e=this.spawnElite(8);e.eventId=event.id;}
      else for(let i=0;i<6&&this.enemies.length<130;i++){const e=this.spawn(event.type===0?(i%2?4:1):(i%2?11:10));e.eventId=event.id;}
    }
  }
  spawnBoss() {
    if (this.boss) return null;
    const index = this.bossIndex++ % bossTypes.length, type = bossTypes[index];
    const worldHp = type.hp * (1 + this.bossKills * .55 + this.distance / 650) * (1 + this.gear[0]*.12) * (1 + (this.level-1)*.025);
    // Lock health at spawn: upgrading during a fight never heals or rescales this boss.
    const hp = Math.max(worldHp, this.sustainedDps * .8 * (26 + Math.min(12,this.bossKills*2)));
    const aggression = 1 + Math.min(.65, Math.log2(this.powerRatio)*.13 + (this.level-1)*.008);
    this.bossGate = this.p.y - 45;
    const boss = { ...type, damage: type.damage*(1+(aggression-1)*.6), speed: type.speed*(1+(aggression-1)*.3), aggression, type: 3, sprite: 5, bossType: index, isBoss: true, id: ++this.uid, hp, maxHp: hp, x: W / 2, y: this.p.y - 180, flash: 0, phase: 0, orbitHit: 0, attackClock: 1.6, attackCount: 0, intent: '正在逼近', phaseLevel: 0, shieldTime: 0, dash: null };
    this.boss = boss; this.enemies.push(boss); this.autoAdvance = false;
    this.onEvent('boss', boss.name); return boss;
  }
  finishBoss(boss) {
    this.bossKills++; this.boss = null; this.bossGate = null; this.autoAdvance = false;
    this.enemies=this.enemies.filter(e=>e.hp>0 && e!==boss);
    this.hazards = this.hazards.filter(h => h.owner !== boss.id); this.enemyShots = this.enemyShots.filter(b => b.owner !== boss.id);
    this.nextBossDistance = Math.max(this.nextBossDistance + 380, this.distance + 180); this.nextBossTime = this.time + 75;
    this.lastBoss = { name: boss.name, art: boss.art, color: boss.color, gold: 0, life: false };
    const drops = [];
    for(let i=0;i<36;i++) drops.push(['coin', 3+Math.floor(this.distance/400)]);
    for(let i=0;i<12;i++) drops.push(['xp', 2]);
    drops.push(['chest',1],['heal',35],['magnet',1],['haste',1],['shield',1]);
    this.lifeDryStreak++;
    if(this.lives<5 && (Math.random()<.4 || this.lifeDryStreak>=3)) { drops.push(['life',1]); this.lastBoss.life=true; this.lifeDryStreak=0; }
    drops.forEach(([type,value],i) => {
      const angle=i*2.39996, speed=rand(200,500);
      this.drop(boss.x,boss.y,value,type);
      Object.assign(this.drops.at(-1), { bossLoot:true, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed });
      if(type==='coin')this.lastBoss.gold+=value;
    });
    this.burst(boss.x,boss.y,'#ffd77e',90);this.shake=12;
    this.rings.push({x:boss.x,y:boss.y,r:12,life:1.4,color:'#ffe4a6'});
    this.state = 'loot'; this.lootTimer = 3; this.choices = bossRewards(this,boss); this.onEvent('victory', boss.name);
  }
  chooseRelic(id) {
    if (this.state !== 'relic' || !this.choices.some(c => c.id === id)) return false;
    if (id === 'hunter') { this.damage *= 1.2; this.crit = Math.min(.8, this.crit + .08); }
    if (id === 'guardian') { this.p.maxHp += 40; this.p.hp = this.p.maxHp; }
    if (id === 'reactor') { this.novaPower += .5; this.novaCooldown = 0; this.orbits = Math.min(5, this.orbits + 1); }
    if (id === 'bulwark') { this.p.maxHp += 60; this.p.hp = this.p.maxHp; }
    if (id === 'spore') { this.magnet += 100; this.damage *= 1.15; }
    if (id === 'wing') { this.p.speed = Math.min(320,this.p.speed+20); this.interval = Math.max(.065,this.interval*.86); }
    if (id === 'phoenix') { this.lives = Math.min(5,this.lives+1); this.p.hp = this.p.maxHp; }
    if (id === 'barrage') { this.multi = Math.min(7,this.multi+1); this.pierce++; }
    this.relics.push(id); if (this.relics.length > 100) this.relics.shift();
    this.choices = []; this.state = 'playing'; this.p.invuln = 2; this.onEvent('choose'); return true;
  }
  pause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
  resolveDeath() {
    if(this.p.hp>0 || this.state==='dead')return;
    this.lives--;this.autoAdvance=false;
    if(this.lives===0){this.state='dead';this.onEvent('dead');return;}
    this.reviveInPlace();
  }
  reviveInPlace(paid=false) {
    this.paidRevival=paid;this.revives++;this.p.hp=this.p.maxHp;this.p.invuln=4;
    this.reviveTimer=1.4;this.shake=15;
    this.enemyShots=[];this.hazards=[];
    for(const e of this.enemies){const dx=e.x-this.p.x,dy=e.y-this.p.y,d=Math.hypot(dx,dy);if(d<180&&!e.isBoss){e.x=clamp(this.p.x+(dx/(d||1)||1)*210,25,W-25);e.y=this.p.y+(dy/(d||1))*210;}e.dash=null;}
    this.rings.push({x:this.p.x,y:this.p.y,r:5,life:1.2,color:'#ff97bf'});this.burst(this.p.x,this.p.y,'#ffb7d1',45);
    this.onEvent('revive',this.lives);
  }
  burst(x, y, color, n = 9) {
    for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(30, 170); this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.2, .6), color, size: rand(2, 5) }); }
  }
  drop(x, y, value, type = 'coin') { this.drops.push({ x, y, value, phase: rand(0, 6), type, age: 0 }); }
  hurt(damage) {
    if (this.state !== 'playing' || this.p.invuln > 0) return false;
    if(this.buffs.shield>0 && this.shieldCharges>0){this.shieldCharges--;this.p.invuln=.7;this.burst(this.p.x,this.p.y,'#89ecff',16);this.onEvent('shield');return false;}
    this.p.hp = Math.max(0, this.p.hp - damage * (1 - Math.min(.5, this.gear[1] * .04)));
    this.p.invuln = .65; this.shake = 7; this.burst(this.p.x, this.p.y, '#fa6262'); this.onEvent('hurt'); return true;
  }
  hit(e, damage, crit = false, bossCap = .045) {
    if (e.hp <= 0) return;
    if(e.isBoss && e.shieldTime>0)return;
    damage *= this.damageMultiplier * (1-(e.isBoss?.2:(e.armor??0)));
    if(e.isBoss)damage=Math.min(damage,e.maxHp*bossCap);
    e.hp -= damage; e.flash = .1; this.onEvent('hit');
    if(e.isBoss && e.phaseLevel<2){
      const threshold=e.maxHp*(e.phaseLevel===0?.65:.3);
      if(e.hp<=threshold){e.hp=threshold;e.phaseLevel++;e.shieldTime=3;e.attackClock=.1;this.onEvent('bossPhase',`${e.name} · 护盾重组，准备反击`);}
    }
    this.texts.push({ x: e.x + rand(-8, 8), y: e.y - 15, text: Math.round(damage), color: crit ? '#ffe67a' : this.boostsBought ? '#ffc789' : '#edf8d9', life: .5, big: crit });
    this.burst(e.x, e.y, e.color, 3);
    if (e.hp > 0) return;
    if(this.regionEvent && e.eventId===this.regionEvent.id)this.regionEvent.kills++;
    if(e.elite){this.drop(e.x,e.y,1,'chest');for(let i=0;i<6;i++)this.drop(e.x+rand(-22,22),e.y+rand(-22,22),2);}
    this.kills++; this.combo++; this.comboClock = 2; this.onEvent('kill'); this.burst(e.x, e.y, e.color, e.type === 3 ? 35 : 12);
    if (e.isBoss) { this.finishBoss(e); return; }
    const n = e.type === 3 ? 10 : e.type === 2 ? 3 : 1;
    for (let i = 0; i < n; i++) this.drop(e.x + rand(-20, 20), e.y + rand(-20, 20), (e.type === 3 ? 3 : 1) + Math.floor(this.distance / 600));
    this.drop(e.x,e.y,e.isBoss?24:e.type===3?6:e.splitChild?.5:e.type===2?2:1,'xp');
    const loot=e.isBoss?'chest':rollLoot();if(loot)this.drop(e.x+18,e.y,loot==='heal'?35:1,loot);
    if(e.behavior==='split'&&!e.splitChild){for(let i=0;i<2;i++){const child=this.spawn(e.type,e.x+(i?20:-20),e.y+10);child.hp=child.maxHp=e.maxHp*.25;child.size=30;child.speed*=1.8;child.splitChild=true;}}
    if(!e.isBoss)this.hazards=this.hazards.filter(h=>h.owner!==e.id);
    if (this.combo % 10 === 0) { this.onEvent('combo', this.combo); this.shake = 4; }
  }
  nova() {
    if (this.state !== 'playing' || this.novaCooldown > 0 || this.reviveTimer>0) return false;
    this.novaCooldown = Math.max(4, 12 - this.novaPower); this.rings.push({ x: this.p.x, y: this.p.y, r: 12, life: .65, color: '#bdff83' }); this.shake = 9;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.p.x, e.y - this.p.y); if (d >= 245) continue;
      this.hit(e, 100 * this.novaPower, true);
      if (d > 0 && !e.isBoss) { e.x += (e.x - this.p.x) / d * 55; e.y += (e.y - this.p.y) / d * 55; }
    }
    this.enemyShots = this.enemyShots.filter(b => Math.hypot(b.x - this.p.x, b.y - this.p.y) > 245);
    this.novaFx={x:this.p.x,y:this.p.y,age:0};this.impactStop=.06;this.shake=16;
    this.burst(this.p.x,this.p.y,'#e6ffbd',45);this.onEvent('nova'); return true;
  }
  get availableUpgrades() {
    return upgrades.filter(u => !(u.id==='multi'&&this.multi>=7&&(this.levels.multi??0)>=1) && !(u.id==='orbit'&&this.orbits>=5&&(this.levels.orbit??0)>=3)).map(u=>{
      if(u.id==='multi'&&this.multi>=7)return {...u,desc:'弹幕数量已满；完成散射协议进化条件',tag:'进化补全'};
      if(u.id==='orbit'&&this.orbits>=5)return {...u,desc:'护卫数量已满；推进电磁风暴进化条件',tag:'进化补全'};
      return u;
    });
  }
  checkLevel() {
    if (this.xp < this.nextXp || this.state !== 'playing') return;
    this.xp -= this.nextXp; this.level++; this.nextXp = Math.round(this.nextXp * 1.35 + 9);
    const pool = this.availableUpgrades;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.choices = pool.slice(0, 3); this.state = 'upgrade';this.upgradeSelection='';this.upgradeIntro=.85;
    this.burst(this.p.x,this.p.y,'#c5ff80',35);
    this.rings.push({x:this.p.x,y:this.p.y,r:10,life:1,color:'#d5ff9e'});this.onEvent('level');
  }
  checkEvolutions() {
    for (const evolution of this.evolutions) {
      if (!evolution.ready || this.evolved.has(evolution.id)) continue;
      this.evolved.add(evolution.id); this.rings.push({ x: this.p.x, y: this.p.y, r: 10, life: 1, color: '#f7d588' }); this.onEvent('evolution', evolution.name);
    }
  }
  choose(id, { hold = false } = {}) {
    if (this.state !== 'upgrade' || this.upgradeIntro>0 || !this.choices.some(x => x.id === id)) return false;
    if (id === 'power') this.damage *= 1.3;
    if (id === 'speed') this.interval = Math.max(.065, this.interval * .82);
    if (id === 'multi') this.multi=Math.min(7,this.multi+1);
    if (id === 'pierce') this.pierce++;
    if (id === 'heal') { this.p.maxHp += 20; this.p.hp = Math.min(this.p.maxHp, this.p.hp + this.p.maxHp * .5); }
    if (id === 'magnet') { this.magnet += 55; this.p.speed = Math.min(320, this.p.speed * 1.08); }
    if (id === 'orbit') this.orbits=Math.min(5,this.orbits+1);
    if (id === 'nova') this.novaPower += .5;
    this.levels[id] = (this.levels[id] ?? 0) + 1; this.upgradeSelection=hold?id:'';this.state = hold?'upgrade':'playing'; this.choices = []; this.onEvent('choose'); this.checkEvolutions(); return true;
  }
  finishUpgrade() {
    if(this.state!=='upgrade'||!this.upgradeSelection)return false;
    this.upgradeSelection='';this.state='playing';this.onEvent('choose');return true;
  }
  detonateBomb() {
    const radius=Math.max(420,this.viewHeight*.7),before=this.kills;
    // Two passes include children spawned by splitting enemies. Boss phases remain intact.
    for(let pass=0;pass<2;pass++)for(const e of [...this.enemies]){
      const dx=e.x-this.p.x,dy=e.y-this.p.y,d=Math.hypot(dx,dy);
      if(e.hp<=0||d>radius||(pass===1&&e.isBoss))continue;
      this.hit(e,e.isBoss?e.maxHp*.15/.8/this.damageMultiplier:e.hp/(1-(e.armor??0))+1,true,.15);
      if(e.isBoss){e.dash=null;e.attackClock=Math.max(e.attackClock,1.2);e.x=clamp(e.x+dx/(d||1)*45,35,W-35);e.y+=dy/(d||1)*45;}
    }
    this.enemyShots=[];this.hazards=[];this.p.invuln=Math.max(this.p.invuln,.8);
    this.buffs.magnet=Math.max(this.buffs.magnet,2);this.novaFx={x:this.p.x,y:this.p.y,age:0,radius,bomb:true};
    this.impactStop=.09;this.shake=23;this.bombCooldown=.45;
    this.burst(this.p.x,this.p.y,'#ffcb73',80);this.onEvent('nova');
    this.onEvent('purchase',`轰！击破 ${this.kills-before} 只怪物 · 战利品回收中`);
  }
  fire(angle, { shotgun = false, offset = 0 } = {}) {
    const crit = Math.random() < this.crit, blast = shotgun && this.evolved.has('blast'), a = angle + offset, speed = shotgun ? 510 : 680;
    this.bullets.push({ x: this.p.x + Math.cos(a) * 22, y: this.p.y + Math.sin(a) * 22, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: shotgun ? .7 : 1.25,
      damage: this.damage * (crit ? 1.8 : 1) * (shotgun ? .65 + (this.levels.shotgun ?? 0) * .12 : 1), crit, hits: new Set(), pierce: shotgun ? 0 : this.pierce + (this.evolved.has('gatling') ? 1 : 0),
      blast, shotgun, color: blast ? '#ffaf69' : this.evolved.has('gatling') ? '#ffcb73' : '#fadd75' });
  }
  updateWorld(dt, input) {
    const p = this.p, moving = Math.hypot(input.x, input.y) > .05;
    if (moving) this.autoAdvance = false;
    const iy = moving ? input.y : this.autoAdvance ? -1 : 0, length = Math.max(1, Math.hypot(input.x, iy));
    const speed = p.speed * (this.buffs.haste > 0 ? 1.15 : 1);
    p.x = clamp(p.x + input.x / length * speed * dt, 25, W - 25); p.y += iy / length * speed * dt;
    if (this.bossGate !== null) p.y = clamp(p.y, this.bossGate - 235, this.bossGate + 235);
    if (input.x) p.face = input.x > 0 ? 1 : -1;
    this.distance = Math.max(this.distance, distanceAt(p.y)); this.zone = Math.floor(this.distance / 380);
    const biome = biomeAt(p.y); if (biome !== this.biome) { this.biome = biome; this.onEvent('biome', biome.name); }
    this.cameraY = p.y - this.viewHeight * .52; this.world.update(p.y);
    for (const supply of this.world.supplies()) {
      if (Math.hypot(supply.x - p.x, supply.y - p.y) < 48 && this.world.collect(supply.id)) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .35); this.novaCooldown = 0;
        for (let i = 0; i < 8; i++) this.drop(supply.x + rand(-15, 15), supply.y + rand(-15, 15), 2 + this.zone);
        this.drop(supply.x,supply.y,1,['magnet','bomb','haste','shield'][Math.floor(Math.random()*4)]);
        this.onEvent('supply'); this.burst(supply.x, supply.y, '#b1f886', 35);
      }
    }
  }
  update(dt, input = { x: 0, y: 0 }) {
    dt=clamp(dt,0,.05);
    if(this.state==='upgrade'){this.upgradeIntro=Math.max(0,this.upgradeIntro-dt);this.updateEffects(dt);return;}
    // Presentation freezes combat, so resurrection protection starts after the reveal.
    if(['playing','loot'].includes(this.state)&&this.reviveTimer>0){this.reviveTimer=Math.max(0,this.reviveTimer-dt);this.updateEffects(dt);return;}
    if(this.state==='playing'&&this.impactStop>0){this.impactStop=Math.max(0,this.impactStop-dt);this.updateEffects(dt);return;}
    if(this.state==='loot'){
      dt=clamp(dt,0,.05);this.lootTimer-=dt;this.collectDrops(dt);this.updateEffects(dt);
      if(this.lootTimer<=0){this.state='relic';this.onEvent('reward');}return;
    }
    if (this.state !== 'playing') return;
    dt = Math.max(0, Math.min(dt, .05)); this.time += dt; const p = this.p;
    this.threatGrowth += (this.targetThreatGrowth - this.threatGrowth) * (1-Math.exp(-dt/18));
    this.novaCooldown = Math.max(0, this.novaCooldown - dt); p.invuln = Math.max(0, p.invuln - dt); this.shake = Math.max(0, this.shake - dt * 28);
    this.comboClock -= dt; if (this.comboClock <= 0) this.combo = 0;
    for(const buff of Object.keys(this.buffs))this.buffs[buff]=Math.max(0,this.buffs[buff]-dt);
    this.updateWorld(dt, input);
    this.updateRegionEvent(dt);
    if (!this.boss && (this.distance >= this.nextBossDistance || this.time >= this.nextBossTime)) this.spawnBoss();
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      this.spawnClock = this.boss ? 1.4/(1+this.pressure*.4) : Math.max(.19, (.52 - this.time * .001 - this.distance * .00008)/(1+this.pressure*.3));
      const count = this.boss ? 1 : Math.min(5, 1 + Math.floor(this.time / 50 + this.distance / 350 + this.pressure));
      for (let i = 0; i < count; i++) if (this.enemies.length < 130) this.spawn(enemyForZone(Math.floor(distanceAt(p.y)/380)));
    }
    if (this.time >= this.nextElite) { if (!this.boss) this.spawnElite(enemyForZone(this.zone)); this.nextElite += 40/(1+this.pressure*.6); }
    this.shootClock -= dt; this.shotgunClock -= dt;
    let target = null, nearest = Infinity;
    for (const e of this.enemies) { if (e.hp <= 0) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nearest) { nearest = d; target = e; } }
    if (target && nearest < 325) {
      const angle = Math.atan2(target.y - p.y, target.x - p.x); this.lastAim = angle;
      if (!input.x) p.face = target.x > p.x ? 1 : -1;
      if (this.shootClock <= 0) {
        this.shootClock = this.interval * (this.evolved.has('gatling') ? .52 : 1) * (this.buffs.haste>0?.65:1);
        for (let i = 0; i < this.multi; i++) this.fire(angle, { offset: (i - (this.multi - 1) / 2) * .14 });
        this.burst(p.x + Math.cos(angle) * 27, p.y + Math.sin(angle) * 27, this.boostsBought?'#ffb263':'#ffe29a', this.boostsBought?5:2); this.onEvent(this.evolved.has('gatling') ? 'gatling' : 'shoot');
      }
      if ((this.levels.shotgun ?? 0) > 0 && this.shotgunClock <= 0) {
        this.shotgunClock = this.evolved.has('blast') ? .85 : 1.35;
        for (let i = 0; i < 5; i++) this.fire(angle, { shotgun: true, offset: (i - 2) * .16 }); this.onEvent('shotgun');
      }
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      if (e.isBoss) { if(!e.dash){e.x+=(p.x-e.x)/d*e.speed*dt;e.y+=(p.y-e.y)/d*e.speed*dt;} } else updateEnemy(this,e,dt);
      e.flash = Math.max(0, e.flash - dt); e.orbitHit = Math.max(0, e.orbitHit - dt);
      if (e.isBoss) updateBoss(this, e, dt);
      if (d < e.size * .3 + 13) this.hurt(e.damage);
      for (let i = 0; i < this.orbits; i++) {
        const storm = this.evolved.has('storm'), a = this.time * (storm ? 4 : 2.8) + i * Math.PI * 2 / this.orbits;
        const x = p.x + Math.cos(a) * (storm ? 99 : 77), y = p.y + Math.sin(a) * (storm ? 99 : 77);
        if (Math.hypot(e.x - x, e.y - y) >= e.size * .4 + 14 || e.orbitHit > 0) continue;
        this.hit(e, this.damage * (storm ? 2.4 : 1.7)); e.orbitHit = .35;
        if (storm) { const next = this.enemies.find(n => n !== e && n.hp > 0 && Math.hypot(n.x - e.x, n.y - e.y) < 130); if (next) { this.hit(next, this.damage); this.arcs.push({ x: e.x, y: e.y, tx: next.x, ty: next.y, life: .15 }); } }
      }
    }
    if (this.state === 'playing') updateHazards(this, dt);
    for (const b of this.bullets) {
      const ox = b.x, oy = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hits.has(e.id)) continue;
        const dx = b.x - ox, dy = b.y - oy, t = clamp(((e.x - ox) * dx + (e.y - oy) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        if (Math.hypot(e.x - (ox + dx * t), e.y - (oy + dy * t)) >= e.size * .33 + 4) continue;
        this.hit(e, b.damage, b.crit); b.hits.add(e.id);
        if (b.blast) { this.rings.push({ x: e.x, y: e.y, r: 8, life: .23, color: '#ffb76c' }); this.burst(e.x, e.y, '#ffbb75', 8); for (const n of this.enemies) if (n !== e && n.hp > 0 && Math.hypot(n.x - e.x, n.y - e.y) < 66) this.hit(n, b.damage * .65); }
        if (b.hits.size > b.pierce) { b.life = 0; break; }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > -40 && b.x < W + 40 && Math.abs(b.y - p.y) < 900);
    this.enemies = this.enemies.filter(e => e.hp > 0 && (e.isBoss || Math.abs(e.y - p.y) < 1000));
    this.resolveDeath();if(this.state==='dead'||this.reviveTimer>0)return;this.collectDrops(dt);this.updateEffects(dt);this.checkLevel();
  }
  updateEffects(dt) {
    this.bombCooldown=Math.max(0,this.bombCooldown-dt);
    if(this.novaFx){this.novaFx.age+=dt;if(this.novaFx.age>=.8)this.novaFx=null;}
    this.shake=Math.max(0,this.shake-dt*20);
    for (const a of this.particles) { a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; a.vx *= .96; a.vy *= .96; } this.particles = this.particles.filter(a => a.life > 0).slice(-500);
    for (const t of this.texts) { t.y -= dt * 35; t.life -= dt; } this.texts = this.texts.filter(t => t.life > 0).slice(-80);
    for (const r of this.rings) { r.r += dt * 460; r.life -= dt; } this.rings = this.rings.filter(r => r.life > 0);
    for (const arc of this.arcs) arc.life -= dt; this.arcs = this.arcs.filter(a => a.life > 0);
  }
  collectDrops(dt) {
    let collected = 0; const p = this.p, picked=[];
    this.drops = this.drops.filter(d => {
      if(d.bossLoot){d.x=clamp(d.x+(d.vx||0)*dt,22,W-22);d.y+=(d.vy||0)*dt;d.vx*=Math.exp(-dt*2.4);d.vy*=Math.exp(-dt*2.4);}
      const dist = Math.hypot(d.x - p.x, d.y - p.y); d.age = (d.age ?? 0) + dt;
      if(d.bossLoot&&d.age<.9)return true;
      const common=d.type==='coin'||d.type==='xp';
      if (d.bossLoot || dist < (common?this.magnet:this.magnet*.55) || (common&&(d.age>7||this.buffs.magnet>0))) { const travel = Math.min(dist, (d.bossLoot?800:this.buffs.magnet>0?950:340 + 180 * Math.max(0, 1 - dist / this.magnet)) * dt); d.x += (p.x - d.x) / (dist || 1) * travel; d.y += (p.y - d.y) / (dist || 1) * travel; }
      if (Math.hypot(d.x - p.x, d.y - p.y) < 22) {
        picked.push(d);return false;
      }
      return common || Math.abs(d.y - p.y) < 1600;
    });
    // Apply pickups after filtering, so bombs cannot discard loot spawned by their own kills.
    for(const d of picked){
      if(d.type==='coin'){this.coins+=d.value;collected+=d.value;continue;}
      if(d.type==='xp'){this.xp+=d.value;continue;}
      if(d.type==='heal')p.hp=Math.min(p.maxHp,p.hp+d.value);
      if(d.type==='life'){this.lives=Math.min(5,this.lives+1);this.onEvent('life',this.lives);}
      if(d.type==='magnet')this.buffs.magnet=10;
      if(d.type==='haste')this.buffs.haste=12;
      if(d.type==='shield'){this.buffs.shield=18;this.shieldCharges=3;}
      if(d.type==='bomb'){
        this.rings.push({x:p.x,y:p.y,r:15,life:.85,color:'#ffbd7a'});this.shake=10;
        for(const e of [...this.enemies])if(Math.hypot(e.x-p.x,e.y-p.y)<380)this.hit(e,this.damage*9,true);
        this.enemyShots=this.enemyShots.filter(b=>Math.hypot(b.x-p.x,b.y-p.y)>380);this.onEvent('nova');
      }
      if(d.type==='chest'){const value=30+this.zone*12;this.coins+=value;collected+=value;p.hp=Math.min(p.maxHp,p.hp+20);this.drop(p.x+40,p.y,1,['magnet','haste','shield'][Math.floor(Math.random()*3)]);}
      const item=lootTypes[d.type];this.texts.push({x:p.x,y:p.y-40,text:item.name,color:item.color,life:1.1});this.onEvent('pickup',item.name);
    }
    if (this.drops.length > 500) { const excess = this.drops.splice(0, 100);for(const type of ['coin','xp']){const value=excess.filter(d=>d.type===type).reduce((n,d)=>n+d.value,0);if(value)this.drop(p.x,p.y-50,value,type);} }
    if (collected) this.onEvent('coin', collected);
  }
}
