import { Game } from './game.js';
import { captureRun, restoreRun, writeProgress } from './run-save.js';
import { BOOST_LIMIT, LIFE_LIMIT, supplyTickets } from './economy.js';

export function purchasePrice(game, kind) {
  if(kind==='bomb')return 1;
  if(kind==='boost')return 2;
  if(kind==='life')return 3;
  throw new Error('未知补给');
}

export function canPurchase(game, tickets, kind) {
  const price=purchasePrice(game,kind);
  if(!Number.isSafeInteger(tickets)||tickets<price)return false;
  if(kind==='bomb')return game.state==='playing'&&game.reviveTimer<=0&&game.bombCooldown<=0&&game.p.hp>0;
  if(kind==='boost')return game.state==='upgrade'&&game.upgradeIntro<=0&&!!game.upgradeSelection&&game.boostsBought<BOOST_LIMIT;
  return game.state==='dead'&&game.lives===0&&game.livesBought<LIFE_LIMIT;
}

// Stage all effects; persist wallet + expedition together before touching the live game.
// A full disk or another tab's newer save must never grant an unpaid effect or lose coins.
export function purchaseCombatSupply(storage, profile, game, kind) {
  const tickets=supplyTickets(profile);
  if(!canPurchase(game,tickets,kind))return null;
  const events=[],staged=restoreRun(new Game(),JSON.parse(JSON.stringify(captureRun(game))));
  staged.state=game.state;staged.autoAdvance=game.autoAdvance;
  for(const key of ['particles','texts','rings','arcs','upgradeIntro','reviveTimer','novaFx','impactStop'])staged[key]=structuredClone(game[key]);
  staged.onEvent=(...args)=>events.push(args);
  const price=purchasePrice(game,kind);
  if(kind==='bomb'){staged.bombsBought++;staged.detonateBomb();}
  if(kind==='boost'){
    staged.boostsBought++;staged.finishUpgrade();
    staged.burst(staged.p.x,staged.p.y,'#ffbf70',40);
    staged.onEvent('purchase',`火力全开！本局额外伤害 +${staged.damageBonus}%`);
  }
  if(kind==='life'){
    staged.livesBought++;staged.lives=1;staged.state='playing';staged.reviveInPlace(true);
  }
  const saved=writeProgress(storage,{...profile,tickets:tickets-price},staged);
  const onEvent=game.onEvent;
  Object.assign(game,staged,{onEvent});
  return {saved,events};
}
