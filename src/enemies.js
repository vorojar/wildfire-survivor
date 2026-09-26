export const enemyTypes = [
  { name: '苔原史莱姆', sprite: 2, hp: 32, speed: 32, size: 38, damage: 9, color: '#a5ed45' },
  { name: '林间蝙蝠', sprite: 3, hp: 23, speed: 68, size: 40, damage: 7, color: '#c587e8' },
  { name: '寄生蘑菇', sprite: 4, hp: 72, speed: 27, size: 43, damage: 14, color: '#ffa255' },
  { name: '遗迹石卫', sprite: 5, hp: 450, speed: 30, size: 70, damage: 21, color: '#b280ff', armor: .2 },
  { name: '荆棘狼', art: 0, hp: 58, speed: 58, size: 48, damage: 12, color: '#bbbd83', behavior: 'charge', cooldown: 5.5 },
  { name: '枯木射手', art: 1, hp: 115, speed: 22, size: 56, damage: 14, color: '#b5d17c', behavior: 'ranged', cooldown: 4.7, shots: 3 },
  { name: '铁脊野猪', art: 2, hp: 145, speed: 34, size: 53, damage: 19, color: '#bf9870', behavior: 'charge', cooldown: 6.3, armor: .2 },
  { name: '骷髅弓手', art: 3, hp: 78, speed: 32, size: 46, damage: 15, color: '#daceaf', behavior: 'ranged', cooldown: 3.8, shots: 1 },
  { name: '失落盾卫', art: 4, hp: 200, speed: 30, size: 53, damage: 20, color: '#c6b29a', armor: .45 },
  { name: '游荡怨灵', art: 5, hp: 65, speed: 86, size: 47, damage: 12, color: '#9bddeb', behavior: 'wraith' },
  { name: '腐毒喷射者', art: 6, hp: 125, speed: 27, size: 55, damage: 15, color: '#a6d375', behavior: 'ranged', cooldown: 4.4, shots: 3 },
  { name: '孢刃跃兽', art: 7, hp: 98, speed: 56, size: 52, damage: 18, color: '#d59de5', behavior: 'charge', cooldown: 4.4 },
  { name: '多眼聚合体', art: 8, hp: 160, speed: 27, size: 55, damage: 16, color: '#e691b5', behavior: 'split' },
];
export const enemyPools = [[0,0,1,2,4,4,5,6],[7,7,8,8,9,9,3],[10,10,11,11,12,12,2]];
export function enemyForZone(zone, random = Math.random()) { const pool = enemyPools[zone % 3]; return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]; }

export function updateEnemy(game, e, dt) {
  if (e.dash) {
    e.x = Math.max(20, Math.min(460, e.x + e.dash.vx * dt)); e.y += e.dash.vy * dt; e.dash.left -= dt;
    if (e.dash.left <= 0) e.dash = null;
    return;
  }
  const dx = game.p.x - e.x, dy = game.p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const advance = e.behavior === 'ranged' && d < 215 ? (d < 130 ? -.45 : 0) : 1;
  e.x += dx / d * e.speed * dt * advance; e.y += dy / d * e.speed * dt * advance;
  if (e.behavior === 'wraith') e.x += Math.sin(game.time * 4 + e.phase) * 30 * dt;
  if (!['ranged','charge'].includes(e.behavior)) return;
  e.attackClock -= dt;
  if (e.attackClock > 0 || d > 360 || d < 55) return;
  e.attackClock = e.cooldown;
  const angle = Math.atan2(dy, dx), range = e.behavior === 'charge' ? 250 : d;
  game.hazards.push({ owner: e.id, shape: 'line', x: e.x, y: e.y, tx: Math.max(20,Math.min(460,e.x + Math.cos(angle) * range)), ty: e.y + Math.sin(angle) * range,
    age: 0, warn: e.behavior === 'charge' ? .85 : .8, active: e.behavior === 'charge' ? .5 : .12,
    radius: e.behavior === 'charge' ? e.size * .25 : 3, damage: e.damage, color: e.color,
    charge: e.behavior === 'charge', shotCount: e.behavior === 'ranged' ? e.shots : 0, projectileSpeed: e.type === 7 ? 215 : 145 });
}
