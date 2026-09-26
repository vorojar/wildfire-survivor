import React from 'react';
import { ArrowUp, Compass, Crown, Music2, Sparkles, X, Shield, Crosshair, Orbit, ChevronRight } from 'lucide-react';
import { atlasRects, BIOME_LENGTH, distanceAt } from './world.js';
import { musicModes } from './audio.js';

export function AtlasSprite({ index, className = '' }) {
  const [x, y, w, h] = atlasRects[index];
  return <svg className={`atlas-sprite ${className}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><image href={`${import.meta.env.BASE_URL}assets/expedition.png`} x={-x} y={-y} width="1536" height="1024"/></svg>;
}
export function ExpeditionHUD({ game }) {
  const boss = game.boss;
  return <>
    <div className="journey-hud"><span style={{ color: game.biome.color }}><Compass size={13}/>{game.biome.name}</span><b>{Math.floor(distanceAt(game.p.y))} m <small>↑ 北</small></b><span>威胁 ×{game.difficulty.toFixed(1)}</span></div>
    {boss ? <div className="boss-hud" role="status"><div><Crown size={14}/><b>{boss.name}</b><span>{boss.shieldTime>0?`护盾 ${boss.shieldTime.toFixed(1)}s`:boss.intent}</span><small>{Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}</small></div><div className="boss-health"><i style={{ width: `${Math.max(0,boss.hp / boss.maxHp) * 100}%`, background: boss.shieldTime>0?'#9ae6f4':boss.color }}/></div><p>第 {boss.phaseLevel+1} 阶段 · {boss.shieldTime>0?'护盾重组，躲避反击':'前路封锁，避开预警'}</p></div> : <div className="journey-next">{game.state === 'ready' ? '向北探索 · 三大区域 · 无尽远征' : `下次首领：${Math.max(0,Math.ceil(game.nextBossDistance-game.distance))} m / ${Math.max(0,Math.ceil(game.nextBossTime-game.time))} s`}</div>}
  </>;
}
export function EvolutionPanel({ game, compact = false }) {
  return <section className={`evolution-panel ${compact ? 'compact' : 'panel'}`} aria-label="武器进化路线">
    <h3><Sparkles size={18}/>武器进化<small>组合达成后自动进化</small></h3>
    {game.evolutions.map(e => <div className={game.evolved.has(e.id) ? 'evolved' : ''} key={e.id}>
      {!compact && <AtlasSprite index={e.art}/>}
      <span><b>{e.name}</b><small>{e.rule}</small></span><em>{game.evolved.has(e.id) ? '已进化' : e.progress}</em>
    </div>)}
  </section>;
}
export function AdvanceButton({ game, refresh }) {
  return <button className={`advance-button ${game.autoAdvance ? 'advancing' : ''}`} disabled={!!game.boss} aria-label={game.autoAdvance ? '停止自动前进' : '自动向北前进'} onClick={() => { game.autoAdvance = !game.autoAdvance; refresh(); }}><ArrowUp size={20}/><span>{game.boss ? '首领封锁' : game.autoAdvance ? '停止前进' : '向北前进'}</span></button>;
}
export function AudioPanel({ audio, mode, onChange, onClose }) {
  return <section className="audio-panel" aria-label="音频设置"><header><b><Music2 size={17}/>荒野电台</b><button onClick={onClose} aria-label="关闭音频设置"><X size={17}/></button></header><p>当前编曲 · {musicModes[mode].label}</p>
    <label><span>背景音乐 <b>{Math.round(audio.music * 100)}%</b></span><input aria-label="背景音乐音量" type="range" min="0" max="100" value={Math.round(audio.music * 100)} onChange={e => onChange({ ...audio, music: +e.target.value / 100 })}/></label>
    <label><span>战斗音效 <b>{Math.round(audio.fx * 100)}%</b></span><input aria-label="战斗音效音量" type="range" min="0" max="100" value={Math.round(audio.fx * 100)} onChange={e => onChange({ ...audio, fx: +e.target.value / 100 })}/></label><small>探索 / 兽潮 / 首领 · 随战况自动切换</small>
  </section>;
}
export function RelicModal({ game, refresh }) {
  const icons = { hunter: Crosshair, guardian: Shield, reactor: Orbit };
  return <div className="overlay relic-overlay" onPointerDown={e => e.stopPropagation()}><div className="upgrade-modal"><span className="level-burst"><Crown size={32}/></span><h2>首领已击破</h2><p>获得一枚稀有核心，选择你的战利品。</p><div className="upgrade-options">{game.choices.map(r => { const Icon = icons[r.id]; return <button key={r.id} onClick={() => { game.chooseRelic(r.id); refresh(); }}><span className="upgrade-icon"><Icon size={27}/></span><span><small>{r.tag}</small><b>{r.name}</b><em>{r.desc}</em></span><ChevronRight size={18}/></button>; })}</div><small className="muted">封锁解除 · 继续向北，下一片荒野等待着你</small></div></div>;
}
export function JourneyStats({ game }) {
  const remaining = BIOME_LENGTH - distanceAt(game.p.y) % BIOME_LENGTH;
  return <div className="journey-stats"><span><Compass size={14}/>最远 {Math.floor(game.distance)} m</span><span><Crown size={14}/>首领 {game.bossKills}</span><small>距下一区域 {Math.ceil(remaining)} m</small></div>;
}
