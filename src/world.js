export const W = 480, H = 760, ORIGIN_Y = H * .52, UNITS_PER_METER = 12;
export const BIOME_LENGTH = H * 6 / UNITS_PER_METER;
export const biomes = [
  { name: '迷雾森林', asset: 'arena', color: '#b4ee6c', subtitle: '沿古道向北，寻找荒野的尽头。' },
  { name: '失落王城', asset: 'ruins', color: '#a9d7f5', subtitle: '石墙早已倒塌，守卫仍未离去。' },
  { name: '孢子禁区', asset: 'infected', color: '#dc9fee', subtitle: '小心脚下，孢子正在呼吸。' },
];
export const distanceAt = y => Math.max(0, (ORIGIN_Y - y) / UNITS_PER_METER);
export const zoneAt = y => Math.floor(distanceAt(y) / BIOME_LENGTH);
export const biomeAt = y => biomes[zoneAt(y) % biomes.length];
// A 100 m transition straddles each biome boundary instead of switching a tile's color.
export function biomeBlendAt(y) {
  const distance = (ORIGIN_Y - y) / UNITS_PER_METER;
  const boundary = Math.max(1, Math.round(distance / BIOME_LENGTH));
  const amount = Math.max(0, Math.min(1, (distance - boundary * BIOME_LENGTH + 50) / 100));
  if (Math.abs(distance - boundary * BIOME_LENGTH) <= 50) return { from: biomes[(boundary - 1) % 3], to: biomes[boundary % 3], amount: amount * amount * (3 - 2 * amount) };
  const biome = biomes[Math.floor(Math.max(0, distance) / BIOME_LENGTH) % 3];
  return { from: biome, to: biome, amount: 0 };
}
export const atlasRects = [
  [0, 0, 542, 590], [545, 0, 450, 590], [996, 0, 540, 590],
  [0, 620, 532, 370], [535, 620, 540, 365], [1080, 592, 456, 432],
];

// A small sliding window is regenerated deterministically as the camera travels.
export class World {
  constructor() { this.chunks = new Map(); this.used = new Set(); this.furthest = 0; }
  update(y) {
    const center = Math.floor((ORIGIN_Y - y) / H);
    this.furthest = Math.max(this.furthest, center);
    for (const id of this.chunks.keys()) if (Math.abs(id - center) > 2) this.chunks.delete(id);
    for (let id = center - 2; id <= center + 2; id++) {
      if (this.chunks.has(id)) continue;
      const top = ORIGIN_Y - (id + 1) * H;
      this.chunks.set(id, {
        id, top, biome: biomes[Math.floor(Math.max(0, id) / 6) % 3],
        supply: id >= 0 && id % 3 === 1 ? { id, x: id % 2 ? 125 : 355, y: top + H / 2 } : null,
      });
    }
    for (const id of this.used) if (id < this.furthest - 200) this.used.delete(id);
  }
  isUsed(id) { return this.used.has(id) || id < this.furthest - 200; }
  supplies() { return [...this.chunks.values()].map(c => c.supply).filter(s => s && !this.isUsed(s.id)); }
  collect(id) { if (this.isUsed(id)) return false; this.used.add(id); return true; }
}
