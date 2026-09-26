export const bossTypes = [
  { name: '裂岩巨像', title: '古道的守门人', art: 0, hp: 4200, speed: 27, size: 112, damage: 26, color: '#f5b36b', moves: '蓄力冲撞 · 扇形重击' },
  { name: '孢冠女王', title: '感染之源', art: 1, hp: 5600, speed: 20, size: 110, damage: 23, color: '#75e2b4', moves: '毒性孢子 · 召唤菌群' },
  { name: '永夜蝠王', title: '血月的掠影', art: 2, hp: 4900, speed: 48, size: 128, damage: 25, color: '#c99aff', moves: '俯冲突袭 · 环形弹幕' },
];
export const relics = [
  { id: 'hunter', name: '猎杀核心', desc: '伤害 +20%，暴击率 +8%', icon: 'Crosshair', tag: '稀有 · 火力' },
  { id: 'guardian', name: '守护核心', desc: '生命上限 +40，立即回满生命', icon: 'Shield', tag: '稀有 · 生存' },
  { id: 'reactor', name: '聚能核心', desc: '冲击波强化，立即充能并获得环绕球', icon: 'Orbit', tag: '稀有 · 能量' },
  { id: 'bulwark', name: '巨像之心', desc: '生命上限 +60，恢复全部生命', icon: 'Shield', tag: '巨像遗物' },
  { id: 'spore', name: '孢冠精华', desc: '拾取范围 +100，伤害 +15%', icon: 'Crosshair', tag: '女王遗物' },
  { id: 'wing', name: '永夜羽刃', desc: '移速 +20，射击间隔缩短 14%', icon: 'Crosshair', tag: '蝠王遗物' },
  { id: 'phoenix', name: '不熄余烬', desc: '剩余生命 +1，并恢复全部生命', icon: 'Heart', tag: '稀有 · 续命' },
  { id: 'barrage', name: '弹幕核心', desc: '额外发射 1 枚子弹，穿透 +1', icon: 'Crosshair', tag: '稀有 · 弹幕' },
];

export function bossRewards(game, boss) {
  const featured = relics.find(r => r.id === ['bulwark','spore','wing'][boss.bossType]);
  const pool = relics.filter(r => r !== featured && !(r.id === 'phoenix' && game.lives + (game.lastBoss?.life?1:0) >= 5) && !(r.id === 'barrage' && game.multi >= 7) && !(r.id === 'reactor' && game.orbits >= 5));
  // Prefer rewards not chosen recently, keeping every chest from feeling identical.
  const recent = game.relics.slice(-3);
  const shuffled = pool.map(r => ({ ...r, order: Math.random() + (recent.includes(r.id) ? 2 : 0) })).sort((a,b) => a.order-b.order);
  return [featured, ...shuffled.slice(0,2)].map(r => ({ ...r }));
}

