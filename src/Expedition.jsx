import React from 'react';
import { ArrowUp, Compass, Crown, Music2, Sparkles, X, Shield, Crosshair, Orbit, ChevronRight, Heart } from 'lucide-react';
import { atlasRects, BIOME_LENGTH, distanceAt } from './world.js';
import { musicModes } from './audio.js';

export function AtlasSprite({ index, className = '' }) {
  const [x, y, w, h] = atlasRects[index];
  return <svg className={`atlas-sprite ${className}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><image href={`${import.meta.env.BASE_URL}assets/expedition.png`} x={-x} y={-y} width="1536" height="1024"/></svg>;
}
export function ExpeditionHUD({ game }) {
  const boss = game.boss;
  return <>
    <div className="journey-hud"><span style={{ color: game.biome.color }}><Compass size={13}/>{game.biome.name}</span><b>{Math.floor(distanceAt(game.p.y))} m <small>↑ 北</small></b><span>威胁 ×{(game.difficulty*game.threatGrowth).toFixed(1)}</span></div>
    {boss ? <div className="boss-hud" role="status"><div><Crown size={14}/><b>{boss.name}</b><span>{boss.shieldTime>0?`护盾 ${boss.shieldTime.toFixed(1)}s`:boss.intent}</span><small>{Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}</small></div><div className="boss-health"><i style={{ width: `${Math.max(0,boss.hp / boss.maxHp) * 100}%`, background: boss.shieldTime>0?'#9ae6f4':boss.color }}/></div><p>第 {boss.phaseLevel+1} 阶段 · {boss.shieldTime>0?'护盾重组，躲避反击':'前路封锁，避开预警'}</p></div> : <div className="journey-next">{game.state === 'ready' ? '向北探索 · 三大区域 · 无尽远征' : `下次首领：${Math.max(0,Math.ceil(game.nextBossDistance-game.distance))} m / ${Math.max(0,Math.ceil(game.nextBossTime-game.time))} s`}</div>}
  </>;
}
export function EvolutionPanel({ game, compact = false }) {
  return <section className={`evolution-panel ${compact ? 'compact' : 'panel'}`} aria-label="武器进化路线">
    <h3><Sparkles size={18}/>武器进化<small>组合达成后自动进化</small></h3>
    {game.evolutions.map(e => <div className={`evolution-route ${game.evolved.has(e.id) ? 'evolved' : ''}`} key={e.id}>
      {!compact && <AtlasSprite index={e.art}/>}
      <span className="route-content"><b>{e.from} <ChevronRight size={12}/>{e.name}</b>
        <span className="route-requirements">{e.requirements.map(r => <small className={r.current === r.needed ? 'met' : ''} key={r.id}>{r.name} <strong>{r.current}/{r.needed}{r.current === r.needed ? ' ✓' : ''}</strong></small>)}</span>
        {!compact && <small className="route-effect">{e.effect}</small>}
      </span><em>{game.evolved.has(e.id) ? '已进化 ✓' : `还差 ${e.remaining} 次`}</em>
    </div>)}
  </section>;
}
export function UpgradeEvolutionHint({ game, id }) {
  const hint = game.evolutionHint(id);
  return hint && <span className={`upgrade-evolution-hint ${hint.complete ? 'will-evolve' : ''}`}><Sparkles size={12}/>{hint.text}</span>;
}
export function EvolutionModal({ game, onClose }) {
  return <div className="overlay evolution-overlay" role="dialog" aria-modal="true" aria-label="查看武器进化" onPointerDown={e => e.stopPropagation()} onKeyDown={e => { if(e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="evolution-modal"><Sparkles size={28}/><h2>让火力进化</h2><p>升级时选择下方强化，凑齐后立即自动进化。<br/>每条路线可同时培养，进度仅计算本局选择。</p>
      <EvolutionPanel game={game}/><p className="evolution-note">主武器进化后替换步枪；副武器与步枪同时攻击。<br/>军械库的永久强化不计入进化条件。</p>
      <button className="primary" autoFocus onClick={onClose}>{game.state === 'ready' ? '知道了，准备出发' : '返回战场'}</button>
    </div>
  </div>;
}
export function AdvanceButton({ game, refresh }) {
  return <button className={`advance-button ${game.autoAdvance ? 'advancing' : ''}`} disabled={!!game.boss} aria-label={game.autoAdvance ? '停止自动前进' : '自动向北前进'} onClick={() => { game.autoAdvance = !game.autoAdvance; refresh(); }}><ArrowUp size={20}/><span>{game.boss ? '首领封锁' : game.autoAdvance ? '停止前进' : '向北前进'}</span></button>;
}
export function AudioPanel({ audio, mode, status, onRetry, onPreview, onChange, onClose }) {
  return <section className="audio-panel" aria-label="音频设置"><header><b><Music2 size={17}/>荒野电台</b><button onClick={onClose} aria-label="关闭音频设置"><X size={17}/></button></header><p>重金属 · {musicModes[mode].label} · {musicModes[mode].bpm} BPM</p>
    {status==='loading'&&<p role="status">正在装载战斗音轨…</p>}
    {status==='error'&&<p role="status">部分声音加载失败 <button onClick={onRetry}>重新加载</button></p>}
    <label><span>背景音乐 <b>{Math.round(audio.music * 100)}%</b></span><input aria-label="背景音乐音量" type="range" min="0" max="100" value={Math.round(audio.music * 100)} onChange={e => onChange({ ...audio, music: +e.target.value / 100 })}/></label>
    <label><span>战斗音效 <b>{Math.round(audio.fx * 100)}%</b></span><input aria-label="战斗音效音量" type="range" min="0" max="100" value={Math.round(audio.fx * 100)} onChange={e => onChange({ ...audio, fx: +e.target.value / 100 })}/></label>
    <div className="sound-preview" aria-label="枪声试听">{[['shoot','步枪'],['shotgun','霰弹'],['gatling','机枪']].map(([type,label])=><button key={type} aria-label={`试听${label}`} onClick={()=>onPreview(type)}>{label} ▶</button>)}</div><small>实录枪声 · 探索 / 兽潮 / 首领动态混音</small>
  </section>;
}
export function RelicModal({ game, refresh }) {
  const icons = { Crosshair, Shield, Orbit, Heart };
  return <div className="overlay relic-overlay" onPointerDown={e => e.stopPropagation()}><div className="upgrade-modal"><span className="level-burst"><AtlasSprite index={game.lastBoss.art}/></span><h2>{game.lastBoss.name}的遗藏</h2><p>金币雨 +{game.lastBoss.gold} · 补给与经验已回收{game.lastBoss.life?' · 获得复苏之心':''}<br/>第 {game.bossKills} 次首领战 · 选择一件本局遗物</p><div className="upgrade-options">{game.choices.map(r => { const Icon = icons[r.icon]; return <button key={r.id} onClick={() => { game.chooseRelic(r.id); refresh(); }}><span className="upgrade-icon"><Icon size={27}/></span><span><small>{r.tag}</small><b>{r.name}</b><em>{r.desc}</em></span><ChevronRight size={18}/></button>; })}</div><small className="muted">本次奖励已保存 · 封锁解除，继续远征</small></div></div>;
}
export function JourneyStats({ game }) {
  const remaining = BIOME_LENGTH - distanceAt(game.p.y) % BIOME_LENGTH;
  return <div className="journey-stats"><span><Compass size={14}/>最远 {Math.floor(game.distance)} m</span><span><Crown size={14}/>首领 {game.bossKills}</span><small>距下一区域 {Math.ceil(remaining)} m</small></div>;
}
