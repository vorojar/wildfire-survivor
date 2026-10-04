export const START_TICKETS=3;
export const BOMB_COOLDOWN=20;
export const BOOST_LIMIT=3;
export const LIFE_LIMIT=2;

export function supplyTickets(profile){
  if(profile.tickets===undefined)return START_TICKETS; // One-time migration for old profiles.
  if(!Number.isSafeInteger(profile.tickets)||profile.tickets<0)throw new Error('补给券余额无效');
  return profile.tickets;
}
