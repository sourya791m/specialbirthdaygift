/* ==========================================================
   Mahi's Magical Birthday Surprise — app logic
   Sections: config/state · sound · effects · lock · balloons ·
             party (cake, card, countdown, modal) · music UI · boot
   ========================================================== */
(() => {
  'use strict';

  const CONFIG = {
    PIN: '10',               // fun lock, not real security
    BALLOON_COUNT: 10,
    MUSIC_FILE: '',          // optional: 'assets/birthday.mp3'. Empty = built-in synthesized music box.
    BIRTH_MONTH: 10,         // November (0-based)
    BIRTH_DAY: 10
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------------- State (survives refresh, per session) ---------------- */
  const KEY = 'mahi-surprise-v1';
  const state = (() => {
    let s = { stage: 'lock', popped: [], wished: false };
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        s.stage = ['lock', 'balloons', 'party'].includes(raw.stage) ? raw.stage : 'lock';
        s.popped = Array.isArray(raw.popped) ? raw.popped.filter(n => Number.isInteger(n) && n >= 0 && n < CONFIG.BALLOON_COUNT) : [];
        s.wished = !!raw.wished;
      }
    } catch (e) { /* storage unavailable */ }
    // no skipping ahead
    if (s.stage === 'party' && new Set(s.popped).size < CONFIG.BALLOON_COUNT) s.stage = 'balloons';
    return s;
  })();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  /* ======================================================================
     SOUND — synthesized with Web Audio (no files to load, nothing to license)
     ====================================================================== */
  const Sound = (() => {
    const BPM = 92, BEAT = 60 / BPM, LOOP_BEATS = 28;
    const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
                C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, C6: 1046.5 };
    // [note, startBeat, lengthInBeats]  — classic birthday tune, 3/4 with a pick-up
    const MELODY = [
      [N.G4,0,.75],[N.G4,.75,.25],[N.A4,1,1],[N.G4,2,1],[N.C5,3,1],[N.B4,4,2],
      [N.G4,6,.75],[N.G4,6.75,.25],[N.A4,7,1],[N.G4,8,1],[N.D5,9,1],[N.C5,10,2],
      [N.G4,12,.75],[N.G4,12.75,.25],[N.G5,13,1],[N.E5,14,1],[N.C5,15,1],[N.B4,16,1],[N.A4,17,1],
      [N.F5,18,.75],[N.F5,18.75,.25],[N.E5,19,1],[N.C5,20,1],[N.D5,21,1],[N.C5,22,3],
      [N.E5,25.5,.5],[N.G5,26.2,.5],[N.C6,27,1]
    ];
    const CH = { C: [130.81, 196.0, 329.63], G: [98.0, 146.83, 246.94] };
    const BARS = [[1,'C'],[4,'G'],[7,'G'],[10,'C'],[13,'C'],[16,'G'],[19,'C'],[22,'C']];

    let ctx = null, master, bus, musicGain, sfxGain, noiseBuf;
    let fileEl = null, usingFile = false;
    let started = false, playing = false, muted = false, userPaused = false;
    let timer = null, nextLoop = 0, loopGains = [];
    let onChange = () => {};

    function init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
        bus = ctx.createGain(); bus.connect(master);
        const delay = ctx.createDelay(1); delay.delayTime.value = 0.3;
        const fb = ctx.createGain(); fb.gain.value = 0.3;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
        const wet = ctx.createGain(); wet.gain.value = 0.3;
        bus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(master);
        musicGain = ctx.createGain(); musicGain.gain.value = 0.75; musicGain.connect(bus);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(bus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return true;
      } catch (e) { ctx = null; return false; }
    }

    function ensure() {
      if (!init()) return false;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
      return true;
    }

    /* --- instruments --- */
    function bell(freq, t, dur, vol, dest) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [[1, 1], [2, .26], [4.01, .08]].forEach(([m, a]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const og = ctx.createGain(); og.gain.value = a;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
      });
      g.connect(dest);
    }
    function tone(f, t, d, v, type = 'sine') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + d + 0.05);
      return o;
    }
    function noise(t, d, v, type, f1, f2) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + d + 0.05);
    }

    /* --- music scheduling --- */
    function scheduleLoop(t0) {
      const lg = ctx.createGain(); lg.connect(musicGain); loopGains.push(lg);
      MELODY.forEach(([f, b, len], i) => {
        const vol = b >= 25 ? 0.05 : 0.13;
        bell(f, t0 + b * BEAT, Math.min(len * BEAT * 1.5 + 0.7, 2.4), vol, lg);
      });
      BARS.forEach(([start, c]) => {
        CH[c].forEach((f, i) => bell(f, t0 + (start + i) * BEAT, 1.3, 0.07, lg));
      });
      if (loopGains.length > 4) loopGains.shift();
    }
    function tick() {
      if (!playing || usingFile || !ctx) return;
      const loopSec = LOOP_BEATS * BEAT;
      while (nextLoop < ctx.currentTime + 4) { scheduleLoop(nextLoop); nextLoop += loopSec; }
    }
    function startSynth() {
      if (!ensure()) { onChange(); return false; }
      usingFile = false; playing = true; started = true;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.75, ctx.currentTime + 1.2);
      nextLoop = ctx.currentTime + 0.15;
      tick(); clearInterval(timer); timer = setInterval(tick, 800);
      onChange(); return true;
    }
    function startMusic() {
      userPaused = false;
      if (CONFIG.MUSIC_FILE) {
        started = true; playing = true; onChange();
        try {
          const a = new Audio(CONFIG.MUSIC_FILE);
          a.loop = true; a.volume = 0.3; a.muted = muted;
          a.addEventListener('error', () => { fileEl = null; startSynth(); }, { once: true });
          const p = a.play();
          if (p && p.then) p.then(() => { fileEl = a; usingFile = true; onChange(); }).catch(() => { fileEl = null; startSynth(); });
        } catch (e) { startSynth(); }
        ensure();
        return;
      }
      startSynth();
    }
    function pauseMusic() {
      playing = false; userPaused = true;
      if (fileEl && usingFile) fileEl.pause();
      clearInterval(timer);
      if (ctx) {
        loopGains.forEach(g => { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) {} });
        const old = loopGains; loopGains = [];
        setTimeout(() => old.forEach(g => { try { g.disconnect(); } catch (e) {} }), 600);
      }
      onChange();
    }
    function resumeMusic() {
      userPaused = false; playing = true;
      if (fileEl && usingFile) { fileEl.play().catch(() => {}); onChange(); return; }
      startSynth();
    }

    /* --- sound effects --- */
    const SFX = {
      unlock(t) { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => bell(f, t + i * 0.11, 1.1, 0.16, sfxGain)); noise(t + .35, .7, .05, 'highpass', 4000); },
      pop(t) { noise(t, .12, .6, 'highpass', 1500); tone(380, t, .09, .35, 'triangle').frequency.exponentialRampToValueAtTime(70, t + .09); },
      confetti(t) {
        noise(t, .5, .08, 'bandpass', 900, 5000);
        const pent = [N.C5, N.D5, N.E5, N.G5, N.C6];
        for (let i = 0; i < 9; i++) bell(pent[i % 5] * (i > 4 ? 1 : 1), t + i * 0.07, .8, .1, sfxGain);
      },
      card(t) { noise(t, .35, .09, 'bandpass', 600, 3500); bell(N.E5, t + .3, 1, .13, sfxGain); bell(N.C6, t + .45, 1.2, .1, sfxGain); },
      candle(t) { noise(t, .45, .22, 'lowpass', 1800, 300); bell(N.G5, t + .1, 1.2, .1, sfxGain); bell(N.C5, t + .3, 1.4, .09, sfxGain); },
      relight(t) { noise(t, .25, .08, 'bandpass', 800, 2400); bell(N.E5, t + .05, .8, .09, sfxGain); },
      wrong(t) { tone(260, t, .16, .12, 'triangle'); tone(196, t + .14, .22, .12, 'triangle'); },
      tap(t) { bell(N.G5, t, .5, .08, sfxGain); }
    };
    function sfx(name) {
      if (!ensure() || !SFX[name]) return;
      try { SFX[name](ctx.currentTime + 0.01); } catch (e) { /* never break the experience over a sound */ }
    }

    function setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
      if (fileEl) fileEl.muted = muted;
      onChange();
    }

    return {
      ensure,
      onChange: fn => { onChange = fn; },
      get started() { return started; },
      get playing() { return playing; },
      get muted() { return muted; },
      get userPaused() { return userPaused; },
      get supported() { return !!(window.AudioContext || window.webkitAudioContext) || !!CONFIG.MUSIC_FILE; },
      start: startMusic,
      toggle() { if (!started) startMusic(); else if (playing) pauseMusic(); else resumeMusic(); },
      toggleMute() { ensure(); setMuted(!muted); },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
      wake() { if (ctx && ctx.state === 'suspended' && playing) ctx.resume().catch(() => {}); },
      sfx
    };
  })();

  /* ======================================================================
     EFFECTS — starry background, floating hearts, confetti
     ====================================================================== */
  const Stars = (() => {
    const canvas = $('#stars');
    const c = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    let w = 0, h = 0, stars = [], raf = 0, last = 0;
    function resize() {
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(120, Math.round(w * h / 10000));
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: rand(.7, 2), p: rand(0, 6.28), s: rand(.7, 1.9), sp: Math.random() < .16 }));
      draw(0);
    }
    function sparkle(x, y, r) {
      c.beginPath();
      c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
      c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
    }
    function draw(t) {
      if (!c) return;
      c.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = .3 + .7 * (.5 + .5 * Math.sin(t / 1000 * s.s + s.p));
        c.globalAlpha = a * .95; c.fillStyle = '#fff';
        if (s.sp) { c.shadowColor = 'rgba(255,140,200,.9)'; c.shadowBlur = 8; sparkle(s.x, s.y, s.r * 3.4); c.shadowBlur = 0; }
        else { c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill(); }
      }
      c.globalAlpha = 1;
    }
    function frame(ts) { raf = requestAnimationFrame(frame); if (ts - last < 34) return; last = ts; draw(ts); }
    function start() { if (!c || prefersReduced) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    function stop() { cancelAnimationFrame(raf); }
    return { init() { resize(); start(); window.addEventListener('resize', resize); }, start, stop };
  })();

  const Hearts = (() => {
    const box = $('#hearts');
    const colors = ['#ff9ec4', '#ffb3d1', '#e8a6ff', '#ffc2a8', '#ff86b3'];
    let timer = null, every = 2400;
    function spawn() {
      if (!box || document.hidden || box.children.length > 16) return;
      const el = document.createElement('span');
      el.className = 'heart-float'; el.textContent = Math.random() < .2 ? '✦' : '♥';
      el.style.setProperty('--x', rand(2, 96).toFixed(1) + '%');
      el.style.setProperty('--s', rand(14, 30).toFixed(0) + 'px');
      el.style.setProperty('--c', pick(colors));
      el.style.setProperty('--d', rand(10, 17).toFixed(1) + 's');
      el.style.setProperty('--sway', rand(-60, 60).toFixed(0) + 'px');
      el.style.setProperty('--rot', rand(-40, 40).toFixed(0) + 'deg');
      el.addEventListener('animationend', () => el.remove());
      box.appendChild(el);
    }
    function run(ms) { every = ms; clearInterval(timer); if (prefersReduced) return; timer = setInterval(spawn, every); spawn(); }
    return { run };
  })();

  const Confetti = (() => {
    const canvas = $('#confetti');
    const c = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    const COLORS = ['#ff9ec4', '#ffc2dc', '#cdb8f5', '#b5d8fb', '#ffd5bd', '#fff0a8', '#b8f0d8', '#ffffff', '#f7c948'];
    let w = 0, h = 0, dpr = 1, parts = [], raf = 0, last = 0, rainUntil = 0;
    function resize() {
      if (!c) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    function make(x, y, vx, vy) {
      return { x, y, vx, vy, s: rand(6, 12), rot: rand(0, 6.28), vr: rand(-8, 8), col: pick(COLORS),
               shape: pick(['r', 'r', 'c', 'h', 's']), life: 1, decay: rand(.18, .38), tilt: rand(0, 6.28) };
    }
    function burst(x, y, n = 36) {
      if (!c || prefersReduced) return;
      for (let i = 0; i < n && parts.length < 420; i++) {
        const a = rand(0, 6.283), sp = rand(120, 420);
        parts.push(make(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 140));
      }
      kick();
    }
    function celebrate(ms = 3800) {
      if (!c || prefersReduced) return;
      rainUntil = performance.now() + ms;
      burst(w * .25, h * .35, 40); burst(w * .75, h * .35, 40);
      kick();
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    function drawHeart(s) {
      c.beginPath(); c.moveTo(0, s * .35);
      c.bezierCurveTo(-s, -s * .2, -s * .5, -s * .9, 0, -s * .4);
      c.bezierCurveTo(s * .5, -s * .9, s, -s * .2, 0, s * .35); c.fill();
    }
    function drawStar(s) {
      c.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .25 : s * .7, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill();
    }
    function loop(now) {
      const dt = Math.min((now - last) / 1000, .05); last = now;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      if (now < rainUntil && parts.length < 300) {
        for (let i = 0; i < 3; i++) parts.push(make(rand(0, w), -12, rand(-40, 40), rand(60, 180)));
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 520 * dt; p.vx *= (1 - 1.4 * dt); p.vy *= (1 - .5 * dt);
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.tilt += dt * 6;
        p.life -= p.decay * dt * (p.y > h * .6 ? 1.5 : .6);
        if (p.life <= 0 || p.y > h + 30) { parts.splice(i, 1); continue; }
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, p.life * 1.6); c.fillStyle = p.col;
        if (p.shape === 'r') c.fillRect(-p.s / 2, -p.s / 4 * Math.abs(Math.cos(p.tilt)) - 1, p.s, p.s / 2 * Math.abs(Math.cos(p.tilt)) + 2);
        else if (p.shape === 'c') { c.beginPath(); c.arc(0, 0, p.s / 3, 0, 6.283); c.fill(); }
        else if (p.shape === 'h') drawHeart(p.s * .6);
        else drawStar(p.s);
        c.restore();
      }
      if (parts.length || now < rainUntil) raf = requestAnimationFrame(loop);
      else { raf = 0; c.clearRect(0, 0, w, h); }
    }
    return { init() { resize(); window.addEventListener('resize', resize); }, burst, celebrate };
  })();

  /* ======================================================================
     SCREEN SWITCHING
     ====================================================================== */
  const onEnter = {};
  function show(stage, instant) {
    const cur = $$('.screen').find(s => !s.hidden);
    const next = $('#screen-' + stage);
    if (!next) return;
    state.stage = stage; save();
    const swap = () => {
      if (cur && cur !== next) { cur.hidden = true; cur.classList.remove('leaving', 'visible'); }
      next.hidden = false;
      window.scrollTo(0, 0);
      if (onEnter[stage]) onEnter[stage]();
      requestAnimationFrame(() => requestAnimationFrame(() => next.classList.add('visible')));
    };
    if (cur && cur !== next && !instant && !prefersReduced) { cur.classList.add('leaving'); setTimeout(swap, 550); }
    else swap();
  }

  /* ======================================================================
     1. LOCK
     ====================================================================== */
  const Lock = (() => {
    const form = $('#pin-form'), lock = $('#lock'), msg = $('#pin-msg');
    const pins = [$('#pin1'), $('#pin2')];
    let busy = false, tries = 0;
    const WRONG = ["Oops! That's not it. Try again, birthday girl! 💕", "Hmm, still not it! You've got this, Mahi 💗", "So close! Think about your special day 🎂"];

    function say(t) { msg.textContent = t; }
    function clearErr() { pins.forEach(p => p.classList.remove('err')); }

    function init() {
      pins.forEach((el, i) => {
        el.addEventListener('input', () => {
          el.value = el.value.replace(/\D/g, '').slice(-1);
          clearErr(); if (!busy) say('');
          if (el.value && i === 0) pins[1].focus();
        });
        el.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !el.value && i === 1) { e.preventDefault(); pins[0].value = ''; pins[0].focus(); }
          else if (e.key === 'ArrowLeft' && i === 1) { e.preventDefault(); pins[0].focus(); }
          else if (e.key === 'ArrowRight' && i === 0) { e.preventDefault(); pins[1].focus(); }
        });
        el.addEventListener('focus', () => { try { el.select(); } catch (e) {} });
        el.addEventListener('paste', e => {
          const txt = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 2);
          if (!txt) return;
          e.preventDefault(); pins[0].value = txt[0] || ''; pins[1].value = txt[1] || ''; (txt[1] ? pins[1] : pins[1]).focus();
        });
      });
      form.addEventListener('submit', e => { e.preventDefault(); submit(); });

      // on-screen number keypad
      $('.keypad', form).addEventListener('click', e => {
        const k = e.target.closest('.key[data-k]'); if (!k || busy) return;
        Sound.sfx('tap'); clearErr(); say('');
        if (k.dataset.k === 'del') {
          if (pins[1].value) { pins[1].value = ''; pins[1].focus(); } else { pins[0].value = ''; pins[0].focus(); }
          return;
        }
        if (!pins[0].value) { pins[0].value = k.dataset.k; pins[1].focus(); }
        else if (!pins[1].value) { pins[1].value = k.dataset.k; pins[1].focus(); }
      });
    }

    function submit() {
      if (busy) return;
      const val = pins[0].value + pins[1].value;
      if (val.length < 2) {
        say('Please fill both little boxes 💕');
        (pins[0].value ? pins[1] : pins[0]).focus();
        return;
      }
      if (val === CONFIG.PIN) return success();
      tries++;
      say(WRONG[(tries - 1) % WRONG.length]);
      Sound.sfx('wrong');
      lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake');
      pins.forEach(p => p.classList.add('err'));
      setTimeout(() => { pins.forEach(p => { p.value = ''; }); clearErr(); pins[0].focus(); lock.classList.remove('shake'); }, 650);
    }

    function success() {
      busy = true;
      pins.forEach(p => { p.disabled = true; });
      say('Unlocked! 💗');
      lock.classList.add('open');
      Sound.sfx('unlock');
      const r = lock.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 46);
      setTimeout(() => Confetti.burst(r.left + r.width / 2, r.top + r.height / 3, 30), 350);
      Hearts.run(900);
      setTimeout(() => { show('balloons'); }, 1700);
    }
    return { init, focus() { if (!busy) pins[0].focus(); } };
  })();

  /* ======================================================================
     2. BALLOONS
     ====================================================================== */
  const Balloons = (() => {
    const field = $('#balloon-field'), countEl = $('#balloon-count'), dotsEl = $('#balloon-dots');
    const done = $('#balloon-done'), unlockBtn = $('#btn-unlock');
    const COLORS = ['#ffb3d1', '#c9b6ff', '#aedcff', '#ffd9b8', '#ffe6a8', '#b8f0d8', '#ff9fc6', '#d9c4ff', '#9fd0ff', '#ffc0c8'];
    const popped = new Set(state.popped);
    let finished = false;

    function build() {
      for (let i = 0; i < CONFIG.BALLOON_COUNT; i++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'balloon'; b.dataset.i = i;
        b.setAttribute('aria-label', `Balloon ${i + 1} of ${CONFIG.BALLOON_COUNT}. Pop it!`);
        b.style.setProperty('--c', COLORS[i % COLORS.length]);
        b.style.setProperty('--dur', (3.4 + (i % 5) * .45).toFixed(2) + 's');
        b.style.setProperty('--delay', (-(i * .37) % 3).toFixed(2) + 's');
        b.style.marginTop = (i % 3) * 8 + 'px';
        b.innerHTML = '<span class="b-body"></span><span class="b-knot"></span><span class="b-string"></span>';
        if (popped.has(i)) b.classList.add('gone');
        b.addEventListener('click', () => pop(b, i));
        field.appendChild(b);
        const dot = document.createElement('i'); if (popped.has(i)) dot.className = 'on'; dotsEl.appendChild(dot);
      }
      render();
      if (popped.size >= CONFIG.BALLOON_COUNT) finish(true);
    }

    function render() {
      countEl.textContent = `${popped.size} / ${CONFIG.BALLOON_COUNT} balloons popped`;
      $$('i', dotsEl).forEach((d, i) => d.classList.toggle('on', i < popped.size));
    }

    function pop(el, i) {
      if (popped.has(i) || el.classList.contains('popping')) return;
      popped.add(i); state.popped = Array.from(popped); save();
      const r = el.getBoundingClientRect();
      Sound.sfx('pop');
      Confetti.burst(r.left + r.width / 2, r.top + r.height * .35, 22);
      el.classList.add('popping');
      setTimeout(() => { el.classList.remove('popping'); el.classList.add('gone'); }, 850);
      render();
      if (popped.size >= CONFIG.BALLOON_COUNT) setTimeout(() => finish(false), 650);
    }

    function finish(instant) {
      if (finished) return; finished = true;
      done.hidden = false;
      if (!instant) {
        Confetti.celebrate(); Sound.sfx('confetti');
        setTimeout(() => { try { unlockBtn.focus({ preventScroll: false }); } catch (e) {} done.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 400);
      }
    }

    function init() {
      build();
      unlockBtn.addEventListener('click', () => {
        if (popped.size < CONFIG.BALLOON_COUNT) return;   // enforced
        Sound.sfx('unlock');
        Confetti.burst(window.innerWidth / 2, window.innerHeight / 2, 50);
        show('party');
      });
    }
    return { init };
  })();

  /* ======================================================================
     3. PARTY
     ====================================================================== */
  const Party = (() => {
    const wrap = $('#cake-wrap'), svg = $('#cake-svg');
    const wishBtn = $('#btn-wish'), wishMsg = $('#wish-msg');
    let candles = [], blown = false, cdTimer = null, io = null, entered = false;

    /* ---- cake ---- */
    function icingRow(x0, x1, y, r, fill) {
      let s = ''; const n = Math.max(2, Math.round((x1 - x0) / (r * 1.55))); const step = (x1 - x0) / n;
      for (let i = 0; i <= n; i++) s += `<circle cx="${(x0 + i * step).toFixed(1)}" cy="${y}" r="${r}" fill="${fill}" stroke="#f3b7d0" stroke-opacity=".5" stroke-width="1"/>`;
      return s;
    }
    function buildCake() {
      let s = `
      <defs>
        <linearGradient id="gBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3d6fc"/><stop offset="1" stop-color="#bca4f0"/></linearGradient>
        <linearGradient id="gMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9e8"/><stop offset="1" stop-color="#f6a9c9"/></linearGradient>
        <linearGradient id="gTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbf1"/><stop offset="1" stop-color="#ffe6d2"/></linearGradient>
        <linearGradient id="gFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9a3c"/><stop offset=".6" stop-color="#ffd35c"/><stop offset="1" stop-color="#fff6b8"/></linearGradient>
        <radialGradient id="gGlow"><stop offset="0" stop-color="#fff2a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd1ea" stop-opacity="0"/></radialGradient>
        <path id="mini-heart" d="M0 4 C-8 -3 -4 -9 0 -4 C4 -9 8 -3 0 4Z"/>
      </defs>
      <ellipse cx="160" cy="300" rx="146" ry="14" fill="#f4dff0"/>
      <ellipse cx="160" cy="296" rx="140" ry="13" fill="#fff" opacity=".9"/>
      <rect x="36" y="224" width="248" height="72" rx="18" fill="url(#gBottom)"/>
      <rect x="36" y="224" width="248" height="72" rx="18" fill="none" stroke="#fff" stroke-opacity=".5"/>
      ${icingRow(52, 268, 226, 8, '#fff6fb')}${icingRow(60, 260, 238, 4.5, '#ffe7f2')}${icingRow(50, 270, 292, 6, '#fff6fb')}
      <g fill="#fff" opacity=".85">${[70,104,138,182,216,250].map((x,i)=>`<circle cx="${x}" cy="${262+(i%2)*10}" r="3.2"/>`).join('')}</g>
      <g fill="#e66ba0" opacity=".8">${[88,160,232].map(x=>`<use href="#mini-heart" x="${x}" y="274" transform="translate(${x} 274) scale(1.1) translate(${-x} -274)"/>`).join('')}</g>
      <rect x="62" y="158" width="196" height="72" rx="16" fill="url(#gMid)"/>
      <rect x="62" y="158" width="196" height="72" rx="16" fill="none" stroke="#fff" stroke-opacity=".5"/>
      ${icingRow(76, 244, 160, 8, '#fff6fb')}${icingRow(84, 236, 172, 4.5, '#ffeaf3')}${icingRow(74, 246, 226, 6, '#fff6fb')}
      <g fill="#fff" opacity=".9">${[92,126,160,194,228].map((x,i)=>`<circle cx="${x}" cy="${196+(i%2)*10}" r="3.2"/>`).join('')}</g>
      <g fill="#c9b6ff">${[108,212].map(x=>`<use href="#mini-heart" x="${x}" y="206" transform="translate(${x} 206) scale(1.1) translate(${-x} -206)"/>`).join('')}</g>
      <rect x="88" y="102" width="144" height="62" rx="14" fill="url(#gTop)"/>
      <rect x="88" y="102" width="144" height="62" rx="14" fill="none" stroke="#fff" stroke-opacity=".6"/>
      <g id="candles"></g>
      ${icingRow(98, 222, 104, 8, '#fff2f8')}${icingRow(104, 216, 116, 4.5, '#ffe3ef')}${icingRow(98, 222, 160, 5.5, '#fff2f8')}
      <g fill="#f6a9c9" opacity=".9">${[112,144,176,208].map((x,i)=>`<circle cx="${x}" cy="${138+(i%2)*8}" r="3.2"/>`).join('')}</g>
      <g id="smoke"></g>`;
      svg.innerHTML = s;

      const g = $('#candles', svg), cols = ['#ff9ec4', '#fff', '#c9b6ff', '#fff', '#aedcff'];
      candles = [];
      for (let i = 0; i < 10; i++) {
        const x = 102 + i * (116 / 9);
        const cg = document.createElementNS(SVGNS, 'g'); cg.setAttribute('class', 'candle'); cg.dataset.x = x;
        const col = cols[i % cols.length];
        cg.innerHTML = `
          <rect x="${x - 3.5}" y="68" width="7" height="38" rx="2.5" fill="${col}" stroke="#e5a9c8" stroke-width=".8"/>
          <path d="M${x - 3.5} 78 l7 -4 M${x - 3.5} 88 l7 -4 M${x - 3.5} 98 l7 -4" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" fill="none"/>
          <line x1="${x}" y1="68" x2="${x}" y2="64" stroke="#7a5a6a" stroke-width="1.2"/>
          <g class="flame" style="animation-delay:${(-i * .07).toFixed(2)}s">
            <circle cx="${x}" cy="55" r="13" fill="url(#gGlow)"/>
            <path d="M${x} 42 C${x + 6} 50 ${x + 5} 62 ${x} 64 C${x - 5} 62 ${x - 6} 50 ${x} 42Z" fill="url(#gFlame)"/>
            <ellipse cx="${x}" cy="58" rx="2" ry="3.6" fill="#fffbe0"/>
          </g>`;
        g.appendChild(cg); candles.push(cg);
      }
    }

    function buildSparkles() {
      const box = $('#cake-sparkles'); const items = ['✦', '✧', '♥', '✦', '♥', '✧', '✦', '♥'];
      const pos = [[2, 12], [92, 8], [-4, 46], [98, 44], [6, 78], [90, 74], [48, -4], [24, 2]];
      items.forEach((ch, i) => {
        const sp = document.createElement('span');
        sp.textContent = ch; if (ch === '♥') sp.className = 'h';
        sp.style.left = pos[i][0] + '%'; sp.style.top = pos[i][1] + '%';
        sp.style.fontSize = rand(16, 28).toFixed(0) + 'px';
        sp.style.setProperty('--t', rand(2, 3.6).toFixed(1) + 's'); sp.style.setProperty('--dl', (-rand(0, 3)).toFixed(1) + 's');
        box.appendChild(sp);
      });
    }

    function smokeAt(x) {
      const g = $('#smoke', svg); if (!g) return;
      for (let k = 0; k < 2; k++) {
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('class', 'smoke'); c.setAttribute('cx', x); c.setAttribute('cy', 54); c.setAttribute('r', 3);
        c.setAttribute('fill', 'rgba(205,190,225,.8)'); c.style.setProperty('--dx', rand(-9, 9).toFixed(0) + 'px');
        c.style.animationDelay = (k * .15) + 's';
        c.addEventListener('animationend', () => c.remove()); g.appendChild(c);
      }
    }

    function showWish(instantly) {
      wishMsg.hidden = false; wrap.classList.add('glow');
      wishBtn.textContent = 'Light the candles again ✨';
      if (instantly) wishMsg.style.animation = 'none';
    }
    function blow() {
      blown = true; state.wished = true; save();
      Sound.sfx('candle');
      candles.forEach((c, i) => setTimeout(() => { c.classList.add('out'); smokeAt(parseFloat(c.dataset.x)); }, prefersReduced ? 0 : i * 110));
      setTimeout(() => {
        showWish(false);
        const r = wrap.getBoundingClientRect();
        Confetti.celebrate(2600); Confetti.burst(r.left + r.width / 2, r.top + r.height / 3, 40);
        Sound.sfx('confetti');
      }, prefersReduced ? 0 : 10 * 110 + 250);
    }
    function relight() {
      blown = false; state.wished = false; save();
      Sound.sfx('relight');
      candles.forEach(c => c.classList.remove('out'));
      wrap.classList.remove('glow'); wishMsg.hidden = true;
      wishBtn.innerHTML = 'Make a Wish &amp; Blow the Candles 🕯️';
    }

    /* ---- envelope / card ---- */
    const env = $('#envelope'), stage = $('#envelope-stage'), card = $('#env-card'), toggleBtn = $('#card-toggle'), seal = $('#env-seal');
    let cardOpen = false;
    function layoutCard() {
      if (!cardOpen) { card.style.maxHeight = ''; stage.style.paddingTop = ''; return; }
      const h = env.getBoundingClientRect().height;
      const full = card.scrollHeight;
      card.style.maxHeight = full + 'px';
      stage.style.paddingTop = Math.max(0, full - h * .4 + 22) + 'px';
    }
    function setCard(open) {
      cardOpen = open;
      env.classList.toggle('open', open);
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.textContent = open ? 'Close the card 💌' : 'Open the card 💌';
      seal.setAttribute('aria-label', open ? 'Envelope is open' : 'Open the envelope');
      seal.tabIndex = open ? -1 : 0;
      Sound.sfx('card');
      layoutCard();
      if (open) {
        const r = env.getBoundingClientRect();
        Confetti.burst(r.left + r.width / 2, r.top, 26);
        setTimeout(() => { try { card.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' }); } catch (e) {} }, 700);
      }
    }

    /* ---- countdown ---- */
    function renderCountdown() {
      const el = $('#countdown'); const now = new Date();
      const today = now.getMonth() === CONFIG.BIRTH_MONTH && now.getDate() === CONFIG.BIRTH_DAY;
      if (today) {
        if (el.dataset.mode !== 'today') { el.dataset.mode = 'today'; el.innerHTML = '<p class="cd-today">It\'s Your Special Day! 🎉</p>'; }
        return;
      }
      let target = new Date(now.getFullYear(), CONFIG.BIRTH_MONTH, CONFIG.BIRTH_DAY);
      if (target <= now) target = new Date(now.getFullYear() + 1, CONFIG.BIRTH_MONTH, CONFIG.BIRTH_DAY);
      let diff = Math.max(0, Math.floor((target - now) / 1000));
      const d = Math.floor(diff / 86400); diff %= 86400;
      const hh = Math.floor(diff / 3600); diff %= 3600;
      const mm = Math.floor(diff / 60), ss = diff % 60;
      if (el.dataset.mode !== 'count') {
        el.dataset.mode = 'count';
        el.innerHTML = `<p class="cd-label">Counting down to your birthday</p><div class="cd-row">
          ${['days', 'hours', 'mins', 'secs'].map(l => `<div class="cd-box"><b data-k="${l}">0</b><small>${l}</small></div>`).join('')}</div>`;
      }
      const set = (k, v) => { const n = $(`[data-k="${k}"]`, el); if (n) n.textContent = String(v).padStart(2, '0'); };
      set('days', d); set('hours', hh); set('mins', mm); set('secs', ss);
    }

    /* ---- reveal on scroll ---- */
    function setupReveal() {
      const items = $$('#screen-party .reveal');
      if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
      io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
      items.forEach(i => io.observe(i));
    }

    /* ---- surprise modal ---- */
    const modal = $('#surprise-modal'), openBtn = $('#btn-surprise'), closeBtn = $('#surprise-close');
    let lastFocus = null;
    function openModal() {
      lastFocus = document.activeElement; modal.hidden = false;
      Sound.sfx('confetti'); Confetti.celebrate(2200);
      setTimeout(() => closeBtn.focus(), 50);
    }
    function closeModal() { modal.hidden = true; Sound.sfx('tap'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

    /* ---- night stars (final section) ---- */
    function buildNight() {
      const box = $('#night-stars');
      for (let i = 0; i < 46; i++) {
        const s = document.createElement('i');
        s.style.setProperty('--x', rand(0, 100).toFixed(1) + '%'); s.style.setProperty('--y', rand(0, 100).toFixed(1) + '%');
        s.style.setProperty('--s', rand(1.5, 4).toFixed(1) + 'px'); s.style.setProperty('--t', rand(1.8, 4).toFixed(1) + 's'); s.style.setProperty('--dl', (-rand(0, 4)).toFixed(1) + 's');
        box.appendChild(s);
      }
    }

    function init() {
      buildCake(); buildSparkles(); buildNight();
      wishBtn.addEventListener('click', () => (blown ? relight() : blow()));
      env.addEventListener('click', e => { if (!cardOpen && e.target !== toggleBtn) setCard(true); });
      seal.addEventListener('click', e => { e.stopPropagation(); if (!cardOpen) setCard(true); });
      toggleBtn.addEventListener('click', () => setCard(!cardOpen));
      openBtn.addEventListener('click', openModal);
      closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
      window.addEventListener('resize', () => { if (cardOpen) layoutCard(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(cdTimer); else if (entered) { renderCountdown(); cdTimer = setInterval(renderCountdown, 1000); }
      });

      onEnter.party = () => {
        entered = true;
        Hearts.run(1500);
        renderCountdown(); clearInterval(cdTimer); cdTimer = setInterval(renderCountdown, 1000);
        setupReveal();
        if (state.wished) { blown = true; candles.forEach(c => c.classList.add('out')); showWish(true); }
        setTimeout(() => Confetti.celebrate(2400), 500);
      };
    }
    return { init };
  })();

  /* ======================================================================
     MUSIC UI
     ====================================================================== */
  const MusicUI = (() => {
    const box = $('#music'), toggle = $('#music-toggle'), mute = $('#music-mute');
    function sync() {
      box.classList.toggle('is-playing', Sound.playing);
      box.classList.toggle('is-muted', Sound.muted);
      toggle.setAttribute('aria-pressed', String(Sound.playing));
      toggle.setAttribute('aria-label', Sound.playing ? 'Pause music' : 'Play music');
      mute.setAttribute('aria-pressed', String(Sound.muted));
      mute.setAttribute('aria-label', Sound.muted ? 'Unmute' : 'Mute');
    }
    function init() {
      Sound.onChange(sync); sync();
      if (!Sound.supported) { box.hidden = true; return; }
      toggle.addEventListener('click', () => { Sound.ensure(); Sound.toggle(); });
      mute.addEventListener('click', () => { Sound.toggleMute(); });
      // Browsers block autoplay: start gently on the first real interaction anywhere.
      const first = e => {
        if (e.target && e.target.closest && e.target.closest('#music')) return;
        if (!Sound.started && !Sound.userPaused) Sound.start(); else Sound.ensure();
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, first, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (document.hidden) Sound.suspend(); else Sound.wake(); });
    }
    return { init };
  })();

  /* ======================================================================
     BOOT
     ====================================================================== */
  // shared with games.js (the optional mini-games)
  window.MahiFx = { Sound, Confetti, prefersReduced };

  function boot() {
    Stars.init(); Confetti.init(); Hearts.run(2600);
    Lock.init(); Balloons.init(); Party.init(); MusicUI.init();
    onEnter.balloons = () => Hearts.run(1800);
    show(state.stage, true);
    if (state.stage === 'lock') {
      // keep focus off the inputs on touch devices so the keyboard doesn't cover the lock
      if (window.matchMedia && matchMedia('(hover:hover)').matches) setTimeout(() => Lock.focus(), 400);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