export function updateBoss(game, boss, dt) {
  boss.shieldTime = Math.max(0, boss.shieldTime - dt);
  if (boss.dash) {
    boss.x = Math.max(45, Math.min(435, boss.x + boss.dash.vx * dt));
    boss.y += boss.dash.vy * dt;
    boss.dash.left -= dt;
    if (boss.dash.left <= 0) boss.dash = null;
    return;
  }
  boss.attackClock -= dt;
  if (boss.attackClock > 0) return;
  boss.attackClock = Math.max(1.65, ((boss.bossType === 2 ? 3.5 : 4.1) - boss.phaseLevel * .6) / boss.aggression);
  const attack = boss.attackCount++;
  const angle = Math.atan2(game.p.y - boss.y, game.p.x - boss.x);
  const damageScale = 1 + (boss.aggression-1)*.6;
  const base = { owner: boss.id, bossAttack: true, color: boss.color, age: 0, damage: (30 + boss.phaseLevel * 5)*damageScale, active: .45 };
  if (boss.bossType === 0 && attack % 2 === 1) {
    boss.intent = '扇形重击';
    game.hazards.push({ ...base, shape: 'cone', x: boss.x, y: boss.y, angle, spread: 1.15, radius: 190, warn: 1.2 });
    // Aimed rock shards keep the golem dangerous at rifle range; the same windup remains.
    game.hazards.push({ ...base, shape: 'line', x: boss.x, y: boss.y, tx: game.p.x, ty: game.p.y, radius: 8, warn: 1.2, active: .15, shotCount: 3+boss.phaseLevel*2, projectileSpeed: 155+boss.phaseLevel*15 });
  } else if (boss.bossType === 1) {
    boss.intent = attack % 2 ? '菌群召唤' : '毒性孢子';
    for (let i = 0; i < 3; i++) {
      game.hazards.push({ ...base, shape: 'circle', x: Math.max(45, Math.min(435, game.p.x + (i - 1) * 105)), y: game.p.y + Math.sin(i * 2.5) * 90, radius: 61, warn: 1.4, active: 4, damage: 11*damageScale, poison: true });
    }
    if (attack % 2) for (let i = 0; i < 4; i++) game.spawn(i % 2 ? 12 : 10, Math.max(30, Math.min(450, boss.x + (i - 1.5) * 52)), boss.y + 70);
  } else if (boss.bossType === 2 && attack % 2 === 1) {
    boss.intent = '血月弹幕';
    game.hazards.push({ ...base, shape: 'circle', x: boss.x, y: boss.y, radius: 95, warn: 1.25, active: .2, burst: true, damage: 16*damageScale, projectileSpeed: 125+boss.phaseLevel*15 });
  } else {
    boss.intent = boss.bossType === 0 ? '蓄力冲撞' : '俯冲突袭';
    const range = boss.bossType === 0 ? 320 : 360;
    const tx = Math.max(45, Math.min(435, boss.x + Math.cos(angle) * range));
    const ty = boss.y + Math.sin(angle) * range;
    game.hazards.push({ ...base, shape: 'line', x: boss.x, y: boss.y, tx, ty, radius: boss.bossType === 0 ? 34 : 25, warn: 1.15, active: .55, charge: true });
  }
  game.onEvent('warning');
}

export function hazardContains(h, p) {
  if (h.shape === 'circle') return Math.hypot(h.x - p.x, h.y - p.y) < h.radius + 9;
  if (h.shape === 'cone') {
    const a = Math.atan2(p.y - h.y, p.x - h.x) - h.angle;
    return Math.hypot(h.x - p.x, h.y - p.y) < h.radius + 9 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < h.spread;
  }
  const dx = h.tx - h.x, dy = h.ty - h.y;
  const t = Math.max(0, Math.min(1, ((p.x - h.x) * dx + (p.y - h.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - h.x - dx * t, p.y - h.y - dy * t) < h.radius + 9;
}

export function updateHazards(game, dt) {
  for (const h of game.hazards) {
    h.age += dt;
    if (h.age < h.warn) continue;
    if (!h.triggered) {
      h.triggered = true;
      const owner = game.enemies.find(e => e.id === h.owner && e.hp > 0);
      if (h.charge && owner) owner.dash = { vx: (h.tx - h.x) / h.active, vy: (h.ty - h.y) / h.active, left: h.active };
      if (h.shotCount && owner) for (let i=0;i<h.shotCount;i++) {
        const a=Math.atan2(h.ty-h.y,h.tx-h.x)+(i-(h.shotCount-1)/2)*.22;
        game.enemyShots.push({x:h.x,y:h.y,vx:Math.cos(a)*h.projectileSpeed,vy:Math.sin(a)*h.projectileSpeed,life:5,damage:h.damage,owner:owner.id,color:h.color});
      }
      if (h.burst && owner) for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2 + owner.attackCount * .13;
        game.enemyShots.push({ x: h.x, y: h.y, vx: Math.cos(a) * h.projectileSpeed, vy: Math.sin(a) * h.projectileSpeed, life: 5, damage: h.damage, owner: owner.id, color: h.color });
      }
      game.onEvent('impact');
    }
    // Ordinary charging enemies deal contact damage at their actual position.
    if (!h.shotCount && (!h.charge || h.bossAttack) && hazardContains(h, game.p)) game.hurt(h.damage);
  }
  game.hazards = game.hazards.filter(h => h.age < h.warn + h.active);
  for (const b of game.enemyShots) {
    const ox = b.x, oy = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (hazardContains({ shape: 'line', x: ox, y: oy, tx: b.x, ty: b.y, radius: 5 }, game.p)) { game.hurt(b.damage); b.life = 0; }
  }
  game.enemyShots = game.enemyShots.filter(b => b.life > 0 && b.x > -40 && b.x < 520 && Math.abs(b.y - game.p.y) < 900);
}
