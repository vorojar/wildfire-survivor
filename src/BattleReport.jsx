import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { timeText } from './game.js';

export const gameUrl='https://wildfire.bibidu.com/';

async function drawReport(game) {
  const heroes=new Image();heroes.src=`${import.meta.env.BASE_URL}assets/sprites.png`;
  await heroes.decode();
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1120;
  const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,900,1120);
  gradient.addColorStop(0,'#1d3829');gradient.addColorStop(1,'#080f0d');c.fillStyle=gradient;c.fillRect(0,0,900,1120);
  c.strokeStyle='#a3df6630';c.lineWidth=1;
  for(let x=-900;x<900;x+=65){c.beginPath();c.moveTo(x,0);c.lineTo(x+900,1120);c.stroke();}
  const text=(value,x,y,size,color='#eaf5dc',weight=700)=>{c.fillStyle=color;c.font=`${weight} ${size}px "Microsoft YaHei", sans-serif`;c.fillText(value,x,y);};
  c.fillStyle='#b5ee78';c.fillRect(60,65,9,50);text('荒野枪魂',90,104,40);text('W I L D F I R E  /  战 场 纪 录',62,153,18,'#a2b997',400);
  text(game.kills>=100?'这一波，杀疯了！':'枪声不停，远征不止。',60,275,53);
  const kills=String(game.kills);text(kills,55,454,Math.min(138,660/kills.length),'#c4f589');text('只 怪物被你击溃',62,510,27,'#bdc8b1',400);
  const halo=c.createRadialGradient(690,430,20,690,430,200);halo.addColorStop(0,'#a8e76f30');halo.addColorStop(1,'#a8e76f00');c.fillStyle=halo;c.fillRect(480,240,380,370);
  const cellWidth=heroes.naturalWidth/3,cellHeight=heroes.naturalHeight/3;
  c.drawImage(heroes,game.hero*cellWidth,0,cellWidth,cellHeight,525,260,310,310);
  text(game.hero===1?'莱恩 · 重装':'凛 · 游侠',635,601,22,'#c3d5b5');
  c.fillStyle='#b5ee7825';c.fillRect(60,628,780,2);
  const stats=[['生存时间',timeText(game.time)],['推进距离',`${Math.floor(game.distance)} m`],['击败首领',`${game.bossKills} 位`],['额外火力',`+${game.damageBonus}%`]];
  stats.forEach(([label,value],i)=>{const x=60+i%2*410,y=677+Math.floor(i/2)*105;text(label,x,y,22,'#93a98b',400);text(value,x,y+43,36);});
  text(game.weaponName,60,887,34,'#ffce85');text(`Lv. ${game.level} · ${game.bombsBought} 次轰炸 · ${game.revives} 次归来`,60,932,23,'#a3b59b',400);
  c.fillStyle='#b5ee78';c.fillRect(60,995,780,2);text('你能走多远？',60,1055,26);text('wildfire.bibidu.com',466,1055,25,'#b5ee78');
  return canvas.toDataURL('image/jpeg',.85);
}

export function BattleReport({game,onClose}) {
  const [report,setReport]=useState(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setFailed(false);setReport(null);
    drawReport(game).then(image=>{
      if(!active)return;
      const raw=atob(image.split(',')[1]),file=new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],'荒野枪魂-战报.jpg',{type:'image/jpeg'});
      setReport({image,file});
    }).catch(error=>{if(active){console.error('生成战报失败',error);setFailed(true);}});
    return()=>{active=false;};
  },[game,attempt]);
  useEffect(()=>{const close=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose]);
  async function share(){
    if(busy||!report)return;setBusy(true);const {file}=report;
    try{
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'荒野枪魂 · 这一波杀疯了',text:`我击溃了 ${game.kills} 只怪物，你能走多远？ ${gameUrl}`});
      else if(navigator.share)await navigator.share({title:'荒野枪魂',text:`我击溃了 ${game.kills} 只怪物，你能走多远？`,url:gameUrl});
      else {setStatus('长按战报或保存图片，再发给朋友。');}
    }catch(error){if(error.name!=='AbortError')setStatus('当前浏览器未能打开分享，请长按或保存图片。');}
    finally{setBusy(false);}
  }
  return <div className="overlay report-overlay" role="dialog" aria-modal="true" aria-label="分享本局战报" onPointerDown={e=>e.stopPropagation()}><div className="report-modal"><div className="report-toolbar"><span>本局战报</span><button className="report-close" aria-label="关闭战报" onClick={onClose}><X size={21}/></button></div>{report?<img src={report.image} alt={`${game.hero===1?'莱恩 · 重装':'凛 · 游侠'}的荒野枪魂战报：${game.kills} 只 怪物被你击溃，生存 ${timeText(game.time)}，推进 ${Math.floor(game.distance)} 米`}/>:<div className="report-loading" role="status">{failed?<><span>角色图片加载失败</span><button className="secondary" onClick={()=>setAttempt(n=>n+1)}>重新生成战报</button></>:'正在生成你的战报…'}</div>}<p role="status">{status||'长按图片保存 · 把这一局发给朋友'}</p><div className="report-actions"><button className="primary" disabled={busy||!report} onClick={share}>分享战报</button>{report&&<a className="secondary" href={report.image} download="荒野枪魂-战报.jpg">保存图片</a>}</div><button className="secondary" onClick={onClose}>返回结算</button></div></div>;
}
