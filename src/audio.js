const noteHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const musicModes = { explore: { bpm: 88, label: '荒野回声' }, combat: { bpm: 112, label: '兽潮进行曲' }, boss: { bpm: 140, label: '决战时刻' } };

// Original procedural score: minor-key arpeggios, sustained harmony, bass and drums.
// All voices have bounded lifetimes. No timers survive a paused/closed game.
export class Sound {
  constructor() { this.enabled = true; this.ctx = null; this.last = 0; this.musicVolume = .35; this.fxVolume = .7; this.nextBeat = 0; this.step = 0; this.active = false; this.mode = 'explore'; }
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicBus = this.ctx.createGain(); this.fxBus = this.ctx.createGain();
      this.musicBus.gain.value = 0; this.fxBus.gain.value = this.fxVolume;
      const limiter = this.ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
      this.musicBus.connect(limiter); this.fxBus.connect(limiter); limiter.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * .1, this.ctx.sampleRate);
      const samples = this.noise.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    this.ctx.resume();
  }
  setVolumes(music, fx) { this.musicVolume = Math.max(0, Math.min(1, music)); this.fxVolume = Math.max(0, Math.min(1, fx)); }
  tone(frequency, when, duration, volume, type = 'sine', bus = this.musicBus, endFrequency = null) {
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain(); oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when); if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), when + .012); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(gain); gain.connect(bus); oscillator.start(when); oscillator.stop(when + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  hat(when, volume) {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 5000;
    gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .07);
    source.connect(filter); filter.connect(gain); gain.connect(this.musicBus); source.start(when); source.stop(when + .08);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  scheduleBeat(when, mode) {
    const step = this.step++, bar = Math.floor(step / 16), beat = step % 16;
    const roots = [45, 41, 48, 43], root = roots[bar % 4], eighth = 30 / musicModes[mode].bpm;
    const pattern = [12, 19, 15, 22, 19, 15, 24, 19];
    this.tone(noteHz(root + pattern[step % 8]), when, eighth * 1.6, mode === 'explore' ? .08 : .055, 'triangle');
    if (beat % 4 === 0) this.tone(noteHz(root - 12), when, eighth * 3.5, .13, 'sine');
    if (beat === 0) for (const interval of [12, 15, 19]) this.tone(noteHz(root + interval), when, eighth * 14, .045, 'sine');
    if (mode !== 'explore') {
      if (beat % 4 === 0 || (mode === 'boss' && beat % 4 === 3)) this.tone(110, when, .18, .27, 'sine', this.musicBus, 38);
      this.hat(when, beat % 2 ? .05 : .035);
      if (beat % 4 === 2) { this.hat(when, .1); this.tone(180, when, .11, .04, 'triangle'); }
    }
    if (mode === 'boss' && beat % 2 === 0) this.tone(noteHz(root + 24 + [0, 3, 7, 10][(beat / 2) % 4]), when, .18, .035, 'sawtooth');
  }
  update(game) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, running = this.enabled && game.state === 'playing'; this.mode = game.musicMode;
    const volume = running ? this.musicVolume : 0;
    if (this.lastVolume !== volume) { this.musicBus.gain.setTargetAtTime(volume, now, .12); this.lastVolume = volume; }
    const fx = this.enabled ? this.fxVolume : 0;
    if (this.lastFx !== fx) { this.fxBus.gain.setTargetAtTime(fx, now, .025); this.lastFx = fx; }
    if (!running || !this.musicVolume) { this.active = false; this.nextBeat = now; return; }
    if (!this.active) { this.active = true; this.nextBeat = now + .03; }
    if (this.nextBeat < now - .2) this.nextBeat = now;
    let scheduled = 0;
    while (this.nextBeat < now + .1 && scheduled++ < 4) { this.scheduleBeat(this.nextBeat, this.mode); this.nextBeat += 30 / musicModes[this.mode].bpm; }
  }
  play(type) {
    if (!this.enabled || !this.ctx || !this.fxVolume) return;
    const now = this.ctx.currentTime;
    if (['shoot', 'gatling'].includes(type) && now - this.last < .055) return;
    if (['shoot', 'gatling'].includes(type)) this.last = now;
    if (['evolution', 'victory', 'level'].includes(type)) { [0, 4, 7, 12].forEach((n, i) => this.tone(noteHz(69 + n), now + i * .08, .3, .1, 'triangle', this.fxBus)); return; }
    const frequencies = { shoot: 135, gatling: 95, shotgun: 70, coin: 1100, hurt: 80, nova: 65, choose: 660, dead: 110, combo: 850, boss: 60, warning: 420, impact: 55, supply: 880, pickup: 960, shield: 560, bossPhase: 180 };
    const f = frequencies[type]; if (!f) return;
    const volume = ['shoot', 'gatling'].includes(type) ? .035 : type === 'shotgun' ? .12 : .09;
    this.tone(f, now, type === 'warning' ? .3 : .18, volume, ['shoot', 'gatling', 'shotgun'].includes(type) ? 'triangle' : 'sine', this.fxBus, Math.max(30, f * .4));
  }
  dispose() { if (this.ctx && this.ctx.state !== 'closed') this.ctx.close(); }
}
