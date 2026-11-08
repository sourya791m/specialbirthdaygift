/* ==========================================================
   Mahi's Birthday Surprise — three optional mini-games
   1) Catch the Hearts  2) Mystery Gift Boxes  3) Decorate Your Cake
   Uses the site's existing sound + confetti (exposed by app.js as
   window.MahiFx) so the background music and controls are untouched.
   ========================================================== */
(() => {
  'use strict';

  const FX = window.MahiFx || {};
  const $ = (s, r = document) => r.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sfx = n => { try { if (FX.Sound) FX.Sound.sfx(n); } catch (e) { /* sound is optional */ } };
  const burst = (x, y, n) => { try { if (FX.Confetti) FX.Confetti.burst(x, y, n); } catch (e) {} };
  const celebrate = ms => { try { if (FX.Confetti) FX.Confetti.celebrate(ms); } catch (e) {} };
  const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const SVG_HEART = 'M0 4 C-8 -3 -4 -9 0 -4 C4 -9 8 -3 0 4Z';

  /* ======================================================================
     1. CATCH THE HEARTS
     ====================================================================== */
  function initHearts() {
    const field = $('#gh-field'); if (!field) return;
    const layer = $('#gh-hearts'), basket = $('#gh-basket'), overlay = $('#gh-overlay');
    const ovTitle = $('#gh-ov-title'), ovText = $('#gh-ov-text'), startBtn = $('#gh-start');
    const scoreEl = $('#gh-score'), timeEl = $('#gh-time'), status = $('#gh-status');
    const TARGET = 20, DURATION = 30;
    const COLORS = ['#ff7fae', '#ff9ec4', '#f06fa0', '#e58bd6', '#ffa6c1', '#ff86b3'];

    let state = 'idle', score = 0, timeLeft = DURATION, raf = 0, last = 0, spawnT = 0;
    let hearts = [], W = 320, H = 400, bw = 88, bh = 64, bx = 160, tx = 160, inView = true;
    let goLeft = false, goRight = false;

    function place() { basket.style.transform = 'translate3d(' + (bx - bw / 2).toFixed(1) + 'px,0,0)'; }
    function measure() {
      W = field.clientWidth || 320; H = field.clientHeight || 400;
      bw = basket.offsetWidth || 88; bh = basket.offsetHeight || 64;
      bx = clamp(bx, bw / 2, W - bw / 2); tx = clamp(tx, bw / 2, W - bw / 2); place();
    }

    function spawn() {
      const s = rand(28, 40);
      const el = document.createElement('span');
      el.className = 'gh-heart'; el.textContent = '♥';
      el.style.setProperty('--s', s.toFixed(0) + 'px');
      el.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
      const x = rand(4, Math.max(5, W - s - 4));
      el.style.left = x.toFixed(1) + 'px';
      el.style.transform = 'translate3d(0,' + (-s) + 'px,0)';
      layer.appendChild(el);
      const ramp = 1 + ((DURATION - timeLeft) / DURATION) * 0.35;      // gently speeds up
      hearts.push({ el, x, y: -s, s, v: rand(150, 225) * (H / 400) * ramp });
    }

    function plusOne(x, y) {
      const p = document.createElement('span');
      p.className = 'gh-plus'; p.textContent = '+1';
      p.style.left = x.toFixed(0) + 'px'; p.style.top = y.toFixed(0) + 'px';
      layer.appendChild(p); setTimeout(() => p.remove(), 850);
    }

    function caught(h) {
      h.el.remove();
      score++; scoreEl.textContent = score;
      plusOne(h.x, h.y - 10);
      basket.classList.remove('bump'); void basket.offsetWidth; basket.classList.add('bump');
      sfx('tap');
      const r = field.getBoundingClientRect();
      burst(r.left + h.x + h.s / 2, r.top + h.y, 8);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!inView) { last = now; return; }                     // pause while scrolled away
      const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
      timeLeft -= dt; spawnT -= dt;

      if (goLeft) tx -= 560 * dt;
      if (goRight) tx += 560 * dt;
      tx = clamp(tx, bw / 2, W - bw / 2);
      bx += (tx - bx) * Math.min(1, dt * 16); place();

      if (spawnT <= 0) { spawn(); spawnT = rand(0.45, 0.8) * (timeLeft < 10 ? 0.85 : 1); }

      const rim = H - 6 - bh;
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.y += h.v * dt;
        h.el.style.transform = 'translate3d(0,' + h.y.toFixed(1) + 'px,0)';
        const cx = h.x + h.s / 2;
        if (h.y + h.s * 0.85 >= rim + 8 && h.y <= H - 6 - bh * 0.35 && Math.abs(cx - bx) <= bw * 0.5 - 2) {
          hearts.splice(i, 1); caught(h);
        } else if (h.y > H + 10) { h.el.remove(); hearts.splice(i, 1); }
      }

      timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
      if (score >= TARGET) end(true);
      else if (timeLeft <= 0) end(false);
    }

    function clearLayer() { hearts = []; layer.innerHTML = ''; }

    function start() {
      cancelAnimationFrame(raf);
      clearLayer(); measure();
      state = 'playing'; score = 0; timeLeft = DURATION; spawnT = 0.2;
      bx = tx = W / 2; place();
      scoreEl.textContent = '0'; timeEl.textContent = String(DURATION);
      overlay.hidden = true; field.classList.add('is-playing'); status.textContent = 'Game started. Catch ' + TARGET + ' hearts!';
      try { field.focus({ preventScroll: true }); } catch (e) {}
      last = performance.now(); raf = requestAnimationFrame(frame);
    }

    function end(win) {
      cancelAnimationFrame(raf); raf = 0; state = 'over'; field.classList.remove('is-playing');
      goLeft = goRight = false;
      clearLayer();
      overlay.hidden = false;
      if (win) {
        ovTitle.textContent = 'You did it, Mahi! 🥳';
        ovText.textContent = 'You caught ' + score + ' hearts with ' + Math.max(0, Math.ceil(timeLeft)) + 's to spare. So sweet! 💗';
        startBtn.textContent = 'Play again 💕';
        sfx('unlock'); sfx('confetti'); celebrate(3000);
        const c = centerOf(field); burst(c.x, c.y, 50);
        status.textContent = 'You win! You caught ' + score + ' hearts.';
      } else {
        ovTitle.textContent = "Time's up! ⏰";
        ovText.textContent = 'You caught ' + score + ' of ' + TARGET + ' hearts. So close — try again!';
        startBtn.textContent = 'Try again 💕';
        sfx('wrong');
        status.textContent = "Time's up. You caught " + score + ' of ' + TARGET + ' hearts.';
      }
    }

    // controls: pointer / touch drag, mouse, and keyboard
    function pointTo(e) {
      if (state !== 'playing') return;
      const r = field.getBoundingClientRect();
      tx = clamp(e.clientX - r.left, bw / 2, W - bw / 2);
    }
    field.addEventListener('pointerdown', e => {
      if (state !== 'playing') return;            // never capture the pointer while the Start button is showing
      pointTo(e); try { field.setPointerCapture(e.pointerId); } catch (err) {}
    });
    field.addEventListener('pointermove', pointTo);
    field.addEventListener('keydown', e => {
      if (state !== 'playing') return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { goLeft = true; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { goRight = true; e.preventDefault(); }
    });
    field.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') goLeft = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') goRight = false;
    });
    field.addEventListener('blur', () => { goLeft = goRight = false; });
    startBtn.addEventListener('click', start);
    window.addEventListener('resize', measure);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; }), { threshold: 0 }).observe(field);
    }
    measure();
  }

  /* ======================================================================
     2. MYSTERY GIFT BOXES
     ====================================================================== */
  function initGifts() {
    const row = $('#gift-row'); if (!row) return;
    const reveal = $('#gift-reveal'), countEl = $('#gift-count');
    const GIFTS = [
      { e: '⚛️', g: '#ffb3d1', g2: '#f78fb8', r: '#fff6ec',
        title: 'Physics Ka Numerical 😂',
        t: "Q. 1 kg ka birthday cake table par rakha hai. Mahi ne us par 'ek aur slice!' ke barabar force lagaya. Cake ko gayab hone mein kitna time lagega? 🍰",
        a: "Ans: t = 0 s ⏱️ Cake seedha Mahi ke stomach mein displace ho gaya — no friction, no resistance, sirf happiness! (Unit: smiles 😄)" },
      { e: '🧸', g: '#c9b6ff', g2: '#ab92f0', r: '#fff6ec',
        title: 'Ek Cute Teddy Bear 🧸',
        t: 'Ye lo, ek soft sa teddy bear sirf tumhare liye! Jab bhi stress ya mood off ho, isse tight hug kar lena — aur yaad rakhna, ek dost hamesha tumhare saath hai. 💗' },
      { e: '📐', g: '#aedcff', g2: '#86c4f6', r: '#ffe3ef',
        title: 'Maths Ka Sawaal 📐',
        t: 'Q. Ek GP ka pehla term a = 1 aur common ratio r = 2 hai (1, 2, 4, 8, …). Agar Mahi ki khushiyan har saal isi GP mein double hoti rahein, toh pehle 10 saalon ki total khushi kitni hogi?',
        a: 'Ans: S10 = a(r^10 − 1)/(r − 1) = (2^10 − 1)/(2 − 1) = 1023 🎉 Yaani 1023 guna khushi — aur tum isse bhi zyada deserve karti ho! 💗' },
      { e: '🌍', g: '#ffd9b8', g2: '#f9bb90', r: '#fff',
        title: 'Duniya Ki Saari Khushiyan 🌍',
        t: 'Duniya ki saari khushiyan, saari hansi aur saara pyaar — sab kuch aaj sirf tumhare naam! Jahan bhi jao, smiles hi smiles milein. ✨💗' },
      { e: '🧭', g: '#b8f0d8', g2: '#8fdcbb', r: '#ffe3ef',
        title: 'Sahi Raasta, Hamesha 🧭',
        t: 'Hamesha life mein sahi raste par chalna, Mahi. Raasta chahe lamba ho ya mushkil, sahi raasta hi tumhe sabse khoobsurat manzil tak le jaayega. ✨' }
    ];
    const opened = new Set();

    function show(i, first) {
      const g = GIFTS[i];
      reveal.innerHTML = '<div class="gift-card"><span class="gift-emoji" aria-hidden="true">' + g.e + '</span>' +
        '<h5 class="gift-title"></h5><p class="gift-msg"></p></div>';
      const card = $('.gift-card', reveal);
      $('.gift-title', card).textContent = g.title;
      $('.gift-msg', card).textContent = g.t;
      if (g.a) {
        const a = document.createElement('p'); a.className = 'gift-ans'; a.textContent = g.a; card.appendChild(a);
      }
      if (first && opened.size === GIFTS.length) {
        const all = document.createElement('p');
        all.className = 'gift-all'; all.textContent = 'You opened all five, Mahi! 💗';
        card.appendChild(all);
      }
    }

    GIFTS.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gift'; b.dataset.i = i;
      b.style.setProperty('--g', g.g); b.style.setProperty('--g2', g.g2); b.style.setProperty('--r', g.r);
      b.style.setProperty('--dl', (i * 0.6).toFixed(1) + 's');
      b.setAttribute('aria-label', 'Gift box ' + (i + 1) + ' of ' + GIFTS.length + '. Closed. Open it!');
      b.innerHTML = '<span class="gift-body"></span><span class="gift-lid"><span class="gift-bow"></span></span>' +
        '<span class="gift-pop" aria-hidden="true">' + g.e + '</span><span class="gift-check" aria-hidden="true">✓</span>';
      b.addEventListener('click', () => {
        if (opened.has(i)) { sfx('tap'); show(i, false); return; }
        opened.add(i);
        b.classList.add('open');
        b.setAttribute('aria-label', 'Gift box ' + (i + 1) + ' of ' + GIFTS.length + '. Opened. Show message again.');
        countEl.textContent = opened.size + ' / ' + GIFTS.length + ' gifts opened';
        sfx('card');
        const c = centerOf(b); burst(c.x, c.y - 10, 30);
        show(i, true);
        if (opened.size === GIFTS.length) setTimeout(() => { sfx('confetti'); celebrate(2600); }, 500);
      });
      row.appendChild(b);
    });
  }

  /* ======================================================================
     3. DECORATE YOUR BIRTHDAY CAKE
     ====================================================================== */
  function initCake() {
    const svg = $('#dc-svg'); if (!svg) return;
    const groupsEl = $('#dc-groups'), controls = $('#dc-controls'), done = $('#dc-done');
    const card = $('#game-cake'), stage = $('#dc-stage'), finishBtn = $('#dc-finish'), editBtn = $('#dc-edit');

    const FROST = [
      { id: 'strawberry', name: 'Strawberry pink', a: '#ffc9de', b: '#f59bc2' },
      { id: 'lavender',   name: 'Lavender',        a: '#e6dbfc', b: '#b9a0ee' },
      { id: 'blue',       name: 'Baby blue',       a: '#d3e8fd', b: '#9ccaf5' },
      { id: 'vanilla',    name: 'Vanilla cream',   a: '#fff7e6', b: '#f1d9b0' },
      { id: 'peach',      name: 'Soft peach',      a: '#ffe3d1', b: '#f7b595' },
      { id: 'mint',       name: 'Mint',            a: '#d6f6e9', b: '#9fddc3' }
    ];
    const TOPPINGS = [
      { id: 'sprinkles', label: '🍬 Sprinkles' }, { id: 'strawberries', label: '🍓 Strawberries' },
      { id: 'cherries', label: '🍒 Cherries' }, { id: 'stars', label: '⭐ Gold stars' }
    ];
    const CANDLES = [
      { id: 'none', label: 'No candles', n: 0, colors: [] },
      { id: 'gold', label: '🕯️ One golden', n: 1, colors: ['#f7d774'], tall: true },
      { id: 'trio', label: 'Trio', n: 3, colors: ['#ff9ec4', '#fff', '#c9b6ff'] },
      { id: 'five', label: 'Five pink', n: 5, colors: ['#ff9ec4', '#fff'] },
      { id: 'ten', label: 'Ten pastel', n: 10, colors: ['#ff9ec4', '#fff', '#c9b6ff', '#aedcff', '#ffd9b8'] }
    ];
    const FLOWERS = [
      { id: 'none', label: 'No flowers' }, { id: 'blossom', label: '🌸 Blossoms' },
      { id: 'daisy', label: '🌼 Daisies' }, { id: 'lavender', label: '💜 Lavender' }
    ];
    const DECOS = [
      { id: 'pearls', label: '🤍 Pearls' }, { id: 'hearts', label: '💗 Hearts' },
      { id: 'bow', label: '🎀 Ribbon bow' }, { id: 'sparkles', label: '✨ Sparkles' }
    ];
    const sel = { frost: 0, toppings: new Set(['sprinkles']), candle: 'five', flower: 'blossom', deco: new Set(['pearls']) };

    /* --- drawing helpers --- */
    function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function row(x0, x1, y, r, fill, stroke) {
      let s = ''; const n = Math.max(2, Math.round((x1 - x0) / (r * 1.6))); const step = (x1 - x0) / n;
      for (let i = 0; i <= n; i++) s += '<circle cx="' + (x0 + i * step).toFixed(1) + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-opacity=".55"/>';
      return s;
    }
    function spark(x, y, r, fill, extra) {
      return '<path class="dc-spark" ' + (extra || '') + ' d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
        ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
    }
    function star(x, y, r) {
      let p = ''; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; p += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1); }
      return '<path d="' + p + 'Z" fill="#f7c948" stroke="#e0a82a" stroke-width=".6"/>';
    }
    function flower(x, y, r, type) {
      const cfg = type === 'daisy' ? { p: '#ffffff', c: '#ffcf4a', n: 8, s: '#ecd8ea' } : type === 'lavender' ? { p: '#b79bf0', c: '#fff3b0', n: 5, s: '#9a7fe0' } : { p: '#ff9ec4', c: '#ffe27a', n: 6, s: '#f07aa8' };
      let s = '<g>';
      s += '<ellipse cx="' + (x - r * 1.1) + '" cy="' + (y + r * 0.5) + '" rx="' + r * 0.7 + '" ry="' + r * 0.3 + '" fill="#8fd1a4" transform="rotate(-25 ' + (x - r * 1.1) + ' ' + (y + r * 0.5) + ')"/>';
      s += '<ellipse cx="' + (x + r * 1.1) + '" cy="' + (y + r * 0.5) + '" rx="' + r * 0.7 + '" ry="' + r * 0.3 + '" fill="#8fd1a4" transform="rotate(25 ' + (x + r * 1.1) + ' ' + (y + r * 0.5) + ')"/>';
      for (let i = 0; i < cfg.n; i++) {
        const a = i * 2 * Math.PI / cfg.n;
        s += '<circle cx="' + (x + Math.cos(a) * r * 0.78).toFixed(1) + '" cy="' + (y + Math.sin(a) * r * 0.78).toFixed(1) + '" r="' + (r * 0.5).toFixed(1) + '" fill="' + cfg.p + '" stroke="' + cfg.s + '" stroke-width=".7"/>';
      }
      return s + '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.4).toFixed(1) + '" fill="' + cfg.c + '"/></g>';
    }
    function strawberry(x, y) {
      let s = '<g transform="translate(' + x + ' ' + y + ')"><path d="M0 -9 C9 -9 11 3 0 11 C-11 3 -9 -9 0 -9Z" fill="#ff6f91" stroke="#e04a73" stroke-width=".8"/>';
      [[-4, -2], [3, -3], [0, 2], [-3, 5], [4, 3]].forEach(p => { s += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx=".9" ry="1.4" fill="#ffe3a8"/>'; });
      return s + '<path d="M-6 -9 L0 -14 L6 -9 L2 -7 L0 -9 L-2 -7Z" fill="#6fc28a"/></g>';
    }
    function cherry(x, y) {
      return '<g transform="translate(' + x + ' ' + y + ')"><path d="M0 -4 Q4 -16 10 -20" stroke="#5f9a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="0" cy="2" r="7" fill="#d6204f"/><circle cx="-2.4" cy="-0.5" r="2" fill="#fff" opacity=".55"/></g>';
    }
    function bow(x, y) {
      return '<g transform="translate(' + x + ' ' + y + ')" stroke="#a98be0" stroke-width="1.2">' +
        '<path d="M-2 4 L-10 18 L-3 15 Z M2 4 L10 18 L3 15 Z" fill="#b997ee"/>' +
        '<ellipse cx="-12" cy="0" rx="12" ry="7.5" fill="#c9a7f3" transform="rotate(-18 -12 0)"/>' +
        '<ellipse cx="12" cy="0" rx="12" ry="7.5" fill="#c9a7f3" transform="rotate(18 12 0)"/>' +
        '<circle cx="0" cy="1" r="5.5" fill="#b08be8"/></g>';
    }

    function render() {
      const f = FROST[sel.frost], cand = CANDLES.find(c => c.id === sel.candle);
      let s = '<defs>' +
        '<linearGradient id="dcBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + f.a + '"/><stop offset="1" stop-color="' + f.b + '"/></linearGradient>' +
        '<linearGradient id="dcFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9a3c"/><stop offset=".6" stop-color="#ffd35c"/><stop offset="1" stop-color="#fff6b8"/></linearGradient>' +
        '<radialGradient id="dcGlow"><stop offset="0" stop-color="#fff2a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd1ea" stop-opacity="0"/></radialGradient></defs>';
      s += '<ellipse cx="160" cy="304" rx="146" ry="12" fill="#f4dff0"/><ellipse cx="160" cy="299" rx="140" ry="11" fill="#fff" opacity=".92"/>';

      // bottom tier
      s += '<rect x="48" y="206" width="224" height="88" rx="18" fill="url(#dcBody)"/><rect x="48" y="206" width="224" height="88" rx="18" fill="none" stroke="#fff" stroke-opacity=".55"/>';
      s += row(62, 258, 208, 9, f.a, f.b) + row(70, 250, 221, 5, '#fff', f.b) + row(58, 262, 290, 6.5, f.a, f.b);
      // top tier
      s += '<rect x="84" y="140" width="152" height="72" rx="14" fill="url(#dcBody)"/><rect x="84" y="140" width="152" height="72" rx="14" fill="none" stroke="#fff" stroke-opacity=".55"/>';

      // candles (behind the top frosting)
      if (cand.n) {
        const h = cand.tall ? 46 : 34, w = cand.tall ? 9 : 7;
        for (let i = 0; i < cand.n; i++) {
          const x = cand.n === 1 ? 160 : 106 + i * (108 / (cand.n - 1));
          const col = cand.colors[i % cand.colors.length], top = 143 - h;
          s += '<g><rect x="' + (x - w / 2) + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="2.5" fill="' + col + '" stroke="#e5a9c8" stroke-width=".8"/>' +
            '<path d="M' + (x - w / 2) + ' ' + (top + 10) + ' l' + w + ' -4 M' + (x - w / 2) + ' ' + (top + 21) + ' l' + w + ' -4' + (cand.tall ? ' M' + (x - w / 2) + ' ' + (top + 32) + ' l' + w + ' -4' : '') + '" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" fill="none"/>' +
            '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (top - 3) + '" stroke="#7a5a6a" stroke-width="1.2"/>' +
            '<g class="dc-flame" style="animation-delay:' + (-i * 0.07).toFixed(2) + 's"><circle cx="' + x + '" cy="' + (top - 12) + '" r="13" fill="url(#dcGlow)"/>' +
            '<path d="M' + x + ' ' + (top - 26) + ' C' + (x + 6) + ' ' + (top - 18) + ' ' + (x + 5) + ' ' + (top - 5) + ' ' + x + ' ' + (top - 3) + ' C' + (x - 5) + ' ' + (top - 5) + ' ' + (x - 6) + ' ' + (top - 18) + ' ' + x + ' ' + (top - 26) + 'Z" fill="url(#dcFlame)"/>' +
            '<ellipse cx="' + x + '" cy="' + (top - 10) + '" rx="2" ry="3.6" fill="#fffbe0"/></g></g>';
        }
      }
      // top frosting
      s += row(96, 224, 142, 9, f.a, f.b) + row(104, 216, 155, 5, '#fff', f.b) + row(94, 226, 209, 5.5, f.a, f.b);

      // toppings
      if (sel.toppings.has('sprinkles')) {
        const rnd = mulberry(7), cols = ['#ff8fbd', '#8fc7ff', '#ffd966', '#a98be0', '#7be0b5', '#ffffff'];
        const put = (n, x0, x1, y0, y1) => { for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), a = Math.floor(rnd() * 180); s += '<rect x="' + (x - 3.5).toFixed(1) + '" y="' + (y - 1.3).toFixed(1) + '" width="7" height="2.6" rx="1.3" fill="' + cols[Math.floor(rnd() * cols.length)] + '" transform="rotate(' + a + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>'; } };
        put(16, 64, 256, 232, 278); put(11, 100, 220, 164, 200);
      }
      if (sel.toppings.has('stars')) [[96, 238], [224, 240], [160, 262], [118, 176], [204, 180]].forEach(p => { s += star(p[0], p[1], 7); });
      if (sel.toppings.has('strawberries')) [112, 160, 208].forEach(x => { s += strawberry(x, 137); });
      if (sel.toppings.has('cherries')) [136, 184].forEach(x => { s += cherry(x, 136); });

      // decorations
      if (sel.deco.has('pearls')) {
        for (let x = 64; x <= 256; x += 16) s += '<circle cx="' + x + '" cy="272" r="3.8" fill="#fff" stroke="#e8d9ee"/><circle cx="' + (x - 1) + '" cy="271" r="1.2" fill="#fff" opacity=".9"/>';
        for (let x = 100; x <= 220; x += 15) s += '<circle cx="' + x + '" cy="199" r="3.4" fill="#fff" stroke="#e8d9ee"/>';
      }
      if (sel.deco.has('hearts')) {
        [[92, 248], [228, 248], [160, 254]].forEach(p => { s += '<path d="' + SVG_HEART + '" fill="#fff" opacity=".92" transform="translate(' + p[0] + ' ' + p[1] + ') scale(1.5)"/>'; });
        [[116, 180], [204, 180]].forEach(p => { s += '<path d="' + SVG_HEART + '" fill="#e66ba0" opacity=".85" transform="translate(' + p[0] + ' ' + p[1] + ') scale(1.3)"/>'; });
      }
      if (sel.deco.has('bow')) s += bow(160, 176);

      // flowers (garland on the tier edges)
      if (sel.flower !== 'none') {
        [[58, 212, 11], [262, 212, 11], [92, 292, 10], [160, 296, 11], [228, 292, 10], [96, 146, 9], [224, 146, 9]].forEach(p => { s += flower(p[0], p[1], p[2], sel.flower); });
      }
      if (sel.deco.has('sparkles')) {
        [[26, 150, 9, '2.2s', '0s'], [296, 168, 8, '2.8s', '-1s'], [34, 262, 8, '2.4s', '-.5s'], [290, 250, 9, '3s', '-1.6s'], [88, 52, 7, '2.6s', '-.8s'], [236, 44, 8, '2.3s', '-1.2s'], [160, 26, 9, '2.9s', '-.3s']]
          .forEach(p => { s += spark(p[0], p[1], p[2], '#ffd966', 'style="--t:' + p[3] + ';--dl:' + p[4] + '"'); });
      }
      svg.innerHTML = s;
      svg.setAttribute('aria-label', 'Your cake with ' + f.name.toLowerCase() + ' frosting' +
        (cand.n ? ', ' + cand.n + ' candle' + (cand.n > 1 ? 's' : '') : '') + (sel.flower !== 'none' ? ', ' + sel.flower + ' flowers' : '') + '.');
    }

    /* --- controls --- */
    function chips(title, group, list, multi, swatch) {
      let h = '<div class="dc-group" role="group" aria-labelledby="dc-l-' + group + '"><p class="dc-label" id="dc-l-' + group + '">' + title + '</p><div class="dc-opts">';
      list.forEach((o, i) => {
        const on = multi ? sel[group].has(o.id) : (group === 'frost' ? sel.frost === i : sel[group] === o.id);
        if (swatch) h += '<button type="button" class="dc-swatch" data-g="' + group + '" data-id="' + i + '" style="--a:' + o.a + ';--b:' + o.b + '" aria-label="' + o.name + '" aria-pressed="' + on + '"></button>';
        else h += '<button type="button" class="dc-chip" data-g="' + group + '" data-id="' + o.id + '" aria-pressed="' + on + '">' + o.label + '</button>';
      });
      return h + '</div></div>';
    }
    function buildControls() {
      groupsEl.innerHTML = chips('Frosting colour', 'frost', FROST, false, true) + chips('Toppings (pick any)', 'toppings', TOPPINGS, true) +
        chips('Candles', 'candle', CANDLES, false) + chips('Flowers', 'flower', FLOWERS, false) + chips('Decorations (pick any)', 'deco', DECOS, true);
    }
    groupsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-g]'); if (!b) return;
      const g = b.dataset.g, id = b.dataset.id;
      if (g === 'frost') sel.frost = Number(id);
      else if (g === 'toppings' || g === 'deco') { if (sel[g].has(id)) sel[g].delete(id); else sel[g].add(id); }
      else sel[g] = id;
      buildControls();
      const again = groupsEl.querySelector('button[data-g="' + g + '"][data-id="' + id + '"]'); if (again) again.focus({ preventScroll: true });
      sfx('tap'); render();
      svg.classList.remove('dc-pop'); void svg.getBoundingClientRect(); svg.classList.add('dc-pop');
    });

    finishBtn.addEventListener('click', () => {
      controls.hidden = true; done.hidden = false; card.classList.add('is-done');
      sfx('unlock'); sfx('confetti'); celebrate(3200);
      try { stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      const c = centerOf(stage); burst(c.x, c.y, 44);
    });
    editBtn.addEventListener('click', () => {
      done.hidden = true; controls.hidden = false; card.classList.remove('is-done'); sfx('tap');
      try { stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    });

    buildControls(); render();
  }

  initHearts(); initGifts(); initCake();
})();
