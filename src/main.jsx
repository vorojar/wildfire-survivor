import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Crosshair, Zap, GitFork, MoveUpRight, Heart, Magnet, Orbit, Radio, Flame, Swords, Package, VolumeX, Volume2, Play, Pause, BookOpen, Mouse, Clock3, RefreshCw, ChevronsUp, ChevronRight, Flag, RotateCcw, X, ArrowRight, Settings, Shield, Footprints, ChartNoAxesColumnIncreasing, Skull, Target } from 'lucide-react';
import { Game, Sound, drawGame, timeText, W, H } from './game';
import { ExpeditionHUD, EvolutionPanel, AdvanceButton, AudioPanel, RelicModal, JourneyStats, AtlasSprite } from './Expedition';
import { Music2 } from 'lucide-react';
import './style.css';
import './expedition.css';

const defaults = { bank: 0, best: 0, gear: [0,0,0,0], hero: 0, bestDistance: 0, audio: { music: .35, fx: .7 } };
const Icons = { Crosshair, Zap, GitFork, MoveUpRight, Heart, Magnet, Orbit, Radio, Flame, Swords, Package, VolumeX, Volume2, Play, Pause, BookOpen, Mouse, Clock3, RefreshCw, ChevronsUp, ChevronRight, Flag, RotateCcw, X, ArrowRight, Settings, Shield, Footprints, ChartNoAxesColumnIncreasing, Skull, Target };
function readSave(){try{const d=JSON.parse(localStorage.getItem('wildfire-save'));if(d&&Number.isFinite(d.bank)&&d.bank>=0&&Array.isArray(d.gear)&&d.gear.length===4&&d.gear.every(x=>Number.isInteger(x)&&x>=0&&x<=10))return {...defaults,...d,hero:d.hero===1?1:0,best:Number.isFinite(d.best)?d.best:0,bestDistance:Number.isFinite(d.bestDistance)?d.bestDistance:0,audio:{music:typeof d.audio?.music==='number'?Math.max(0,Math.min(1,d.audio.music)):.35,fx:typeof d.audio?.fx==='number'?Math.max(0,Math.min(1,d.audio.fx)):.7}};}catch{}return {...defaults,gear:[0,0,0,0]};}
const equipment=[{name:'突击步枪',desc:'每级增加 4 点基础伤害',icon:'Crosshair'},{name:'作战护甲',desc:'每级生命 +20，减伤 +4%',icon:'Shield'},{name:'疾风战靴',desc:'每级增加 10 点移动速度',icon:'Footprints'},{name:'磁力徽章',desc:'每级增加 15 点拾取范围',icon:'Magnet'}];
function Icon({name,size=20,...props}){const Component=Icons[name]||Icons.Crosshair;return <Component size={size} strokeWidth={1.7} {...props}/>;}
function Sprite({index=0,className=''}){return <span className={`sprite sprite-${index} ${className}`} style={{backgroundPosition:`${index%3*50}% ${Math.floor(index/3)*50}%`}}/>;}
function App(){
  const [save,setSave]=useState(readSave),saveRef=useRef(save),[game,setGame]=useState(null),gameRef=useRef(null),[,tick]=useState(0),[tab,setTab]=useState('battle'),[muted,setMuted]=useState(false),[toast,setToast]=useState(''),[storageError,setStorageError]=useState(false),[audioOpen,setAudioOpen]=useState(false);
  const canvas=useRef(null),sound=useRef(null),keys=useRef(new Set()),stick=useRef({x:0,y:0}),pointer=useRef(null),[joystick,setJoystick]=useState(null),toastTimer=useRef(null);
  function persist(next){saveRef.current=next;setSave(next);try{localStorage.setItem('wildfire-save',JSON.stringify(next));}catch{setStorageError(true);}}
  function notify(text){setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),2400);}
  function makeGame(hero=saveRef.current.hero){const g=new Game({hero,gear:saveRef.current.gear,onEvent:(type,value)=>{
    sound.current?.play(type);
    if(type==='coin')persist({...saveRef.current,bank:saveRef.current.bank+value});
    if(type==='pickup')notify(`拾取 ${value}`);
    if(type==='bossPhase')notify(value);
    if(type==='boss')notify(`首领来袭 · ${value}`);
    if(type==='biome')notify(`进入 ${value} · 继续向北探索`);
    if(type==='evolution')notify(`武器进化 · ${value}`);
    if(type==='supply')notify('补给获得 · 生命恢复，冲击波充能');
    if(type==='victory')notify(`${value} 已击破 · 获得稀有核心`);
    if(type==='combo')notify(`${value} 连击 · 火力全开！`);
    if(type==='dead'){persist({...saveRef.current,best:Math.max(saveRef.current.best,Math.floor(gameRef.current.time)),bestDistance:Math.max(saveRef.current.bestDistance,Math.floor(gameRef.current.distance))});}
    if(type==='level'||type==='dead'||type==='victory'){keys.current.clear();stick.current={x:0,y:0};setJoystick(null);pointer.current=null;}
  }});gameRef.current=g;setGame(g);return g;}
  useEffect(()=>{
    sound.current=new Sound();makeGame();
    const assets={};for(const name of ['sprites','arena','ruins','infected','expedition','monsters','loot']){assets[name]=new Image();assets[name].src=`${import.meta.env.BASE_URL}assets/${name}.png`;}
    sound.current.setVolumes(saveRef.current.audio.music,saveRef.current.audio.fx);
    let raf,last=performance.now(),ui=0;
    const loop=now=>{const dt=(now-last)/1000;last=now;const g=gameRef.current;if(g){const k=keys.current;g.update(dt,{x:(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0)+stick.current.x,y:(k.has('s')||k.has('arrowdown')?1:0)-(k.has('w')||k.has('arrowup')?1:0)+stick.current.y});sound.current.update(g);if(canvas.current)drawGame(canvas.current.getContext('2d'),g,assets,now/1000);if(now-ui>70){tick(n=>n+1);ui=now;}}raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);
    const down=e=>{if(e.target instanceof HTMLElement&&e.target.tagName==='INPUT')return;if(document.querySelector('.armory-overlay'))return;if(e.target instanceof HTMLElement&&['BUTTON','INPUT'].includes(e.target.tagName)&&e.code==='Space')return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();keys.current.add(key);if(e.repeat)return;if(e.code==='Space')gameRef.current?.nova();if(key==='escape'||key==='p'){gameRef.current?.pause();tick(n=>n+1);}};
    const up=e=>keys.current.delete(e.key.toLowerCase());
    const blur=()=>{keys.current.clear();stick.current={x:0,y:0};pointer.current=null;setJoystick(null);if(gameRef.current?.state==='playing'){gameRef.current.pause();sound.current?.update(gameRef.current);tick(n=>n+1);}};
    const visibility=()=>{if(document.hidden)blur();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelAnimationFrame(raf);clearTimeout(toastTimer.current);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);sound.current?.dispose();};
  },[]);
  useEffect(()=>{
    if(!game || !canvas.current)return;
    const surface=canvas.current, arena=surface.parentElement;
    const resize=()=>{
      const {width,height}=arena.getBoundingClientRect();
      if(!width || !height)return;
      const logicalHeight=Math.round(W*height/width);
      if(surface.height!==logicalHeight)surface.height=logicalHeight;
      game.resizeViewport(logicalHeight);
    };
    const observer=new ResizeObserver(resize);observer.observe(arena);resize();
    return()=>observer.disconnect();
  },[game]);
  function start(){sound.current.unlock();if(gameRef.current.state!=='ready')makeGame();gameRef.current.resizeViewport(canvas.current.height);gameRef.current.start();setTab('battle');setAudioOpen(false);tick(n=>n+1);}
  function changeHero(hero){if(game.state!=='ready')return;persist({...saveRef.current,hero});makeGame(hero);}
  function openTab(t){if(t==='armory'&&game.state==='playing')game.pause();setTab(t);}
  function buy(i){const price=80+save.gear[i]*60;if(save.gear[i]>=10)return;if(save.bank<price){notify('金币不足，去战场再收集一些吧');return;}const gear=[...save.gear];gear[i]++;persist({...saveRef.current,bank:saveRef.current.bank-price,gear});if(game.state==='ready')makeGame();notify('强化成功 · 新属性将在下一局生效');}
  function pointerDown(e){if(game.state!=='playing'||pointer.current)return;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};setJoystick({x:e.clientX-r.left,y:e.clientY-r.top,dx:0,dy:0});}
  function pointerMove(e){const p=pointer.current;if(!p||p.id!==e.pointerId)return;let dx=e.clientX-p.x,dy=e.clientY-p.y;const d=Math.hypot(dx,dy);if(d>45){dx=dx/d*45;dy=dy/d*45;}stick.current={x:dx/45,y:dy/45};setJoystick(j=>j?{...j,dx,dy}:null);}
  function pointerUp(){pointer.current=null;stick.current={x:0,y:0};setJoystick(null);}
  if(!game)return <div className="loading">正在进入荒野…</div>;
  const playing=game.state==='playing',ready=game.state==='ready';
  return <div className="app">
    <header className="header"><a className="brand" href={import.meta.env.BASE_URL} aria-label="荒野枪魂主页"><Icon name="Flame" size={35}/><span>荒野枪魂<small>W I L D F I R E</small></span></a><nav><button className={tab==='battle'?'active':''} onClick={()=>openTab('battle')}><Icon name="Swords"/>生存战场</button><button className={tab==='armory'?'active':''} onClick={()=>openTab('armory')}><Icon name="Package"/>军械库<span className="nav-count">{save.bank}</span></button></nav><div className="header-actions"><button title={muted?'开启声音':'静音全部'} aria-label={muted?'开启声音':'静音全部'} onClick={()=>{sound.current.unlock();sound.current.enabled=muted;setMuted(!muted);}}><Icon name={muted?'VolumeX':'Volume2'}/></button><button aria-label="音频设置" title="音乐与音效音量" onClick={()=>{sound.current.unlock();setAudioOpen(!audioOpen);}}><Music2 size={19}/></button><button title="暂停 / 继续 (P)" aria-label="暂停或继续" disabled={tab==='armory'||ready||game.state==='dead'||game.state==='upgrade'||game.state==='relic'} onClick={()=>{game.pause();tick(n=>n+1);}}><Icon name={game.state==='paused'?'Play':'Pause'}/></button><span className="header-motto">在废墟中，<br/>生命依然顽强。</span></div>{audioOpen&&<AudioPanel audio={save.audio} mode={game.musicMode} onClose={()=>setAudioOpen(false)} onChange={audio=>{sound.current.setVolumes(audio.music,audio.fx);persist({...saveRef.current,audio});}}/>}</header>
    <main className="layout">
      <aside className="left-column"><div className="intro"><h1>无尽荒野<span>///</span></h1><h2>击退兽潮，火力全开。</h2><div className="rule"/><p>被遗忘的世界，<br/>从不缺少窥视黑暗的眼睛。<br/>而你，是最后仍在战斗的人。</p></div><div className="hero-art"><span className="handwritten">Still firing.<br/>&nbsp; Still alive.</span><Sprite index={save.hero}/><div className="hero-switch" aria-label="选择角色"><button disabled={!ready} className={save.hero===0?'selected':''} onClick={()=>changeHero(0)}>凛 · 游侠</button><button disabled={!ready} className={save.hero===1?'selected':''} onClick={()=>changeHero(1)}>莱恩 · 重装</button></div></div><section className="guide panel"><h3><Icon name="BookOpen"/>战斗指南</h3><div><span className="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>移动 / 方向键</span></div><div><Icon name="Mouse"/><span>自动瞄准 · 持续射击</span></div><div><kbd className="space">Space</kbd><span>冲击波 · 击退敌人</span></div><p>向北探索 · 拾取补给 · 击败首领</p></section><p className="footnote">在荒野之上，枪声就是答案。</p></aside>
      <section className="arena-shell" aria-label="生存战场">
        <div className="arena" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
          <canvas ref={canvas} width={W} height={H} aria-label="竖屏射击游戏战场"/>
          <div className="hud"><div className="health"><span>HP</span><div className="health-track"><i style={{width:`${game.p.hp/game.p.maxHp*100}%`}}/></div><b>{Math.ceil(game.p.hp)}<small> / {game.p.maxHp}</small></b></div><div className="hud-coin"><Sprite index={6}/><b>{game.coins}</b></div><div><Icon name="Clock3" size={14}/><b>{timeText(game.time)}</b></div><div className="hud-level">Lv. {game.level}</div></div>
          <div className="xp-track" title={`经验晶体 ${Math.floor(game.xp)} / ${game.nextXp}`}><i style={{width:`${game.xp/game.nextXp*100}%`}}/></div>
          <ExpeditionHUD game={game}/><div className="buff-hud">{game.buffs.haste>0&&<span>狂热弹药 {Math.ceil(game.buffs.haste)}s</span>}{game.buffs.magnet>0&&<span>超级磁铁 {Math.ceil(game.buffs.magnet)}s</span>}{game.buffs.shield>0&&game.shieldCharges>0&&<span>护盾 ×{game.shieldCharges}</span>}</div>
          {game.combo>=5&&playing&&<div className="combo"><b>{game.combo}</b> COMBO</div>}
          {toast&&<div className="toast" role="status">{toast}</div>}
          {joystick&&<div className="joystick" style={{left:joystick.x,top:joystick.y}}><span style={{transform:`translate(${joystick.dx}px,${joystick.dy}px)`}}/></div>}
          {ready&&<div className="start-panel" onPointerDown={e=>e.stopPropagation()}><div className="weapon-slots"><div className="slot selected"><span>01</span><Sprite index={7}/><b>突击步枪</b><i>▰▰▰</i></div><div className="slot"><span>02</span><Icon name="Orbit" size={34}/><b>电磁护卫</b><small>升级解锁</small></div><div className="slot"><span>03</span><Icon name="Radio" size={34}/><b>冲击波</b><i>▰▰▰</i></div></div><button className="start-button" onClick={start}>开始生存<Icon name="Play" size={23} fill="currentColor"/></button><p>晶体升级 · 金币强化 · 向北探索</p><div className="mobile-heroes"><button onClick={()=>changeHero(1-save.hero)}><Icon name="RefreshCw" size={14}/> {save.hero?'莱恩 · 重装':'凛 · 游侠'} · 切换角色</button></div></div>}
          {playing&&<div className="combat-bottom" onPointerDown={e=>e.stopPropagation()}><div className="active-weapon">{game.evolved.has('gatling')?<AtlasSprite index={3}/>:<Sprite index={7}/>}<span>{game.weaponName}<b>Lv. {1+(game.levels.power||0)+(game.levels.speed||0)}</b></span></div><AdvanceButton game={game} refresh={()=>tick(n=>n+1)}/><button className={`nova-button ${game.novaCooldown>0?'cooldown':''}`} aria-label="释放冲击波" onClick={()=>game.nova()} disabled={game.novaCooldown>0}><Icon name="Radio" size={30}/><span>{game.novaCooldown>0?`${game.novaCooldown.toFixed(1)}s`:'冲击波'}</span><small>SPACE</small></button></div>}
          {game.state==='paused'&&tab==='battle'&&<div className="overlay" onPointerDown={e=>e.stopPropagation()}><div className="modal"><Icon name="Pause" size={35}/><h2>休整片刻</h2><p>荒野会等你，战斗还未结束。</p><JourneyStats game={game}/><button className="primary" onClick={()=>{game.pause();tick(n=>n+1);}}>继续战斗 <Icon name="Play" size={17}/></button></div></div>}
          {game.state==='upgrade'&&<div className="overlay" onPointerDown={e=>e.stopPropagation()}><div className="upgrade-modal"><span className="level-burst"><Icon name="ChevronsUp" size={34}/></span><h2>火力进化</h2><p>等级 {game.level} · 选择一项战斗强化</p><div className="upgrade-options">{game.choices.map(u=><button key={u.id} onClick={()=>{game.choose(u.id);tick(n=>n+1);}}><span className="upgrade-icon"><Icon name={u.icon} size={28}/></span><span><small>{u.tag}</small><b>{u.name}</b><em>{u.desc}</em></span><Icon name="ChevronRight" size={18}/></button>)}</div><EvolutionPanel game={game} compact/><small className="muted">战斗已暂停，选好再出发。</small></div></div>}
          {game.state==='relic'&&<RelicModal game={game} refresh={()=>tick(n=>n+1)}/> }
          {game.state==='dead'&&<div className="overlay" onPointerDown={e=>e.stopPropagation()}><div className="modal end-modal"><Icon name="Flag" size={35}/><h2>战至最后一刻</h2><p>每一次归来，都比上次更强。</p><JourneyStats game={game}/><div className="end-stats"><div><b>{timeText(game.time)}</b><span>生存时间</span></div><div><b>{game.kills}</b><span>击杀数量</span></div><div><b>{game.coins}</b><span>入库金币</span></div></div><button className="primary" onClick={start}>再次出击 <Icon name="RotateCcw" size={18}/></button><button className="secondary" onClick={()=>{makeGame();setTab('armory');}}>军械强化</button></div></div>}
          {tab==='armory'&&<div className="overlay armory-overlay" onPointerDown={e=>e.stopPropagation()}><div className="armory-modal"><button className="close" aria-label="关闭军械库" onClick={()=>setTab('battle')}><Icon name="X"/></button><Icon name="Package" size={32}/><h2>军械库</h2><p>永久强化装备，每一局都更进一步。</p><div className="bank"><Sprite index={6}/><b>{save.bank}</b><span>可用金币</span></div><div className="armory-list">{equipment.map((eq,i)=><div key={eq.name}><Icon name={eq.icon} size={25}/><span><b>{eq.name} <small>Lv. {save.gear[i]+1}</small></b><p>{eq.desc}</p></span><button disabled={save.gear[i]>=10||save.bank<80+save.gear[i]*60} onClick={()=>buy(i)}>{save.gear[i]>=10?'已满级':`${80+save.gear[i]*60} ◈`}<small>{save.gear[i]>=10?'MAX':'强化'}</small></button></div>)}</div><p className="muted">强化在下一局生效 · 金币自动保存</p><button className="primary" onClick={()=>setTab('battle')}>返回战场 <Icon name="ArrowRight" size={18}/></button></div></div>}
        </div>
        <div className="arena-footer"><span>✦</span>荒野未尽 · 枪魂不灭<span>✦</span></div>
      </section>
      <aside className="right-column"><section className="loadout panel"><h3><Icon name="Settings"/>装备配置<small>LOADOUT</small></h3>{equipment.map((eq,i)=><button className="equipment" key={eq.name} onClick={()=>openTab('armory')}><span className="equipment-art">{i===0?<Sprite index={7}/>:<Icon name={eq.icon} size={35}/>}</span><span className="equipment-info"><small>Lv. {save.gear[i]+1}</small><b>{eq.name}</b><em>{['稳定可靠，适合持久战。','减少伤害，抵御兽潮。','灵巧走位，游刃有余。','吸附金币与经验晶体。'][i]}</em></span><span className="pips"><i/><i className={save.gear[i]>0?'lit':''}/><i className={save.gear[i]>2?'lit':''}/></span></button>)}</section><EvolutionPanel game={game}/><section className="stats panel"><h3><Icon name="ChartNoAxesColumnIncreasing"/>本局战绩</h3><JourneyStats game={game}/><div><Icon name="Skull"/><span>击杀数量</span><b>{game.kills}</b></div><div><Sprite index={6}/><span>获取金币</span><b>{game.coins}</b></div><div><Icon name="Clock3"/><span>生存时间</span><b>{timeText(game.time)}</b></div><div><Icon name="Target"/><span>当前等级</span><b>Lv. {game.level}</b></div></section><div className="quote"><p>每一场战斗，<br/>都让荒野多一分光亮。</p><span>个人最长生存 · {timeText(save.best)}</span><div>Guns keep<br/>hope alive.</div></div></aside>
    </main>{storageError&&<div className="storage-warning">浏览器存储不可用，本次进度仅保留在当前页面。</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
