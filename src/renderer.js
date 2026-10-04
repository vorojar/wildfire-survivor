import { W, H, atlasRects, biomeBlendAt } from './world.js';
import { lootTypes } from './loot.js';

function ready(img) { return img?.complete && img.naturalWidth > 0; }
const terrainCaches = new WeakMap();
function terrainTile(chunk, assets) {
  if(!['arena','ruins','infected'].every(key=>ready(assets[key])))return null;
  let cache=terrainCaches.get(assets);if(!cache){cache=new Map();terrainCaches.set(assets,cache);}
  if(cache.has(chunk.id))return cache.get(chunk.id);
  const tile=document.createElement('canvas');tile.width=W;tile.height=H;const context=tile.getContext('2d');
  const mirrored=Math.abs(chunk.id)%2===1;
  for(let y=0;y<H;y+=4){
    const height=Math.min(4,H-y), blend=biomeBlendAt(chunk.top+y+height/2),sourceY=mirrored?H-y-height:y;
    context.save();if(mirrored){context.translate(0,y+height);context.scale(1,-1);}else context.translate(0,y);
    const paint=(key,alpha)=>{const img=assets[key];context.globalAlpha=alpha;context.drawImage(img,0,sourceY/H*img.naturalHeight,img.naturalWidth,height/H*img.naturalHeight,0,0,W,height);};
    paint(blend.from.asset,1);if(blend.amount>0)paint(blend.to.asset,blend.amount);context.restore();
  }
  cache.set(chunk.id,tile);while(cache.size>7)cache.delete(cache.keys().next().value);return tile;
}
function drawAtlas(ctx, img, index, x, y, size, flip = false) {
  if (!ready(img)) return;
  const [sx, sy, sw, sh] = atlasRects[index], scale = size / Math.max(sw, sh);
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, -sw * scale / 2, -sh * scale / 2, sw * scale, sh * scale); ctx.restore();
}
function hazardPath(ctx, h) {
  ctx.beginPath();
  if (h.shape === 'circle') ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
  else if (h.shape === 'cone') { ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.radius, h.angle - h.spread, h.angle + h.spread); ctx.closePath(); }
  else { const angle = Math.atan2(h.ty - h.y, h.tx - h.x), dx = Math.sin(angle) * h.radius, dy = -Math.cos(angle) * h.radius; ctx.moveTo(h.x + dx, h.y + dy); ctx.lineTo(h.tx + dx, h.ty + dy); ctx.lineTo(h.tx - dx, h.ty - dy); ctx.lineTo(h.x - dx, h.y - dy); ctx.closePath(); }
}
export function drawGame(ctx, g, assets, clock) {
  const height = g.viewHeight;
  ctx.clearRect(0, 0, W, height); ctx.save();
  if (g.shake) ctx.translate((Math.random() - .5) * g.shake, (Math.random() - .5) * g.shake);
  const camera = g.cameraY;
  if (g.state === 'ready' && ready(assets.arena)) ctx.drawImage(assets.arena, 0, 0, W, height);
  else for (const chunk of g.world.chunks.values()) {
    const y = chunk.top - camera;if(y>height||y+H<0)continue;const tile=terrainTile(chunk,assets);
    if(tile)ctx.drawImage(tile,0,y,W,H+1);
  }
  for (let i = 0; i < 16; i++) { ctx.fillStyle = `rgba(204,237,144,${.15 + .15 * Math.sin(clock + i)})`; ctx.beginPath(); ctx.arc((i * 113 + Math.sin(clock * .2 + i) * 18) % W, (i * 137 + clock * 8) % height, 1.1, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(0, -camera);
  const sprite = (id, x, y, size, flip = false, alpha = 1, sheet='sprites') => {
    const img = assets[sheet]; if (!ready(img)) return; const cw = img.naturalWidth / 3, ch = img.naturalHeight / 3;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, id % 3 * cw, Math.floor(id / 3) * ch, cw, ch, -size / 2, -size / 2, size, size); ctx.restore();
  };
  const bar = (x, y, width, ratio, color) => { ctx.fillStyle = '#07100ddd'; ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, 5); ctx.fillStyle = color; ctx.fillRect(x - width / 2, y, width * Math.max(0, ratio), 3); };
  if (g.state !== 'ready') for (const s of g.world.supplies()) {
    if (Math.abs(s.y - g.p.y) > height) continue;
    ctx.strokeStyle = '#aaf08288'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(s.x, s.y + 15, 35, 13, 0, 0, Math.PI * 2); ctx.stroke();
    sprite(6, s.x, s.y - 4 + Math.sin(clock * 2) * 3, 48,false,1,'loot');
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#c6e9b4'; ctx.fillText('补给箱 · 治疗 / 道具', s.x, s.y + 42);
  }
  if (g.bossGate !== null) {
    for (const y of [g.bossGate - 250, g.bossGate + 250]) { ctx.strokeStyle = '#e2966599'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const h of g.hazards) {
    if (!h.bossAttack) continue;
    const warning = h.age < h.warn;
    ctx.save(); ctx.fillStyle = warning ? '#ed725333' : h.poison ? '#51ce9960' : '#ff965a8a'; ctx.strokeStyle = warning ? '#ffb483' : h.color; ctx.lineWidth = warning ? 2 : 4;
    if (warning) ctx.setLineDash([7, 5]); hazardPath(ctx, h); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    if (warning) { ctx.fillStyle = '#ffdbb2'; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('!', h.shape === 'line' ? (h.x + h.tx) / 2 : h.x, h.shape === 'line' ? (h.y + h.ty) / 2 : h.y); }
    ctx.restore();
  }
  for (const d of g.drops) if (Math.abs(d.y - g.p.y) < height) {
    const y=d.y+Math.sin(clock*5+d.phase)*2,item=lootTypes[d.type];
    if(d.bossLoot){ctx.strokeStyle=d.type==='life'?'#ff99c9aa':'#ffda7955';ctx.lineWidth=d.type==='coin'?2:4;ctx.beginPath();ctx.moveTo(d.x,y);ctx.lineTo(d.x,y-25-Math.sin(clock*3+d.phase)*8);ctx.stroke();}
    if(d.type==='coin')sprite(6,d.x,y,18);
    else if(d.type==='life'){
      ctx.save();ctx.translate(d.x,y);ctx.shadowBlur=18;ctx.shadowColor='#ff76b0';ctx.fillStyle='#ff85b3';ctx.strokeStyle='#ffe4ee';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,13);ctx.bezierCurveTo(-24,-2,-13,-20,0,-9);ctx.bezierCurveTo(13,-20,24,-2,0,13);ctx.fill();ctx.stroke();ctx.restore();
      ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffbfdb';ctx.fillText('生命 +1',d.x,y+28);
    }
    else {sprite(item.art,d.x,y,d.type==='xp'?15:33,false,1,'loot');if(d.type!=='xp'){ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillStyle=item.color;ctx.fillText(item.name,d.x,y+25);}}
  }
  const units = [...g.enemies.map(e => ({ ...e, isPlayer: false })), { ...g.p, isPlayer: true, size: 62 }].sort((a, b) => a.y - b.y);
  for (const e of units) {
    if (e.y - camera < -100 || e.y - camera > height + 100) continue;
    ctx.fillStyle = '#030a0860'; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size * .32, e.size * .3, e.size * .13, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(clock * (e.type === 1 ? 12 : 7) + (e.phase ?? 0)) * 2;
    if(e.elite || (e.eventId!==undefined && g.regionEvent?.id===e.eventId)){
      ctx.strokeStyle=e.elite?'#ffd174':'#88e9e2';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+e.size*.3,e.size*.42,e.size*.18,0,0,Math.PI*2);ctx.stroke();
      if(e.elite){ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffe4a3';ctx.fillText(e.affix+' · '+e.name,e.x,e.y-e.size*.65);}
    }
    if (e.isBoss) drawAtlas(ctx, assets.expedition, e.art, e.x, e.y + bob, e.size, e.x > g.p.x);
    else sprite(e.isPlayer ? g.hero : e.art??e.sprite, e.x, e.y + bob, e.size, e.isPlayer ? e.face < 0 : e.x > g.p.x, e.isPlayer && g.p.invuln > 0 && Math.floor(clock * 18) % 2 ? .45 : e.behavior==='wraith'?.8:1,e.art===undefined?'sprites':'monsters');
    if (e.flash) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .4; if (e.isBoss) drawAtlas(ctx, assets.expedition, e.art, e.x, e.y + bob, e.size); else sprite(e.art??e.sprite, e.x, e.y + bob, e.size, false, .4,e.art===undefined?'sprites':'monsters'); ctx.restore(); }
    bar(e.x, e.y - e.size * .49, e.isPlayer ? 40 : e.type === 3 ? 66 : 26, e.hp / e.maxHp, e.isPlayer ? '#b3f363' : e.type === 3 ? '#c497fc' : '#ef7768');
    if (e.isPlayer && g.evolved.has('gatling')) drawAtlas(ctx, assets.expedition, 3, e.x + e.face * 16, e.y + 7, 39, e.face < 0);
    if((e.isBoss&&e.shieldTime>0)||(e.isPlayer&&g.buffs.shield>0&&g.shieldCharges>0)){ctx.strokeStyle='#9deaffb0';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(e.x,e.y,e.size*.55,e.size*.6,0,0,Math.PI*2);ctx.stroke();}
  }
  for (const b of g.bullets) { ctx.strokeStyle = b.crit ? '#fff4bf' : b.color; ctx.lineWidth = b.shotgun ? 4 : b.crit ? 4 : 2.6; ctx.shadowColor = b.color; ctx.shadowBlur = 9; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .017, b.y - b.vy * .017); ctx.stroke(); } ctx.shadowBlur = 0;
  // Hostile shots share a warm, pointed silhouette in every biome.
  for (const b of g.enemyShots) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.strokeStyle = '#ff563e88'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-19, 0); ctx.stroke();
    ctx.fillStyle = '#ff533c'; ctx.strokeStyle = '#ffe0a8'; ctx.lineWidth = 1.5; ctx.shadowBlur = 8; ctx.shadowColor = '#ff3d27';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  const storm = g.evolved.has('storm'), orbitRadius = storm ? 99 : 77;
  if (g.orbits) {
    ctx.strokeStyle = '#63eaff38'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.p.x, g.p.y, orbitRadius, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < g.orbits; i++) {
    const a = g.time * (storm ? 4 : 2.8) + i * Math.PI * 2 / g.orbits;
    const x = g.p.x + Math.cos(a) * orbitRadius, y = g.p.y + Math.sin(a) * orbitRadius;
    ctx.strokeStyle = '#66eaff99'; ctx.lineWidth = storm ? 3 : 2; ctx.beginPath(); ctx.arc(g.p.x, g.p.y, orbitRadius, a - .6, a); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.shadowBlur = 12; ctx.shadowColor = '#54dfff';
    ctx.fillStyle = '#133c58'; ctx.strokeStyle = '#8af3ff'; ctx.lineWidth = 2; ctx.beginPath();
    const radius = storm ? 13 : 10;
    for (let j = 0; j < 6; j++) { const angle = j * Math.PI / 3; if (j) ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else ctx.moveTo(radius, 0); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e0fdff'; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
  } ctx.shadowBlur = 0;
  for (const arc of g.arcs) { ctx.strokeStyle = '#a3faff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(arc.x, arc.y); ctx.lineTo((arc.x + arc.tx) / 2 + 8, (arc.y + arc.ty) / 2 - 8); ctx.lineTo(arc.tx, arc.ty); ctx.stroke(); }
  for (const p of g.particles) { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); } ctx.globalAlpha = 1;
  for (const r of g.rings) { ctx.globalAlpha = Math.min(1, r.life); ctx.strokeStyle = r.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1;
  if(g.novaFx){
    const {x,y,age,bomb}=g.novaFx,t=age/.8,r=(g.novaFx.radius??245)*(1-Math.pow(1-t,3)),fade=1-t;
    ctx.save();ctx.globalCompositeOperation='screen';
    const glow=ctx.createRadialGradient(x,y,0,x,y,Math.max(1,r));
    glow.addColorStop(0,`rgba(255,245,200,${Math.max(0,1-age*6)*.8})`);glow.addColorStop(.7,bomb?'#ff9d382d':'#b8ff5810');glow.addColorStop(1,'#b8ff5800');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    for(let i=0;i<3;i++){ctx.globalAlpha=fade*(1-i*.22);ctx.strokeStyle=i?(bomb?'#ffb45c':'#bfff78'):'#faffdf';ctx.lineWidth=(i?5:12)*fade+1;ctx.shadowBlur=bomb?35:20;ctx.shadowColor=bomb?'#ff922c':'#c5ff83';ctx.beginPath();ctx.arc(x,y,r*(1-i*.16),0,Math.PI*2);ctx.stroke();}
    ctx.shadowBlur=0;ctx.globalAlpha=fade*.75;ctx.strokeStyle='#e6ff9c';ctx.lineWidth=2;
    for(let i=0;i<24;i++){const a=i*Math.PI/12;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.83,y+Math.sin(a)*r*.83);ctx.lineTo(x+Math.cos(a)*(r+25*fade),y+Math.sin(a)*(r+25*fade));ctx.stroke();}
    ctx.restore();
  }
  ctx.textAlign = 'center';
  for (const t of g.texts) { ctx.globalAlpha = Math.min(1, t.life * 3); ctx.font = `800 ${t.big ? 19 : 13}px sans-serif`; ctx.strokeStyle = '#13221a'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); } ctx.globalAlpha = 1;
  ctx.restore();
}
