import { W, H, ORIGIN_Y, World, distanceAt, biomeAt } from './world.js';
import { bossTypes, relics, updateBoss, updateHazards } from './bosses.js';
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
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export class Game {
  constructor({ onEvent = () => {}, hero = 0, gear = [0, 0, 0, 0] } = {}) {
    this.onEvent = onEvent; this.hero = hero; this.gear = [...gear];
    this.state = 'ready'; this.time = 0; this.kills = 0; this.coins = 0; this.level = 1; this.xp = 0; this.nextXp = 22;
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
  get weaponName() { return this.evolved.has('gatling') ? '炼狱加特林' : '突击步枪'; }
  get musicMode() { return this.boss ? 'boss' : this.enemies.length >= 18 ? 'combat' : 'explore'; }
  get evolutions() {
    const lv = id => this.levels[id] ?? 0;
    return [
      { id: 'gatling', name: '炼狱加特林', art: 3, rule: '弹头 2 + 扳机 2', progress: `${Math.min(2, lv('power'))}/2 · ${Math.min(2, lv('speed'))}/2`, ready: lv('power') >= 2 && lv('speed') >= 2 },
      { id: 'blast', name: '爆裂霰弹', art: 4, rule: '霰弹 3 + 散射 1', progress: `${Math.min(3, lv('shotgun'))}/3 · ${Math.min(1, lv('multi'))}/1`, ready: lv('shotgun') >= 3 && lv('multi') >= 1 },
      { id: 'storm', name: '电磁风暴', art: 5, rule: '护卫 3 + 脉冲 1', progress: `${Math.min(3, lv('orbit'))}/3 · ${Math.min(1, lv('nova'))}/1`, ready: lv('orbit') >= 3 && lv('nova') >= 1 },
    ];
  }
  start() { this.state = 'playing'; this.enemies = []; this.drops = []; for (let i = 0; i < 8; i++) this.spawn(enemyForZone(0)); this.onEvent('start'); }
  resizeViewport(height) {
    this.viewHeight = height;
    this.cameraY = this.p.y - height * .52;
  }
  spawn(type, x, y) {
    const t = enemyTypes[type], scale = this.difficulty;
    if (x === undefined) {
      const edge = Math.floor(rand(0, 4));
      x = edge === 0 ? -24 : edge === 1 ? W + 24 : rand(25, W - 25);
      y = this.cameraY + (edge === 2 ? -24 : edge === 3 ? this.viewHeight + 24 : rand(65, this.viewHeight - 50));
    }
    const e = { ...t, type, x, y, maxHp: t.hp * scale, hp: t.hp * scale, damage: t.damage * (1 + this.distance / 2200), speed: t.speed * Math.min(2.5, 1 + this.distance / 1800), id: ++this.uid, flash: 0, phase: rand(0, 6), orbitHit: 0, attackClock: rand(2, 4) };
    this.enemies.push(e); return e;
  }
  spawnBoss() {
    if (this.boss) return null;
    const index = this.bossIndex++ % bossTypes.length, type = bossTypes[index];
    const hp = type.hp * (1 + this.bossKills * .55 + this.distance / 650) * (1 + this.gear[0] * .12);
    this.bossGate = this.p.y - 45;
    const boss = { ...type, type: 3, sprite: 5, bossType: index, isBoss: true, id: ++this.uid, hp, maxHp: hp, x: W / 2, y: this.p.y - 180, flash: 0, phase: 0, orbitHit: 0, attackClock: 2.2, attackCount: 0, intent: '正在逼近', phaseLevel: 0, shieldTime: 0, dash: null };
    this.boss = boss; this.enemies.push(boss); this.autoAdvance = false;
    this.onEvent('boss', boss.name); return boss;
  }
  finishBoss(boss) {
    this.bossKills++; this.boss = null; this.bossGate = null; this.autoAdvance = false;
    this.hazards = this.hazards.filter(h => h.owner !== boss.id); this.enemyShots = this.enemyShots.filter(b => b.owner !== boss.id);
    this.nextBossDistance = Math.max(this.nextBossDistance + 380, this.distance + 180); this.nextBossTime = this.time + 75;
    this.state = 'relic'; this.choices = relics.map(r => ({ ...r })); this.onEvent('victory', boss.name);
  }
  chooseRelic(id) {
    if (this.state !== 'relic' || !this.choices.some(c => c.id === id)) return false;
    if (id === 'hunter') { this.damage *= 1.2; this.crit = Math.min(.8, this.crit + .08); }
    if (id === 'guardian') { this.p.maxHp += 40; this.p.hp = this.p.maxHp; }
    if (id === 'reactor') { this.novaPower += .5; this.novaCooldown = 0; this.orbits = Math.min(5, this.orbits + 1); }
    this.relics.push(id); if (this.relics.length > 100) this.relics.shift();
    this.choices = []; this.state = 'playing'; this.p.invuln = 2; this.onEvent('choose'); return true;
  }
  pause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
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
  hit(e, damage, crit = false) {
    if (e.hp <= 0) return;
    if(e.isBoss && e.shieldTime>0)return;
    damage *= 1-(e.isBoss?.2:(e.armor??0));
    if(e.isBoss)damage=Math.min(damage,e.maxHp*.045);
    e.hp -= damage; e.flash = .1;
    if(e.isBoss && e.phaseLevel<2){
      const threshold=e.maxHp*(e.phaseLevel===0?.65:.3);
      if(e.hp<=threshold){e.hp=threshold;e.phaseLevel++;e.shieldTime=3;e.attackClock=.1;this.onEvent('bossPhase',`${e.name} · 护盾重组，准备反击`);}
    }
    this.texts.push({ x: e.x + rand(-8, 8), y: e.y - 15, text: Math.round(damage), color: crit ? '#ffe67a' : '#edf8d9', life: .5, big: crit });
    this.burst(e.x, e.y, e.color, 3);
    if (e.hp > 0) return;
    this.kills++; this.combo++; this.comboClock = 2; this.burst(e.x, e.y, e.color, e.type === 3 ? 35 : 12);
    const n = e.isBoss ? 22 : e.type === 3 ? 10 : e.type === 2 ? 3 : 1;
    for (let i = 0; i < n; i++) this.drop(e.x + rand(-20, 20), e.y + rand(-20, 20), (e.type === 3 ? 3 : 1) + Math.floor(this.distance / 600));
    this.drop(e.x,e.y,e.isBoss?24:e.type===3?6:e.splitChild?.5:e.type===2?2:1,'xp');
    const loot=e.isBoss?'chest':rollLoot();if(loot)this.drop(e.x+18,e.y,loot==='heal'?35:1,loot);
    if(e.behavior==='split'&&!e.splitChild){for(let i=0;i<2;i++){const child=this.spawn(e.type,e.x+(i?20:-20),e.y+10);child.hp=child.maxHp=e.maxHp*.25;child.size=30;child.speed*=1.8;child.splitChild=true;}}
    if(!e.isBoss)this.hazards=this.hazards.filter(h=>h.owner!==e.id);
    if (this.combo % 10 === 0) { this.onEvent('combo', this.combo); this.shake = 4; }
    if (e.isBoss) this.finishBoss(e);
  }
  nova() {
    if (this.state !== 'playing' || this.novaCooldown > 0) return false;
    this.novaCooldown = Math.max(4, 12 - this.novaPower); this.rings.push({ x: this.p.x, y: this.p.y, r: 12, life: .65, color: '#bdff83' }); this.shake = 9;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.p.x, e.y - this.p.y); if (d >= 245) continue;
      this.hit(e, 100 * this.novaPower, true);
      if (d > 0 && !e.isBoss) { e.x += (e.x - this.p.x) / d * 55; e.y += (e.y - this.p.y) / d * 55; }
    }
    this.enemyShots = this.enemyShots.filter(b => Math.hypot(b.x - this.p.x, b.y - this.p.y) > 245); this.onEvent('nova'); return true;
  }
  checkLevel() {
    if (this.xp < this.nextXp || this.state !== 'playing') return;
    this.xp -= this.nextXp; this.level++; this.nextXp = Math.round(this.nextXp * 1.35 + 9);
    const pool = upgrades.filter(u => !(u.id === 'multi' && this.multi >= 7) && !(u.id === 'orbit' && this.orbits >= 5));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.choices = pool.slice(0, 3); this.state = 'upgrade'; this.onEvent('level');
  }
  checkEvolutions() {
    for (const evolution of this.evolutions) {
      if (!evolution.ready || this.evolved.has(evolution.id)) continue;
      this.evolved.add(evolution.id); this.rings.push({ x: this.p.x, y: this.p.y, r: 10, life: 1, color: '#f7d588' }); this.onEvent('evolution', evolution.name);
    }
  }
  choose(id) {
    if (this.state !== 'upgrade' || !this.choices.some(x => x.id === id)) return false;
    if (id === 'power') this.damage *= 1.3;
    if (id === 'speed') this.interval = Math.max(.065, this.interval * .82);
    if (id === 'multi') this.multi++;
    if (id === 'pierce') this.pierce++;
    if (id === 'heal') { this.p.maxHp += 20; this.p.hp = Math.min(this.p.maxHp, this.p.hp + this.p.maxHp * .5); }
    if (id === 'magnet') { this.magnet += 55; this.p.speed = Math.min(320, this.p.speed * 1.08); }
    if (id === 'orbit') this.orbits++;
    if (id === 'nova') this.novaPower += .5;
    this.levels[id] = (this.levels[id] ?? 0) + 1; this.state = 'playing'; this.choices = []; this.onEvent('choose'); this.checkEvolutions(); return true;
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
    if (this.state !== 'playing') return;
    dt = Math.max(0, Math.min(dt, .05)); this.time += dt; const p = this.p;
    this.novaCooldown = Math.max(0, this.novaCooldown - dt); p.invuln = Math.max(0, p.invuln - dt); this.shake = Math.max(0, this.shake - dt * 28);
    this.comboClock -= dt; if (this.comboClock <= 0) this.combo = 0;
    for(const buff of Object.keys(this.buffs))this.buffs[buff]=Math.max(0,this.buffs[buff]-dt);
    this.updateWorld(dt, input);
    if (!this.boss && (this.distance >= this.nextBossDistance || this.time >= this.nextBossTime)) this.spawnBoss();
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      this.spawnClock = this.boss ? 1.4 : Math.max(.19, .52 - this.time * .001 - this.distance * .00008);
      const count = this.boss ? 1 : Math.min(5, 1 + Math.floor(this.time / 50 + this.distance / 350));
      for (let i = 0; i < count; i++) if (this.enemies.length < 130) this.spawn(enemyForZone(Math.floor(distanceAt(p.y)/380)));
    }
    if (this.time >= this.nextElite) { if (!this.boss) this.spawn(3); this.nextElite += 40; }
    this.shootClock -= dt; this.shotgunClock -= dt;
    let target = null, nearest = Infinity;
    for (const e of this.enemies) { if (e.hp <= 0) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nearest) { nearest = d; target = e; } }
    if (target && nearest < 325) {
      const angle = Math.atan2(target.y - p.y, target.x - p.x); this.lastAim = angle;
      if (!input.x) p.face = target.x > p.x ? 1 : -1;
      if (this.shootClock <= 0) {
        this.shootClock = this.interval * (this.evolved.has('gatling') ? .52 : 1) * (this.buffs.haste>0?.65:1);
        for (let i = 0; i < this.multi; i++) this.fire(angle, { offset: (i - (this.multi - 1) / 2) * .14 });
        this.burst(p.x + Math.cos(angle) * 27, p.y + Math.sin(angle) * 27, '#ffe29a', 2); this.onEvent(this.evolved.has('gatling') ? 'gatling' : 'shoot');
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
    this.enemies = this.enemies.filter(e => e.hp > 0 && (e.isBoss || Math.abs(e.y - p.y) < 1000)); this.collectDrops(dt);
    for (const a of this.particles) { a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; a.vx *= .96; a.vy *= .96; } this.particles = this.particles.filter(a => a.life > 0).slice(-500);
    for (const t of this.texts) { t.y -= dt * 35; t.life -= dt; } this.texts = this.texts.filter(t => t.life > 0).slice(-80);
    for (const r of this.rings) { r.r += dt * 460; r.life -= dt; } this.rings = this.rings.filter(r => r.life > 0);
    for (const arc of this.arcs) arc.life -= dt; this.arcs = this.arcs.filter(a => a.life > 0);
    if (p.hp <= 0) { this.state = 'dead'; this.autoAdvance = false; this.onEvent('dead'); } else this.checkLevel();
  }
  collectDrops(dt) {
    let collected = 0; const p = this.p, picked=[];
    this.drops = this.drops.filter(d => {
      const dist = Math.hypot(d.x - p.x, d.y - p.y); d.age = (d.age ?? 0) + dt;
      const common=d.type==='coin'||d.type==='xp';
      if (dist < (common?this.magnet:this.magnet*.55) || (common&&(d.age>7||this.buffs.magnet>0))) { const travel = Math.min(dist, (this.buffs.magnet>0?950:340 + 180 * Math.max(0, 1 - dist / this.magnet)) * dt); d.x += (p.x - d.x) / (dist || 1) * travel; d.y += (p.y - d.y) / (dist || 1) * travel; }
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
