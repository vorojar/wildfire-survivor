const noteHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const musicModes = {
  explore: { bpm: 185, label: '铁雨前线', level: .66, cutoff: 3600 },
  combat: { bpm: 185, label: '钢铁兽潮', level: .86, cutoff: 10500 },
  boss: { bpm: 185, label: '决战轰鸣', level: 1, cutoff: 18000 },
};
export const audioFiles = { music: 'heavy-battle.mp3', rifle: 'rifle.wav', gatling: 'gatling.wav', shotgun: 'shotgun.wav', bolt: 'bolt.wav' };

// Recorded weapons and a licensed metal score. All assets are served with the game.
export class Sound {
  constructor({ assetBase = './audio/' } = {}) {
    this.assetBase = assetBase; this.enabled = true; this.ctx = null;
    this.musicVolume = .35; this.fxVolume = .7; this.mode = 'explore';
    this.buffers = new Map(); this.errors = new Map(); this.voices = new Set(); this.last = new Map();
    this.musicSource = null; this.musicOffset = 0; this.musicStarted = 0; this.wasRunning = false;
    this.loading = null; this.disposed = false;
  }
  get status() { return this.errors.size ? 'error' : this.buffers.size === Object.keys(audioFiles).length ? 'ready' : this.loading ? 'loading' : 'idle'; }
  createGraph(ctx) {
    this.ctx = ctx;
    this.musicBus = ctx.createGain(); this.fxBus = ctx.createGain(); this.duckBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.Q.value = .5;
    this.musicBus.gain.value = 0; this.fxBus.gain.value = this.enabled ? this.fxVolume : 0;
    const master = ctx.createGain(); master.gain.value = .85;
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -4; limiter.knee.value = 6;
    limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .1;
    this.musicFilter.connect(this.duckBus); this.duckBus.connect(this.musicBus);
    this.musicBus.connect(master); this.fxBus.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  unlock() {
    if (this.disposed) return;
    if (!this.ctx) this.createGraph(new (window.AudioContext || window.webkitAudioContext)());
    this.ctx.resume().then(() => this.errors.delete('context')).catch(error => { this.errors.set('context', error); console.warn('Audio context could not resume', error); });
    if (!this.loading && this.status !== 'ready') this.loadAssets();
  }
  async loadAssets() {
    if (!this.ctx || this.loading || this.disposed) return this.loading;
    const ctx = this.ctx;
    this.loading = Promise.all(Object.entries(audioFiles).map(async ([name, file]) => {
      if (this.buffers.has(name)) return;
      try {
        const response = await fetch(this.assetBase + file);
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) { this.buffers.set(name, buffer); this.errors.delete(name); }
      } catch (error) { if (!this.disposed) { this.errors.set(name, error); console.warn(`Audio asset failed: ${file}`, error); } }
    }));
    await this.loading; this.loading = null;
  }
  setVolumes(music, fx) { this.musicVolume = Math.max(0, Math.min(1, music)); this.fxVolume = Math.max(0, Math.min(1, fx)); }
  track(source, nodes) {
    // Rapid fire stays bounded, including overlapping mechanical tails.
    if (this.voices.size >= 48) this.voices.values().next().value.stop();
    const voice = { stop: () => { source.onended = null; source.stop(); source.disconnect(); for (const node of nodes) node.disconnect(); this.voices.delete(voice); } };
    source.onended = () => { source.disconnect(); for (const node of nodes) node.disconnect(); this.voices.delete(voice); };
    this.voices.add(voice);
  }
  stopFx() { for (const voice of [...this.voices]) voice.stop(); }
  sample(name, when, volume, rate = 1, pan = 0) {
    const buffer = this.buffers.get(name); if (!buffer) return false;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), stereo = this.ctx.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = rate; gain.gain.value = volume; stereo.pan.value = pan;
    source.connect(gain); gain.connect(stereo); stereo.connect(this.fxBus);
    source.start(when); this.track(source, [gain, stereo]); return true;
  }
  tone(frequency, when, duration, volume, type = 'sine', bus = this.fxBus, endFrequency = null) {
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain(); oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when); if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), when + .002);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(gain); gain.connect(bus); oscillator.start(when); oscillator.stop(when + duration + .01); this.track(oscillator, [gain]);
  }
  noiseBurst(when, duration, volume, frequency, filterType = 'lowpass') {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise; filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = .7;
    gain.gain.setValueAtTime(.0001, when); gain.gain.linearRampToValueAtTime(volume, when + .001);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.fxBus);
    source.start(when, Math.random() * .1); source.stop(when + duration + .01); this.track(source, [filter, gain]);
  }
  duck(when, heavy = false) {
    const gain = this.duckBus.gain;
    gain.cancelScheduledValues(when); gain.setValueAtTime(heavy ? .52 : .74, when);
    gain.setTargetAtTime(1, when + .035, heavy ? .16 : .065);
  }
  startMusic() {
    const buffer = this.buffers.get('music'); if (!buffer || this.musicSource) return;
    const source = this.ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.connect(this.musicFilter); this.musicStarted = this.ctx.currentTime;
    source.start(this.musicStarted, this.musicOffset % buffer.duration); this.musicSource = source;
  }
  stopMusic() {
    if (!this.musicSource) return;
    this.musicOffset = (this.musicOffset + this.ctx.currentTime - this.musicStarted) % this.musicSource.buffer.duration;
    this.musicSource.stop(); this.musicSource.disconnect(); this.musicSource = null;
  }
  update(game) {
    if (!this.ctx || this.ctx.state !== 'running' || this.disposed) return;
    const now = this.ctx.currentTime, running = this.enabled && (['playing','loot'].includes(game.state)||(game.state==='upgrade'&&game.upgradeIntro>0));
    this.mode = game.musicMode;
    const mix = musicModes[this.mode], volume = running ? this.musicVolume * mix.level * (game.reviveTimer>0?.25:game.upgradeIntro>0?.45:1) : 0;
    if (this.lastVolume !== volume) { this.musicBus.gain.setTargetAtTime(volume, now, .18); this.lastVolume = volume; }
    if (this.lastMode !== this.mode) { this.musicFilter.frequency.setTargetAtTime(mix.cutoff, now, .5); this.lastMode = this.mode; }
    const fx = this.enabled ? this.fxVolume : 0;
    if (this.lastFx !== fx) { this.fxBus.gain.setTargetAtTime(fx, now, .015); this.lastFx = fx; }
    if (this.wasRunning && !running) this.stopFx();
    if (running && this.musicVolume > 0) this.startMusic(); else this.stopMusic();
    this.wasRunning = running;
  }
  play(type) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || !this.fxVolume || this.disposed) return;
    const now = this.ctx.currentTime;
    const cooldown = { shoot: .035, gatling: .035, shotgun: .15, hit: .045, kill: .075, coin: .09, impact: .09 }[type] ?? 0;
    if (now - (this.last.get(type) ?? -Infinity) < cooldown) return;
    this.last.set(type, now);
    if (['shoot', 'gatling', 'shotgun'].includes(type)) {
      const heavy = type === 'shotgun', name = type === 'shoot' ? 'rifle' : type;
      const rate = (type === 'gatling' ? 1.08 : 1) + (Math.random() - .5) * .07;
      if (!this.sample(name, now, heavy ? .95 : type === 'gatling' ? .58 : .76, rate, (Math.random() - .5) * .1)) {
        // Immediate layered shot while the small recording files are still loading.
        this.noiseBurst(now, heavy ? .24 : .12, heavy ? .55 : .35, 6200);
        this.tone(heavy ? 130 : 180, now, .13, .17, 'sine', this.fxBus, 42);
      }
      if (heavy) { this.tone(95, now, .22, .14, 'sine', this.fxBus, 34); this.sample('bolt', now + .19, .32, 1); }
      this.duck(now, heavy); return;
    }
    if (type === 'hit' || type === 'kill') { this.noiseBurst(now, type === 'kill' ? .1 : .045, type === 'kill' ? .1 : .065, 1400); return; }
    if(type==='nova'){
      this.noiseBurst(now,.12,.42,4200);this.noiseBurst(now+.035,.7,.3,1000);
      this.tone(165,now,.18,.22,'sine',this.fxBus,45);this.tone(72,now+.025,.75,.3,'sine',this.fxBus,26);
      this.sample('shotgun',now,.28,.65);this.duck(now,true);return;
    }
    if(type==='revive'){
      this.noiseBurst(now,.3,.3,800);this.tone(130,now,.4,.24,'sine',this.fxBus,30);
      this.tone(65,now+.22,.17,.19);this.tone(55,now+.42,.2,.15);
      [0,7,12].forEach((n,i)=>this.tone(noteHz(60+n),now+.7+i*.1,.35,.08,'triangle'));
      this.duck(now,true);return;
    }
    if (['impact', 'boss', 'bossPhase', 'dead'].includes(type)) {
      const big = type !== 'impact'; this.noiseBurst(now, big ? .65 : .17, big ? .38 : .17, big ? 1600 : 900);
      this.tone(big ? 120 : 80, now, big ? .55 : .16, big ? .25 : .09, 'sine', this.fxBus, 28);
      if (big) this.duck(now, true); return;
    }
    if (type === 'hurt') { this.noiseBurst(now, .16, .18, 700); this.tone(110, now, .12, .09, 'triangle', this.fxBus, 55); return; }
    if (['evolution', 'victory', 'level', 'life'].includes(type)) { [0, 7, 12].forEach((n, i) => this.tone(noteHz(57 + n), now + i * .08, .22, .065, 'triangle')); return; }
    const frequencies = { coin: 1850, choose: 740, combo: 930, warning: 480, supply: 880, pickup: 1250, shield: 560 };
    const f = frequencies[type]; if (!f) return;
    this.tone(f, now, type === 'warning' ? .28 : .08, type === 'coin' ? .018 : .055, 'sine', this.fxBus, f * .7);
  }
  dispose() {
    this.disposed = true; this.stopMusic(); this.stopFx();
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
  }
}
