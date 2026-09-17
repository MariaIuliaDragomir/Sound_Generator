(function(){
  "use strict";

  const CATEGORIES = [
    { key: 'nature',     label: 'Natura / Ambianta' },
    { key: 'sfx',        label: 'Efecte / SFX' },
    { key: 'percussion', label: 'Percutie / Ritm' },
    { key: 'custom',     label: 'Sunete Personalizate' },
    { key: 'random',     label: 'Sunete Aleatorii' },
  ];

  const SOUND_TYPES = {
    rain:      { label: 'Ploaie',     mode: 'continuous', category: 'nature' },
    wind:      { label: 'Vant',       mode: 'continuous', category: 'nature' },
    fire:      { label: 'Foc',        mode: 'continuous', category: 'nature' },
    snow:      { label: 'Ninsoare',   mode: 'continuous', category: 'nature' },
    forest:    { label: 'Padure',     mode: 'continuous', category: 'nature' },
    cave:      { label: 'Pestera',    mode: 'continuous', category: 'nature' },
    ocean:     { label: 'Ocean',      mode: 'continuous', category: 'nature' },
    bird:      { label: 'Pasare',     mode: 'oneshot',    category: 'nature' },
    crickets:  { label: 'Greieri',    mode: 'continuous', category: 'nature' },
    stream:    { label: 'Parau',      mode: 'continuous', category: 'nature' },
    sword:     { label: 'Sabie',      mode: 'oneshot',    category: 'sfx' },
    explosion: { label: 'Explozie',   mode: 'oneshot',    category: 'sfx' },
    magic:     { label: 'Magie',      mode: 'oneshot',    category: 'sfx' },
    laser:     { label: 'Laser',      mode: 'oneshot',    category: 'sfx' },
    thunder:   { label: 'Tunet',      mode: 'oneshot',    category: 'nature' },
    drop:      { label: 'Picatura',   mode: 'oneshot',    category: 'nature' },
    click:     { label: 'Click',      mode: 'oneshot',    category: 'percussion' },
    kick:      { label: 'Kick',       mode: 'oneshot',    category: 'percussion' },
    snare:     { label: 'Snare',      mode: 'oneshot',    category: 'percussion' },
    hihatClosed: { label: 'Hi-hat Inchis', mode: 'oneshot', category: 'percussion' },
    hihatOpen: { label: 'Hi-hat Deschis',  mode: 'oneshot', category: 'percussion' },
    clap:      { label: 'Clap',       mode: 'oneshot',    category: 'percussion' },
  };
  const ROW_COLORS = ['#ff7a45', '#3df2a0', '#22d3ee', '#c084fc', '#facc15', '#f472b6', '#60a5fa', '#4ade80'];
  const SEQ_STEPS = 16;

  const AMBIENT_REPEAT = {
    thunder:   [4500, 9500],
    sword:     [2200, 4200],
    bird:      [1600, 3600],
    drop:      [800, 2000],
    click:     [500, 1300],
    explosion: [6000, 12000],
    magic:     [3000, 6500],
    laser:       [3000, 7000],
    kick:        [600, 1400],
    snare:       [700, 1600],
    hihatClosed: [200, 600],
    hihatOpen:   [900, 2200],
    clap:        [1200, 3000],
  };

  const Engine = {
    ready: false,
    _initPromise: null,
    pitchShift: null,
    reverb: null,
    volume: null,
    analyser: null,
    input: null,
    pool: null,          
    padsBus: null,        
    mixerBus: null,       
    padsRecorder: null,   
    mixerRecorder: null,  
    dynamicSounds: {},    
    duration: 1.0,
    pitchSemitones: 0,
    volumePct: 70,
    reverbPct: 20,
    activeContinuous: new Map(),

    resume(){
      if (this._initPromise) return this._initPromise;
      this._initPromise = (async () => {
        await Tone.start();

        this.pitchShift = new Tone.PitchShift(this.pitchSemitones);
        this.reverb = new Tone.Reverb({ decay: 2.4, wet: this.reverbPct / 100 });
        this.volume = new Tone.Volume(Tone.gainToDb(Math.max(this.volumePct, 0.001) / 100));

        this.pitchShift.connect(this.reverb);
        this.reverb.connect(this.volume);
        this.volume.toDestination();
        this.input = this.pitchShift;

        this.analyser = new Tone.Analyser('waveform', 1024);
        Tone.getDestination().connect(this.analyser);

        await this.reverb.ready;

        this.pool = {
          swordNoise: new Tone.Noise('white'),
          swordFilter: new Tone.Filter({ type: 'highpass', frequency: 2000 }),
          swordEnv: new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 }),
          swordPanner: new Tone.Panner(0),
          swordMetal: new Tone.MetalSynth({
            frequency: 400,
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
          }),
          swordMetal2: new Tone.MetalSynth({
            frequency: 900,
            envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
            harmonicity: 3.1, modulationIndex: 18, resonance: 3000, octaves: 1
          }),
          swordClangReverb: new Tone.Reverb({ decay: 1.2, wet: 0.4 }),
        };

        this.pool.swordNoise.connect(this.pool.swordFilter);
        this.pool.swordFilter.connect(this.pool.swordEnv);
        this.pool.swordEnv.connect(this.pool.swordPanner);
        this.pool.swordNoise.start();
        this.pool.swordMetal.connect(this.pool.swordClangReverb);
        this.pool.swordMetal2.connect(this.pool.swordClangReverb);
        await this.pool.swordClangReverb.ready;

        this.padsBus = new Tone.Gain(1);
        this.mixerBus = new Tone.Gain(1);
        this.padsBus.connect(this.input);
        this.mixerBus.connect(this.input);

        this.padsRecorder = new Tone.Recorder();
        this.mixerRecorder = new Tone.Recorder();
        this.padsBus.connect(this.padsRecorder);
        this.mixerBus.connect(this.mixerRecorder);

        this.ready = true;
      })();
      return this._initPromise;
    },

    _connectPooled(node, dest){
      try{ node.disconnect(); }catch(e){}
      node.connect(dest);
    },

    setVolume(pct){
      this.volumePct = pct;
      if (this.volume) this.volume.volume.value = Tone.gainToDb(Math.max(pct, 0.001) / 100);
    },
    setReverb(pct){
      this.reverbPct = pct;
      if (this.reverb) this.reverb.wet.value = pct / 100;
    },
    setPitch(semitones){
      this.pitchSemitones = semitones;
      if (this.pitchShift) this.pitchShift.pitch = semitones;
    },
    setDuration(sec){ this.duration = sec; },

    stopAll(){
      for (const key of Array.from(this.activeContinuous.keys())){
        this.stopContinuous(key);
      }
    },
    stopContinuous(key){
      const h = this.activeContinuous.get(key);
      if (h){ try{ h.stop(); }catch(e){} this.activeContinuous.delete(key); }
    },

    _chirpOnce(dest, offset){
      offset = offset || 0;
      const t0 = Tone.now() + offset;
      const base = 2200 + Math.random() * 900;
      const osc = new Tone.Oscillator(base, 'sine');
      const gain = new Tone.Gain(0);
      osc.connect(gain); gain.connect(dest);
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * 1.5, t0 + 0.06);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, t0 + 0.14);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.16);
      osc.start(t0); osc.stop(t0 + 0.2);
      setTimeout(() => { try{ osc.dispose(); gain.dispose(); }catch(e){} }, (offset + 0.4) * 1000 + 200);
    },

    startContinuous(name, dest){
      let nodes = [];
      let intervalId = null;
      let pendingTimer = null;

      if (name === 'rain'){
        const noise = new Tone.Noise('pink').start();
        const filter = new Tone.Filter(1500, 'bandpass');
        const lfo = new Tone.LFO(0.2, 1000, 2200).start();
        lfo.connect(filter.frequency);
        noise.connect(filter); filter.connect(dest);
        noise.volume.value = -8;
        nodes = [noise, filter, lfo];
      }
      else if (name === 'wind'){
        const noise = new Tone.Noise('brown').start();
        const filter = new Tone.Filter({ type: 'lowpass', frequency: 250, Q: 3 });
        const lfo = new Tone.LFO(0.15, 150, 600).start();
        lfo.connect(filter.frequency);
        noise.connect(filter); filter.connect(dest);
        noise.volume.value = -4;
        nodes = [noise, filter, lfo];
      }
      else if (name === 'fire'){
        const flameNoise = new Tone.Noise('pink').start();
        const flameFilter = new Tone.Filter(400, 'lowpass');
        flameNoise.connect(flameFilter); flameFilter.connect(dest);
        flameNoise.volume.value = -14;
        const crackleFilter = new Tone.Filter(2500, 'highpass');
        crackleFilter.connect(dest);
        const crackleSynth = new Tone.MembraneSynth({
          pitchDecay: 0.001, octaves: 2,
          oscillator: { type: 'square' },
          envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 }
        }).connect(crackleFilter);
        intervalId = setInterval(() => {
          if (Math.random() > 0.4){
            try{ crackleSynth.triggerAttackRelease(Math.random()*200 + 100, 0.005); }catch(e){}
          }
        }, 120);
        nodes = [flameNoise, flameFilter, crackleSynth, crackleFilter];
      }
      else if (name === 'snow'){
        const noise = new Tone.Noise('white').start();
        const filter = new Tone.Filter({ type: 'bandpass', frequency: 2800, Q: 4 });
        const lfo = new Tone.LFO(0.1, 1800, 3800).start();
        lfo.connect(filter.frequency);
        noise.connect(filter); filter.connect(dest);
        noise.volume.value = -18;
        nodes = [noise, filter, lfo];
      }
      else if (name === 'ocean'){
        const noise = new Tone.Noise('pink').start();
        const filter = new Tone.Filter(350, 'lowpass');
        const lfo = new Tone.LFO(0.08, 100, 700).start();
        lfo.connect(filter.frequency);
        noise.connect(filter); filter.connect(dest);
        noise.volume.value = -6;
        nodes = [noise, filter, lfo];
      }
      else if (name === 'stream'){
        const noise = new Tone.Noise('pink').start();
        const filter = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 2.2 });
        const lfoFast = new Tone.LFO(1.3, 900, 3200).start();
        const lfoSlow = new Tone.LFO(0.2, -400, 400).start();
        lfoFast.connect(filter.frequency);
        lfoSlow.connect(filter.frequency);
        noise.connect(filter); filter.connect(dest);
        noise.volume.value = -12;
        nodes = [noise, filter, lfoFast, lfoSlow];
      }
      else if (name === 'crickets'){
        const airNoise = new Tone.Noise('pink').start();
        const airFilter = new Tone.Filter({ type: 'bandpass', frequency: 3000, Q: 0.6 });
        airNoise.connect(airFilter); airFilter.connect(dest);
        airNoise.volume.value = -34;

        const song = () => {
          const pulses = 3 + Math.floor(Math.random() * 3);
          const baseFreq = 3800 + Math.random() * 800;
          for (let i = 0; i < pulses; i++){
            const t = Tone.now() + i * 0.045;
            const osc = new Tone.Oscillator(baseFreq, 'square');
            const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.02, sustain: 0, release: 0.01 });
            osc.connect(env); env.connect(dest);
            osc.start(t); osc.stop(t + 0.04);
            env.triggerAttackRelease(0.02, t);
            setTimeout(() => { try{ osc.dispose(); env.dispose(); }catch(e){} }, (i * 0.045 + 0.3) * 1000);
          }
          pendingTimer = setTimeout(song, 500 + Math.random() * 1200);
        };
        pendingTimer = setTimeout(song, 400);
        nodes = [airNoise, airFilter];
      }
      else if (name === 'forest'){
        const delay = new Tone.FeedbackDelay(0.25, 0.4);
        delay.connect(dest);
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.4, decay: 0.4, sustain: 0.7, release: 0.8 }
        }).connect(delay);
        synth.volume.value = -10;
        synth.triggerAttack(['F4', 'C5', 'E5']);
        const self = this;
        const scheduleChirp = () => {
          self._chirpOnce(dest, 0);
          pendingTimer = setTimeout(scheduleChirp, 2000 + Math.random()*4000);
        };
        pendingTimer = setTimeout(scheduleChirp, 1200);
        nodes = [synth, delay];
      }
      else if (name === 'cave'){
        const delay = new Tone.FeedbackDelay(0.7, 0.55);
        const caveReverb = new Tone.Reverb({ decay: 5, wet: 1 });
        delay.connect(caveReverb);
        caveReverb.connect(dest);

        const rumbleL = new Tone.Noise('brown').start();
        const rumbleR = new Tone.Noise('brown').start();
        const rumbleFilterL = new Tone.Filter({ type: 'lowpass', frequency: 110, Q: 1 });
        const rumbleFilterR = new Tone.Filter({ type: 'lowpass', frequency: 110, Q: 1 });
        const rumblePanL = new Tone.Panner(-0.4);
        const rumblePanR = new Tone.Panner(0.4);
        const rumbleLfo = new Tone.LFO(0.05, 70, 160).start();
        rumbleLfo.connect(rumbleFilterL.frequency);
        rumbleLfo.connect(rumbleFilterR.frequency);
        rumbleL.connect(rumbleFilterL); rumbleFilterL.connect(rumblePanL); rumblePanL.connect(dest);
        rumbleR.connect(rumbleFilterR); rumbleFilterR.connect(rumblePanR); rumblePanR.connect(dest);
        rumbleL.volume.value = -20; rumbleR.volume.value = -20;

        const airNoise = new Tone.Noise('pink').start();
        const airFilter = new Tone.Filter({ type: 'bandpass', frequency: 500, Q: 0.7 });
        airNoise.connect(airFilter); airFilter.connect(delay);
        airNoise.volume.value = -30;

        const drip = () => {
          this._drop(delay, 0.3);
          pendingTimer = setTimeout(drip, 2000 + Math.random()*4500);
        };
        pendingTimer = setTimeout(drip, 1200);

        nodes = [rumbleL, rumbleR, rumbleFilterL, rumbleFilterR, rumblePanL, rumblePanR, rumbleLfo, airNoise, airFilter, delay, caveReverb];
      }

      return {
        stop(){
          if (intervalId) clearInterval(intervalId);
          if (pendingTimer) clearTimeout(pendingTimer);
          nodes.forEach(n => {
            try{ if (typeof n.triggerRelease === 'function') n.triggerRelease(); }catch(e){}
            try{ if (typeof n.stop === 'function') n.stop('+0.3'); }catch(e){}
            if ('volume' in n){ try{ n.volume.rampTo(-60, 0.25); }catch(e){} }
          });
          setTimeout(() => { nodes.forEach(n => { try{ n.dispose(); }catch(e){} }); }, 500);
        }
      };
    },

    triggerOneShot(name, dest, durationOverride){
      const info = SOUND_TYPES[name];
      if (!info) return;
      const dur = (durationOverride !== undefined) ? durationOverride : this.duration;

      if (info.mode === 'continuous'){
        const handle = this.startContinuous(name, dest);
        setTimeout(() => handle.stop(), Math.max(dur, 0.2) * 1000);
        return;
      }

      if (info.dynamic){ this._playDynamic(name, dest, durationOverride); return; }

      if (name === 'thunder') this._thunder(dest, dur);
      else if (name === 'sword') this._sword(dest, dur);
      else if (name === 'bird') this._bird(dest, dur);
      else if (name === 'drop') this._drop(dest, dur);
      else if (name === 'click') this._click(dest, dur);
      else if (name === 'explosion') this._explosion(dest, dur);
      else if (name === 'magic') this._magic(dest, dur);
      else if (name === 'laser') this._laser(dest, dur);
      else if (name === 'kick') this._kick(dest, dur);
      else if (name === 'snare') this._snare(dest, dur);
      else if (name === 'hihatClosed') this._hihat(dest, dur, false);
      else if (name === 'hihatOpen') this._hihat(dest, dur, true);
      else if (name === 'clap') this._clap(dest, dur);
    },

    _thunder(dest, dur){
      const d = Math.max(dur, 0.25);
      const noise = new Tone.Noise('brown');
      const filter = new Tone.Filter({ type: 'lowpass', frequency: 800, Q: 2 });
      const now = Tone.now();
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(70, now + d);

      const env = new Tone.AmplitudeEnvelope({
        attack: 0.001, decay: Math.max(d*0.7, 0.3), sustain: 0, release: Math.max(d*0.3, 0.2)
      });
      noise.connect(env); env.connect(filter); filter.connect(dest);
      noise.start();
      env.triggerAttackRelease(d);
      noise.stop('+' + (d + 1));
      setTimeout(() => { try{ noise.dispose(); filter.dispose(); env.dispose(); }catch(e){} }, (d + 1.5) * 1000);
    },

    _sword(dest, dur){
      const d = Math.max(Math.min(dur, 3), 0.2);
      const swingLen = 0.42;
      const numSwings = Math.max(1, Math.floor(d / swingLen));
      this._connectPooled(this.pool.swordPanner, dest);
      this._connectPooled(this.pool.swordClangReverb, dest);

      for (let i = 0; i < numSwings; i++){
        const jitter = (Math.random() - 0.5) * 0.03;
        const time = Tone.now() + i * swingLen + jitter;
        const side = (i % 2 === 0) ? -1 : 1;

        this.pool.swordPanner.pan.setValueAtTime(side * 0.7 + (Math.random() * 0.2 - 0.1), time);

        this.pool.swordFilter.frequency.cancelScheduledValues(time);
        this.pool.swordFilter.frequency.setValueAtTime(700, time);
        this.pool.swordFilter.frequency.exponentialRampToValueAtTime(5500, time + 0.07);
        this.pool.swordFilter.frequency.exponentialRampToValueAtTime(1200, time + 0.22);
        this.pool.swordEnv.triggerAttack(time);
        this.pool.swordEnv.triggerRelease(time + 0.16);

        const vel = 0.8 + Math.random() * 0.2;
        this.pool.swordMetal.frequency.value = 350 + Math.random() * 220;
        this.pool.swordMetal.triggerAttackRelease('0.1', time + 0.05, vel);
        this.pool.swordMetal2.frequency.value = 800 + Math.random() * 400;
        this.pool.swordMetal2.triggerAttackRelease('0.05', time + 0.055, vel * 0.6);
      }
    },

    _explosion(dest, dur){
      const d = Math.max(dur, 0.4);
      const distortion = new Tone.Distortion(0.4);
      distortion.connect(dest);
      const filter = new Tone.Filter(180, 'lowpass');
      filter.connect(distortion);
      const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: d*0.8, sustain: 0, release: 0.4 });
      env.connect(filter);
      const noise = new Tone.Noise('brown');
      noise.connect(env);
      noise.start();
      env.triggerAttackRelease(d);
      noise.stop('+' + (d + 1));
      setTimeout(() => {
        try{ noise.dispose(); env.dispose(); filter.dispose(); distortion.dispose(); }catch(e){}
      }, (d + 1.5) * 1000);
    },

    _magic(dest, dur){
      const d = Math.max(dur, 0.3);
      const synth = new Tone.PolySynth(Tone.FMSynth, {
        modulationIndex: 12,
        envelope: { attack: 0.1, decay: 0.2, sustain: 0.2, release: 0.4 }
      }).connect(dest);
      const notes = ['E5', 'A5', 'B5', 'E6'];
      const seqLen = 0.5;
      const totalSeqs = Math.max(1, Math.floor(d / seqLen));
      for (let s = 0; s < totalSeqs; s++){
        notes.forEach((note, i) => {
          synth.triggerAttackRelease(note, '0.15', Tone.now() + s*seqLen + i*0.1);
        });
      }
      setTimeout(() => { try{ synth.dispose(); }catch(e){} }, (totalSeqs * seqLen + 1.5) * 1000);
    },

    _bird(dest, dur){
      const d = Math.max(dur, 0.2);
      const chirps = Math.max(1, Math.min(6, Math.round(d / 0.35)));
      for (let i = 0; i < chirps; i++){
        this._chirpOnce(dest, i * (d / chirps));
      }
    },

    _drop(dest, dur){
      const now = Tone.now();
      const d = Math.max(Math.min(dur || this.duration, 0.4), 0.1);
      
      const osc = new Tone.Oscillator(400, 'sine');
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.001,
        decay: d,
        sustain: 0,
        release: 0.01
      });

      const clickNoise = new Tone.Noise('white');
      const clickFilter = new Tone.Filter(3500, 'highpass');
      const clickEnv = new Tone.AmplitudeEnvelope({
        attack: 0.0005,
        decay: 0.004,
        sustain: 0,
        release: 0.001
      });

      osc.connect(env);
      env.connect(dest);

      clickNoise.chain(clickFilter, clickEnv, dest);

      const startFreq = 350 + Math.random() * 150;
      const endFreq = 1200 + Math.random() * 400;
      
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + (d * 0.65));

      clickNoise.start(now);
      clickEnv.triggerAttackRelease(0.004, now);
      clickNoise.stop(now + 0.01);

      osc.start(now);
      env.triggerAttackRelease(d, now);
      osc.stop(now + d + 0.05);

      setTimeout(() => {
        try { 
          osc.dispose(); 
          env.dispose(); 
          clickNoise.dispose(); 
          clickFilter.dispose(); 
          clickEnv.dispose(); 
        } catch(e){}
      }, (d + 0.1) * 1000);
    },

    _click(dest, dur){
      const now = Tone.now();
      
      const osc = new Tone.Oscillator(3200, 'square');
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.001,
        decay: 0.02,
        sustain: 0,
        release: 0.005
      });

      osc.frequency.setValueAtTime(3200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.01);

      const gain = new Tone.Gain(1.5);

      osc.connect(env);
      env.connect(gain);
      gain.connect(dest);

      osc.start(now);
      env.triggerAttackRelease(0.02, now);
      osc.stop(now + 0.03);

      setTimeout(() => {
        try {
          osc.dispose();
          env.dispose();
          gain.dispose();
        } catch(e){}
      }, 100);
    },

    _laser(dest, dur){
      const now = Tone.now();
      const d = Math.max(Math.min(dur || this.duration, 0.6), 0.12);

      const osc = new Tone.Oscillator(2200 + Math.random() * 400, 'sawtooth');
      const filter = new Tone.Filter({ type: 'lowpass', frequency: 5200 });
      const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: d, sustain: 0, release: 0.03 });
      osc.connect(filter); filter.connect(env); env.connect(dest);

      const startFreq = 2200 + Math.random() * 400;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + d * 0.85);

      osc.start(now);
      env.triggerAttackRelease(d, now);
      osc.stop(now + d + 0.08);

      setTimeout(() => {
        try{ osc.dispose(); filter.dispose(); env.dispose(); }catch(e){}
      }, (d + 0.4) * 1000);
    },

    _kick(dest, dur){
      const now = Tone.now();
      const synth = new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.4 }
      }).connect(dest);
      synth.triggerAttackRelease('C1', 0.4, now);
      setTimeout(() => { try{ synth.dispose(); }catch(e){} }, 900);
    },

    _snare(dest, dur){
      const now = Tone.now();
      const noise = new Tone.Noise('white');
      const filter = new Tone.Filter({ type: 'highpass', frequency: 1800 });
      const noiseEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.15, sustain: 0, release: 0.03 });
      noise.chain(filter, noiseEnv, dest);
      noise.start(now);
      noiseEnv.triggerAttackRelease(0.15, now);
      noise.stop(now + 0.18);

      const body = new Tone.MembraneSynth({
        pitchDecay: 0.02, octaves: 2,
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 }
      }).connect(dest);
      body.triggerAttackRelease('G2', 0.1, now);

      setTimeout(() => {
        try{ noise.dispose(); filter.dispose(); noiseEnv.dispose(); body.dispose(); }catch(e){}
      }, 500);
    },

    _hihat(dest, dur, open){
      const now = Tone.now();
      const d = open ? 0.32 : 0.045;
      const metal = new Tone.MetalSynth({
        frequency: 250,
        envelope: { attack: 0.001, decay: d, release: open ? 0.08 : 0.01 },
        harmonicity: 5.1, modulationIndex: 32, resonance: 7000, octaves: 1.2
      }).connect(dest);
      metal.triggerAttackRelease(d, now);
      setTimeout(() => { try{ metal.dispose(); }catch(e){} }, (d + 0.3) * 1000);
    },

    _clap(dest, dur){
      const now = Tone.now();
      const filter = new Tone.Filter({ type: 'bandpass', frequency: 1200, Q: 1.5 });
      filter.connect(dest);

      const offsets = [0, 0.012, 0.026];
      const disposables = [filter];
      offsets.forEach(off => {
        const t = now + off;
        const noise = new Tone.Noise('white');
        const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 });
        noise.connect(env); env.connect(filter);
        noise.start(t);
        env.triggerAttackRelease(0.06, t);
        noise.stop(t + 0.08);
        disposables.push(noise, env);
      });
      setTimeout(() => { disposables.forEach(n => { try{ n.dispose(); }catch(e){} }); }, 500);
    },

    _playDynamic(name, dest, durationOverride){
      const params = this.dynamicSounds[name];
      if (!params) return;
      const d = (durationOverride !== undefined) ? durationOverride : (params.duration || this.duration);
      const now = Tone.now();
      const disposables = [];

      let outputNode = dest;
      if (params.filterType && params.filterType !== 'none'){
        const filter = new Tone.Filter(params.filterFrequency || 2000, params.filterType);
        filter.connect(dest);
        outputNode = filter;
        disposables.push(filter);
      }

      if (params.synthType === 'FMSynth'){
        const fm = new Tone.FMSynth({
          harmonicity: params.harmonicity || 3,
          modulationIndex: params.modulationIndex || 10,
          oscillator: { type: params.oscillator || 'sine' },
          envelope: params.envelope || { attack: 0.01, decay: 0.4, sustain: 0, release: 0.2 }
        }).connect(outputNode);

        fm.triggerAttackRelease(params.baseFrequency || 440, d, now);
        disposables.push(fm);
      } 
      else if (params.synthType === 'Noise'){
        const noise = new Tone.Noise(params.noiseType || 'white');
        const env = new Tone.AmplitudeEnvelope(params.envelope || { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 });
        
        noise.connect(env);
        env.connect(outputNode);
        
        noise.start(now);
        env.triggerAttackRelease(d, now);
        noise.stop(now + d + 0.1);
        disposables.push(noise, env);
      } 
      else {
        const osc = new Tone.Oscillator(params.baseFrequency || 440, params.oscillator || 'sine');
        const env = new Tone.AmplitudeEnvelope(params.envelope || { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 });
        
        osc.connect(env);
        env.connect(outputNode);

        if (params.pitchSlideTo){
          const startF = Math.max(params.baseFrequency || 440, 10);
          const endF = Math.max(params.pitchSlideTo, 10);
          osc.frequency.setValueAtTime(startF, now);
          osc.frequency.exponentialRampToValueAtTime(endF, now + d);
        }

        osc.start(now);
        env.triggerAttackRelease(d, now);
        osc.stop(now + d + 0.1);
        disposables.push(osc, env);
      }

      setTimeout(() => {
        disposables.forEach(n => { try{ n.dispose(); }catch(e){} });
      }, (d + 1) * 1000);
    },
  };

  function updateSliderFill(input){
    const min = parseFloat(input.min), max = parseFloat(input.max), v = parseFloat(input.value);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }
  function bindSliderFill(input){
    input.addEventListener('input', () => updateSliderFill(input));
    updateSliderFill(input);
  }

  function soundOptionsHtml(selected){
    return CATEGORIES.map(cat => {
      const entries = Object.entries(SOUND_TYPES).filter(([, s]) => (s.category || 'nature') === cat.key);
      if (entries.length === 0) return '';
      const opts = entries.map(([key, s]) =>
        `<option value="${key}" ${key===selected?'selected':''}>${s.label}</option>`
      ).join('');
      return `<optgroup label="${cat.label}">${opts}</optgroup>`;
    }).join('');
  }

  function refreshAllSoundSelects(){
    mixerState.forEach(ch => {
      const current = ch.select.value;
      ch.select.innerHTML = soundOptionsHtml(current);
    });
    const currentAdd = seqAddSelect.value;
    seqAddSelect.innerHTML = soundOptionsHtml(currentAdd);
    renderSeqGrid(); 
  }

  const STORAGE_KEY = 'sonorState_v1';

  let saveTimer = null;
  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(getState())); }catch(e){}
    }, 400);
  }

  function getState(){
    return {
      master: {
        duration: Engine.duration,
        volume: Engine.volumePct,
        pitch: Engine.pitchSemitones,
        reverb: Engine.reverbPct,
      },
      mixer: mixerState.map(ch => ({
        sound: ch.select.value,
        volume: parseInt(ch.volInput.value, 10),
      })),
      sequencer: {
        bpm: seqState.bpm,
        rows: seqState.rows.map(r => ({ sound: r.sound, cells: r.cells.slice() })),
      },
      // NOTA: excludem cheile temporare de preview (Sunet Aleatoriu / Mini
      // Sintetizator) — acestea nu trebuie sa devina niciodata pad-uri
      // permanente doar pentru ca s-a salvat starea in timp ce modalul era
      // deschis pe un preview netestat.
      generatedSounds: Object.entries(Engine.dynamicSounds)
        .filter(([key]) => key !== RANDOM_PREVIEW_KEY && key !== SYNTH_PREVIEW_KEY)
        .map(([key, params]) => ({
          key, params,
          category: (SOUND_TYPES[key] && SOUND_TYPES[key].category) || 'random',
        })),
    };
  }

  function applyState(state){
    if (!state) return;

    if (Array.isArray(state.generatedSounds)){
      state.generatedSounds.forEach(item => {
        if (item && item.key && item.params) registerGeneratedSound(item.key, item.params, item.category);
      });
    }

    if (state.master){
      const m = state.master;
      if (m.duration != null){
        elDuration.value = m.duration; Engine.setDuration(m.duration);
        document.getElementById('val-duration').textContent = parseFloat(m.duration).toFixed(1) + 's';
        updateSliderFill(elDuration);
      }
      if (m.volume != null){
        elVolume.value = m.volume; Engine.setVolume(m.volume);
        document.getElementById('val-volume').textContent = m.volume + '%';
        updateSliderFill(elVolume);
      }
      if (m.pitch != null){
        elPitch.value = m.pitch; Engine.setPitch(m.pitch);
        document.getElementById('val-pitch').textContent = (m.pitch > 0 ? '+' : '') + m.pitch + ' st';
        updateSliderFill(elPitch);
      }
      if (m.reverb != null){
        elReverb.value = m.reverb; Engine.setReverb(m.reverb);
        document.getElementById('val-reverb').textContent = m.reverb + '%';
        updateSliderFill(elReverb);
      }
    }
    if (state.mixer){
      state.mixer.forEach((chData, i) => {
        const ch = mixerState[i];
        if (!ch) return;
        if (chData.sound && SOUND_TYPES[chData.sound]) ch.select.value = chData.sound;
        if (chData.volume != null){
          ch.volInput.value = chData.volume;
          ch.volInput.parentElement.querySelector('.vol-val').textContent = chData.volume + '%';
          updateSliderFill(ch.volInput);
        }
      });
    }
    if (state.sequencer){
      if (state.sequencer.bpm){
        seqState.bpm = state.sequencer.bpm;
        bpmInput.value = seqState.bpm;
        document.getElementById('val-bpm').textContent = seqState.bpm;
        updateSliderFill(bpmInput);
      }
      if (Array.isArray(state.sequencer.rows)){
        seqState.rows = state.sequencer.rows.map(r => ({
          id: seqRowIdCounter++,
          sound: SOUND_TYPES[r.sound] ? r.sound : 'click',
          cells: Array.isArray(r.cells) ? r.cells.slice(0, SEQ_STEPS) : new Array(SEQ_STEPS).fill(false),
        }));
        renderSeqGrid();
      }
    }
  }

  const elDuration = document.getElementById('duration');
  const elVolume = document.getElementById('volume');
  const elPitch = document.getElementById('pitch');
  const elReverb = document.getElementById('reverb');

  [elDuration, elVolume, elPitch, elReverb].forEach(bindSliderFill);

  elDuration.addEventListener('input', () => {
    Engine.setDuration(parseFloat(elDuration.value));
    document.getElementById('val-duration').textContent = parseFloat(elDuration.value).toFixed(1) + 's';
    scheduleSave();
  });
  elVolume.addEventListener('input', () => {
    Engine.setVolume(parseFloat(elVolume.value));
    document.getElementById('val-volume').textContent = elVolume.value + '%';
    scheduleSave();
  });
  elPitch.addEventListener('input', () => {
    Engine.setPitch(parseFloat(elPitch.value));
    const v = parseFloat(elPitch.value);
    document.getElementById('val-pitch').textContent = (v > 0 ? '+' : '') + v + ' st';
    scheduleSave();
  });
  elReverb.addEventListener('input', () => {
    Engine.setReverb(parseFloat(elReverb.value));
    document.getElementById('val-reverb').textContent = elReverb.value + '%';
    scheduleSave();
  });
  Engine.setDuration(parseFloat(elDuration.value));

  const canvas = document.getElementById('visualizer');
  const cctx = canvas.getContext('2d');
  function resizeCanvas(){
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const headerRec = document.getElementById('header-rec');

  function drawVisualizer(){
    requestAnimationFrame(drawVisualizer);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    cctx.clearRect(0, 0, w, h);

    if (!Engine.ready){ headerRec.classList.remove('live'); return; }

    const data = Engine.analyser.getValue();
    const bufferLen = data.length;

    let maxDev = 0;
    for (let i = 0; i < bufferLen; i += 8){ maxDev = Math.max(maxDev, Math.abs(data[i])); }
    headerRec.classList.toggle('live', maxDev > 0.01);

    cctx.lineWidth = 2;
    cctx.strokeStyle = '#3df2a0';
    cctx.shadowColor = 'rgba(61,242,160,0.7)';
    cctx.shadowBlur = 8;
    cctx.beginPath();
    const slice = w / bufferLen;
    let x = 0;
    for (let i = 0; i < bufferLen; i++){
      const v = data[i];
      const y = (h/2) - (v * h/2);
      if (i === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
      x += slice;
    }
    cctx.stroke();
    cctx.shadowBlur = 0;
  }
  drawVisualizer();

  const padsGrid = document.getElementById('pads-grid');

  function renderPadsGrouped(){
    padsGrid.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const soundsInCat = Object.entries(SOUND_TYPES).filter(([, s]) => (s.category || 'nature') === cat.key);
      if (soundsInCat.length === 0) return; 

      const section = document.createElement('div');
      section.className = 'mb-6 last:mb-0';

      const heading = document.createElement('p');
      heading.className = 'text-xs uppercase tracking-wider text-[var(--text-dim)] font-mono mb-3';
      heading.textContent = cat.label;
      section.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4';

      soundsInCat.forEach(([name, info]) => {
        const btn = document.createElement('button');
        btn.className = `pad pad-${cat.key} p-5 flex flex-col items-center justify-center gap-2 min-h-[100px]`;
        btn.dataset.pad = name;
        btn.innerHTML = `
          <span class="pulse ${info.mode==='continuous' ? '' : 'hidden'}"></span>
          <span class="font-display font-bold text-sm text-center">${info.label}</span>
        `;
        btn.addEventListener('click', () => handlePadClick(name, btn));

        if (info.dynamic){
          const delBtn = document.createElement('span');
          delBtn.className = 'pad-delete';
          delBtn.textContent = '\u2715';
          delBtn.title = 'Sterge acest sunet';
          delBtn.setAttribute('role', 'button');
          delBtn.setAttribute('tabindex', '0');
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteGeneratedSound(name);
          });
          delBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' '){
              e.preventDefault();
              e.stopPropagation();
              deleteGeneratedSound(name);
            }
          });
          btn.appendChild(delBtn);
        }

        grid.appendChild(btn);
      });

      section.appendChild(grid);
      padsGrid.appendChild(section);
    });
  }
  renderPadsGrouped();

  async function handlePadClick(name, btn){
    await Engine.resume();
    const info = SOUND_TYPES[name];
    const key = 'pad_' + name;
    if (info.mode === 'continuous'){
      if (Engine.activeContinuous.has(key)){
        Engine.stopContinuous(key);
        btn.classList.remove('pad-active');
        btn.querySelector('.pulse')?.classList.remove('animate');
      } else {
        const handle = Engine.startContinuous(name, Engine.padsBus);
        Engine.activeContinuous.set(key, handle);
        btn.classList.add('pad-active');
        btn.querySelector('.pulse')?.classList.add('animate');
      }
    } else {
      Engine.triggerOneShot(name, Engine.padsBus);
      btn.classList.add('pad-flash');
      setTimeout(() => btn.classList.remove('pad-flash'), 220);
    }
  }

  const mixerContainer = document.getElementById('mixer-channels');
  const mixerState = [];
  const defaultMixSounds = ['rain', 'forest', 'cave'];

  for (let i = 0; i < 3; i++){
    const wrap = document.createElement('div');
    wrap.className = 'panel !bg-[#0e1320] p-4 flex flex-col gap-4';
    wrap.innerHTML = `
      <p class="text-xs text-[var(--text-dim)] font-mono">Canal ${i + 1}</p>
      <select data-ch="${i}" class="w-full rounded-lg px-3 py-2 text-sm">
        ${soundOptionsHtml(defaultMixSounds[i])}
      </select>
      <div>
        <div class="flex justify-between mb-1.5">
          <label class="text-xs text-[var(--text-dim)]">Volum canal</label>
          <span class="font-mono text-xs text-[var(--green)] vol-val">60%</span>
        </div>
        <input type="range" min="0" max="100" step="1" value="60" data-vol="${i}">
      </div>
    `;
    mixerContainer.appendChild(wrap);

    const select = wrap.querySelector('select');
    const volInput = wrap.querySelector('input[type=range]');
    const volLabel = wrap.querySelector('.vol-val');
    bindSliderFill(volInput);

    const chanState = { select, volInput, gainNode: null, panner: null, active: false, timeoutId: null, key: 'mix_' + i };
    mixerState.push(chanState);

    volInput.addEventListener('input', () => {
      volLabel.textContent = volInput.value + '%';
      if (chanState.gainNode){
        chanState.gainNode.gain.rampTo(volInput.value/100, 0.05);
      }
      scheduleSave();
    });

    select.addEventListener('change', () => {
      if (chanState.active){
        stopMixerChannel(chanState);
        startMixerChannel(chanState);
      }
      scheduleSave();
    });
  }

  async function startMixerChannel(chanState){
    await Engine.resume();
    const name = chanState.select.value;
    const info = SOUND_TYPES[name];

    const gainNode = new Tone.Gain(chanState.volInput.value / 100);
    const panner = new Tone.AutoPanner({ frequency: 0.1, depth: 0.4 }).start();
    gainNode.connect(panner);
    panner.connect(Engine.mixerBus);
    chanState.gainNode = gainNode;
    chanState.panner = panner;
    chanState.active = true;

    const disposeChannelNodes = () => {
      setTimeout(() => {
        try{ gainNode.dispose(); }catch(e){}
        try{ panner.dispose(); }catch(e){}
      }, 600);
    };

    if (info.mode === 'continuous'){
      const handle = Engine.startContinuous(name, gainNode);
      Engine.activeContinuous.set(chanState.key, {
        stop(){ handle.stop(); disposeChannelNodes(); }
      });
    } else {
      const [minMs, maxMs] = AMBIENT_REPEAT[name] || [1500, 3000];
      const scheduleNext = () => {
        Engine.triggerOneShot(name, gainNode);
        const wait = minMs + Math.random() * (maxMs - minMs);
        chanState.timeoutId = setTimeout(scheduleNext, wait);
      };
      scheduleNext();
      Engine.activeContinuous.set(chanState.key, {
        stop(){ clearTimeout(chanState.timeoutId); disposeChannelNodes(); }
      });
    }
  }

  function stopMixerChannel(chanState){
    if (!chanState.active) return;
    clearTimeout(chanState.timeoutId);
    Engine.stopContinuous(chanState.key);
    chanState.gainNode = null;
    chanState.panner = null;
    chanState.active = false;
  }

  document.getElementById('mix-start').addEventListener('click', async () => {
    await Engine.resume();
    mixerState.forEach(ch => { stopMixerChannel(ch); startMixerChannel(ch); });
  });

  const seqGridEl = document.getElementById('seq-grid');
  const seqAddSelect = document.getElementById('seq-add-select');
  seqAddSelect.innerHTML = soundOptionsHtml('thunder');

  let seqRowIdCounter = 0;
  const seqState = {
    rows: [
      { id: seqRowIdCounter++, sound: 'thunder', cells: new Array(SEQ_STEPS).fill(false) },
      { id: seqRowIdCounter++, sound: 'sword',   cells: new Array(SEQ_STEPS).fill(false) },
      { id: seqRowIdCounter++, sound: 'drop',    cells: new Array(SEQ_STEPS).fill(false) },
      { id: seqRowIdCounter++, sound: 'click',   cells: new Array(SEQ_STEPS).fill(false) },
    ],
    playing: false,
    currentStep: 0,
    intervalId: null,
    bpm: 120,
  };

  function renderSeqGrid(){
    seqGridEl.innerHTML = '';

    const inner = document.createElement('div');
    inner.className = 'flex flex-col gap-3 min-w-max';
    seqGridEl.appendChild(inner);

    if (seqState.rows.length === 0){
      const empty = document.createElement('p');
      empty.className = 'text-sm text-[var(--text-dim)]';
      empty.textContent = 'Adauga un rand pentru a incepe.';
      inner.appendChild(empty);
      return;
    }
    seqState.rows.forEach((row, rowIdx) => {
      const color = ROW_COLORS[rowIdx % ROW_COLORS.length];
      const rowWrap = document.createElement('div');
      rowWrap.className = 'flex items-center gap-2';

      const controls = document.createElement('div');
      controls.className = 'w-48 shrink-0 flex items-center gap-1.5';
      controls.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
        <select class="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs">${soundOptionsHtml(row.sound)}</select>
        <button class="btn-ghost rounded-lg px-2 py-1.5 text-xs shrink-0" title="Sterge randul">Sterge</button>
      `;
      const rowSelect = controls.querySelector('select');
      rowSelect.addEventListener('change', () => { row.sound = rowSelect.value; scheduleSave(); });
      controls.querySelector('button').addEventListener('click', () => {
        seqState.rows = seqState.rows.filter(r => r.id !== row.id);
        renderSeqGrid();
        scheduleSave();
      });
      rowWrap.appendChild(controls);

      const CELL_MIN_PX = 22;
      const CELL_GAP_PX = 6;
      const gridWidthPx = SEQ_STEPS * CELL_MIN_PX + (SEQ_STEPS - 1) * CELL_GAP_PX;

      const cellsWrap = document.createElement('div');
      cellsWrap.className = 'grid gap-1.5 shrink-0';
      cellsWrap.style.width = gridWidthPx + 'px';
      cellsWrap.style.gridTemplateColumns = `repeat(${SEQ_STEPS}, minmax(22px, 1fr))`;
      cellsWrap.style.setProperty('--row-color', color);

      for (let step = 0; step < SEQ_STEPS; step++){
        const cell = document.createElement('div');
        cell.className = 'step-cell' + (step % 4 === 0 ? ' beat' : '') + (row.cells[step] ? ' active' : '');
        cell.style.setProperty('--row-color', color);
        cell.dataset.step = step;
        cell.dataset.rowId = row.id;
        cell.tabIndex = 0;
        cell.addEventListener('click', () => {
          row.cells[step] = !row.cells[step];
          cell.classList.toggle('active', row.cells[step]);
          scheduleSave();
        });
        cellsWrap.appendChild(cell);
      }
      rowWrap.appendChild(cellsWrap);
      inner.appendChild(rowWrap);
    });
  }
  renderSeqGrid();

  document.getElementById('seq-add-row').addEventListener('click', () => {
    seqState.rows.push({ id: seqRowIdCounter++, sound: seqAddSelect.value, cells: new Array(SEQ_STEPS).fill(false) });
    renderSeqGrid();
    scheduleSave();
  });

  function highlightPlayhead(step){
    document.querySelectorAll('.step-cell').forEach(c => c.classList.remove('playhead'));
    document.querySelectorAll(`.step-cell[data-step="${step}"]`).forEach(c => c.classList.add('playhead'));
  }
  function clearPlayhead(){
    document.querySelectorAll('.step-cell').forEach(c => c.classList.remove('playhead'));
  }

  function stepInterval(){
    return (60 / seqState.bpm) / 4 * 1000;
  }

  function seqTick(){
    highlightPlayhead(seqState.currentStep);
    seqState.rows.forEach(row => {
      if (row.cells[seqState.currentStep]){
        Engine.triggerOneShot(row.sound, Engine.padsBus, 0.28);
      }
    });
    seqState.currentStep = (seqState.currentStep + 1) % SEQ_STEPS;
  }

  async function startSequencer(){
    await Engine.resume();
    seqState.playing = true;
    seqState.currentStep = 0;
    seqTick();
    seqState.intervalId = setInterval(seqTick, stepInterval());
    document.getElementById('seq-play-label').textContent = 'Pauza';
  }
  function stopSequencer(){
    seqState.playing = false;
    clearInterval(seqState.intervalId);
    seqState.currentStep = 0;
    clearPlayhead();
    document.getElementById('seq-play-label').textContent = 'Play';
  }

  document.getElementById('seq-play').addEventListener('click', () => {
    if (seqState.playing) stopSequencer(); else startSequencer();
  });

  const bpmInput = document.getElementById('bpm');
  bindSliderFill(bpmInput);
  bpmInput.addEventListener('input', () => {
    seqState.bpm = parseFloat(bpmInput.value);
    document.getElementById('val-bpm').textContent = bpmInput.value;
    if (seqState.playing){
      clearInterval(seqState.intervalId);
      seqState.intervalId = setInterval(seqTick, stepInterval());
    }
    scheduleSave();
  });

  document.getElementById('stop-all').addEventListener('click', () => {
    Engine.stopAll();
    document.querySelectorAll('.pad.pad-active').forEach(p => {
      p.classList.remove('pad-active');
      p.querySelector('.pulse')?.classList.remove('animate');
    });
    mixerState.forEach(ch => { ch.active = false; clearTimeout(ch.timeoutId); ch.gainNode = null; ch.panner = null; });
    stopSequencer();
  });

  document.addEventListener('pointerdown', () => Engine.resume(), { once: true });

  function setupRecordButton(buttonId, getRecorder, filePrefix){
    const btn = document.getElementById(buttonId);
    const originalLabel = btn.textContent.trim();
    let isRecording = false;

    btn.addEventListener('click', async () => {
      await Engine.resume();
      const recorder = getRecorder();

      if (!isRecording){
        recorder.start();
        isRecording = true;
        btn.classList.add('recording');
        btn.textContent = '● Opreste Inregistrarea';
      } else {
        isRecording = false;
        btn.classList.remove('recording');
        btn.textContent = originalLabel;

        const recordingBlob = await recorder.stop();
        const url = URL.createObjectURL(recordingBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filePrefix}-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    });
  }

  setupRecordButton('rec-mixer', () => Engine.mixerRecorder, 'sonor-mix-ambiental');
  setupRecordButton('rec-pads', () => Engine.padsRecorder, 'sonor-secventa-sintetizator');

  const RANDOM_PREVIEW_KEY = '__random_preview__';
  const randomModal = document.getElementById('random-modal');
  const randomNameEl = document.getElementById('random-name');
  let pendingRandomParams = null;
  let pendingRandomLabel = '';

  function registerGeneratedSound(key, params, category){
    category = category || 'random';
    SOUND_TYPES[key] = { label: params.label || 'Sunet Generat', mode: 'oneshot', category, dynamic: true };
    Engine.dynamicSounds[key] = params;
    renderPadsGrouped();
    refreshAllSoundSelects();
  }

  function deleteGeneratedSound(key){
    const info = SOUND_TYPES[key];
    if (!info || !info.dynamic) return;
    delete SOUND_TYPES[key];
    delete Engine.dynamicSounds[key];
    renderPadsGrouped();
    refreshAllSoundSelects();
    scheduleSave();
  }

  function generateRandomSoundParams(){
    const oscTypes = ['sine', 'square', 'sawtooth', 'triangle'];
    const filterTypes = ['lowpass', 'highpass', 'bandpass', 'none'];
    const noiseTypes = ['white', 'pink', 'brown', 'none'];
    const rand = (min, max) => min + Math.random() * (max - min);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const baseFrequency = rand(80, 3000);
    const hasSlide = Math.random() < 0.5;
    const pitchSlideTo = hasSlide
      ? rand(Math.max(40, baseFrequency * 0.2), baseFrequency * 2.5)
      : null;

    return {
      oscillator: pick(oscTypes),
      baseFrequency,
      pitchSlideTo,
      envelope: {
        attack: rand(0.001, 0.3),
        decay: rand(0.05, 1.2),
        sustain: rand(0, 0.6),
        release: rand(0.02, 0.8),
      },
      filterType: pick(filterTypes),
      filterFrequency: rand(100, 8000),
      noiseType: pick(noiseTypes),
      duration: rand(0.15, 2.5),
    };
  }

  function nextRandomLabel(){
    const count = Object.values(SOUND_TYPES).filter(s => s.category === 'random').length;
    return 'Sunet Aleatoriu #' + (count + 1);
  }

  async function playRandomPreview(){
    pendingRandomParams = generateRandomSoundParams();
    pendingRandomLabel = nextRandomLabel();
    randomNameEl.textContent = pendingRandomLabel;
    Engine.dynamicSounds[RANDOM_PREVIEW_KEY] = pendingRandomParams;
    await Engine.resume();
    Engine._playDynamic(RANDOM_PREVIEW_KEY, Engine.padsBus);
  }

  function closeRandomModal(){
    randomModal.classList.add('hidden');
    delete Engine.dynamicSounds[RANDOM_PREVIEW_KEY];
    pendingRandomParams = null;
  }

  document.getElementById('random-open').addEventListener('click', () => {
    randomModal.classList.remove('hidden');
    playRandomPreview();
  });
  document.getElementById('random-close').addEventListener('click', closeRandomModal);
  randomModal.addEventListener('click', (e) => {
    if (e.target === randomModal) closeRandomModal();
  });
  document.getElementById('random-retry').addEventListener('click', () => {
    playRandomPreview();
  });
  document.getElementById('random-keep').addEventListener('click', () => {
    if (!pendingRandomParams) return;
    delete Engine.dynamicSounds[RANDOM_PREVIEW_KEY];
    const key = 'rand_' + Date.now();
    registerGeneratedSound(key, { ...pendingRandomParams, label: pendingRandomLabel }, 'random');
    scheduleSave();
    randomModal.classList.add('hidden');
    pendingRandomParams = null;
  });

  const SYNTH_PREVIEW_KEY = '__synth_preview__';
  const synthModal = document.getElementById('synth-modal');

  const synthEls = {
    name: document.getElementById('synth-name'),
    osc: document.getElementById('synth-osc'),
    freq: document.getElementById('synth-freq'),
    freqVal: document.getElementById('synth-freq-val'),
    dur: document.getElementById('synth-dur'),
    durVal: document.getElementById('synth-dur-val'),
    slideEnabled: document.getElementById('synth-slide-enabled'),
    slideRow: document.getElementById('synth-slide-row'),
    slide: document.getElementById('synth-slide'),
    slideVal: document.getElementById('synth-slide-val'),
    attack: document.getElementById('synth-attack'),
    attackVal: document.getElementById('synth-attack-val'),
    decay: document.getElementById('synth-decay'),
    decayVal: document.getElementById('synth-decay-val'),
    sustain: document.getElementById('synth-sustain'),
    sustainVal: document.getElementById('synth-sustain-val'),
    release: document.getElementById('synth-release'),
    releaseVal: document.getElementById('synth-release-val'),
    filterType: document.getElementById('synth-filter-type'),
    filterFreq: document.getElementById('synth-filter-freq'),
    filterFreqVal: document.getElementById('synth-filter-freq-val'),
    noiseType: document.getElementById('synth-noise-type'),
  };

  function bindSynthSlider(input, valEl, formatFn){
    const update = () => {
      updateSliderFill(input);
      valEl.textContent = formatFn(parseFloat(input.value));
    };
    input.addEventListener('input', update);
    update();
  }
  bindSynthSlider(synthEls.freq, synthEls.freqVal, v => Math.round(v) + ' Hz');
  bindSynthSlider(synthEls.dur, synthEls.durVal, v => v.toFixed(2) + 's');
  bindSynthSlider(synthEls.slide, synthEls.slideVal, v => Math.round(v) + ' Hz');
  bindSynthSlider(synthEls.attack, synthEls.attackVal, v => v.toFixed(3) + 's');
  bindSynthSlider(synthEls.decay, synthEls.decayVal, v => v.toFixed(2) + 's');
  bindSynthSlider(synthEls.sustain, synthEls.sustainVal, v => v.toFixed(2));
  bindSynthSlider(synthEls.release, synthEls.releaseVal, v => v.toFixed(2) + 's');
  bindSynthSlider(synthEls.filterFreq, synthEls.filterFreqVal, v => Math.round(v) + ' Hz');

  synthEls.slideEnabled.addEventListener('change', () => {
    synthEls.slideRow.classList.toggle('hidden', !synthEls.slideEnabled.checked);
  });

  function readSynthParamsFromUI(){
    return {
      label: synthEls.name.value.trim() || 'Sunet Personalizat',
      oscillator: synthEls.osc.value,
      baseFrequency: parseFloat(synthEls.freq.value),
      pitchSlideTo: synthEls.slideEnabled.checked ? parseFloat(synthEls.slide.value) : null,
      envelope: {
        attack: parseFloat(synthEls.attack.value),
        decay: parseFloat(synthEls.decay.value),
        sustain: parseFloat(synthEls.sustain.value),
        release: parseFloat(synthEls.release.value),
      },
      filterType: synthEls.filterType.value,
      filterFrequency: parseFloat(synthEls.filterFreq.value),
      noiseType: synthEls.noiseType.value,
      duration: parseFloat(synthEls.dur.value),
    };
  }

  document.getElementById('synth-open').addEventListener('click', () => {
    synthModal.classList.remove('hidden');
  });
  function closeSynthModal(){
    synthModal.classList.add('hidden');
    delete Engine.dynamicSounds[SYNTH_PREVIEW_KEY];
  }
  document.getElementById('synth-close').addEventListener('click', closeSynthModal);
  synthModal.addEventListener('click', (e) => {
    if (e.target === synthModal) closeSynthModal();
  });

  document.getElementById('synth-test').addEventListener('click', async () => {
    const params = readSynthParamsFromUI();
    Engine.dynamicSounds[SYNTH_PREVIEW_KEY] = params;
    await Engine.resume();
    Engine._playDynamic(SYNTH_PREVIEW_KEY, Engine.padsBus);
  });

  document.getElementById('synth-save').addEventListener('click', () => {
    const params = readSynthParamsFromUI();
    delete Engine.dynamicSounds[SYNTH_PREVIEW_KEY];
    const key = 'synth_' + Date.now();
    registerGeneratedSound(key, params, 'custom');
    scheduleSave();
    synthModal.classList.add('hidden');
  });

  (function restoreState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyState(JSON.parse(raw));
    }catch(e){ }
  })();


})();