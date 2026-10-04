export const lootTypes = {
  xp: { art: 0, name: '经验晶体', color: '#83dafa' },
  heal: { art: 1, name: '医疗包', color: '#b0e89b' },
  magnet: { art: 2, name: '超级磁铁', color: '#f1b987' },
  bomb: { art: 3, name: '清场炸弹', color: '#ffd48d' },
  haste: { art: 4, name: '狂热弹药', color: '#ffc283' },
  shield: { art: 5, name: '能量护盾', color: '#8adfea' },
  chest: { art: 6, name: '荒野宝箱', color: '#f2d485' },
  life: { name: '复苏之心', color: '#ff8cb3' },
  ticket: { name: '补给券 +1', color: '#cdb5ff' },
};
export function rollLoot(roll = Math.random()) {
  if (roll < .045) return 'heal';
  if (roll < .07) return 'magnet';
  if (roll < .095) return 'bomb';
  if (roll < .12) return 'haste';
  if (roll < .145) return 'shield';
  if (roll < .155) return 'chest';
  return null;
}
