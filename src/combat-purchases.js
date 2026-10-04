import { Game } from './game.js';
import { captureRun, restoreRun, writeProgress } from './run-save.js';

export function purchasePrice(game, kind) {
  if(kind==='bomb')return 30+game.bombsBought*20;
  if(kind==='boost')return 60+game.boostsBought*40;
  if(kind==='life')return 100+game.livesBought*100;
  throw new Error('未知补给');
}

export function canPurchase(game, bank, kind) {
  const price=purchasePrice(game,kind);
  if(!Number.isFinite(bank)||bank<price)return false;
  if(kind==='bomb')return game.state==='playing'&&game.reviveTimer<=0&&game.bombCooldown<=0&&game.p.hp>0;
  if(kind==='boost')return game.state==='upgrade'&&game.upgradeIntro<=0&&!!game.upgradeSelection;
  return game.state==='dead'&&game.lives===0;
}

// Stage all effects; persist wallet + expedition together before touching the live game.
// A full disk or another tab's newer save must never grant an unpaid effect or lose coins.
export function purchaseCombatSupply(storage, profile, game, kind) {
  if(!canPurchase(game,profile.bank,kind))return null;
  const events=[],staged=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(game))));
  staged.state=game.state;staged.autoAdvance=game.autoAdvance;
  for(const key of ['particles','texts','rings','arcs','upgradeIntro','reviveTimer','novaFx','impactStop'])staged[key]=structuredClone(game[key]);
  staged.onEvent=(...args)=>events.push(args);
  const price=purchasePrice(game,kind);
  staged.coinsSpent+=price;
  if(kind==='bomb'){staged.bombsBought++;staged.detonateBomb();}
  if(kind==='boost'){
    staged.boostsBought++;staged.finishUpgrade();
    staged.burst(staged.p.x,staged.p.y,'#ffbf70',40);
    staged.onEvent('purchase',`火力全开！本局额外伤害 +${staged.damageBonus}%`);
  }
  if(kind==='life'){
    staged.livesBought++;staged.lives=1;staged.state='playing';staged.reviveInPlace(true);
  }
  const saved=writeProgress(storage,{...profile,bank:profile.bank-price},staged);
  const onEvent=game.onEvent;
  Object.assign(game,staged,{onEvent});
  return {saved,events};
}
