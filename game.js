'use strict';
(() => {
  // ---------- Constants ----------
  const W = 1600, H = 1000, PR = 18;
  const SPEED = 270, BULLET_SPEED = 780, BULLET_LIFE = 1.1, DMG = 20;
  const FIRE_CD = 0.2, RAPID_CD = 0.09;
  const DASH_TIME = 0.14, DASH_MULT = 3.4, DASH_CD = 1.6;
  const RESPAWN = 2, INVULN = 1.2, WIN_KILLS = 15, ROUND_TIME = 180, BUFF_TIME = 7;
  const MAX_PLAYERS = 4, MAX_PICKUPS = 3, PICKUP_EVERY = 6;
  const COLORS = ['#ff2e88', '#2ee6ff', '#ffd23f', '#7cff6b'];
  const PEER_PREFIX = 'neon-arena-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  const WALLS = [
    [700, 470, 200, 60], [770, 400, 60, 200],          // center cross
    [300, 200, 200, 40], [1100, 200, 200, 40],
    [300, 760, 200, 40], [1100, 760, 200, 40],
    [200, 420, 40, 160], [1360, 420, 40, 160],
    [560, 110, 40, 150], [1000, 110, 40, 150],
    [560, 740, 40, 150], [1000, 740, 40, 150],
  ];
  const SPAWNS = [[90, 90], [1510, 910], [1510, 90], [90, 910], [800, 70], [800, 930], [70, 500], [1530, 500]];
  const PICK_TYPES = ['heal', 'speed', 'rapid', 'triple'];
  const PICK_LOOK = {
    heal:   { color: '#7cff6b', label: '+' },
    speed:  { color: '#2ee6ff', label: '»' },
    rapid:  { color: '#ffd23f', label: '≡' },
    triple: { color: '#ff2e88', label: '⋔' },
  };
  const PICK_NAMES = { heal: 'аптечку', speed: 'скорость', rapid: 'скорострельность', triple: 'тройной выстрел' };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = v => Math.round(v * 10) / 10;

  function collide(o) {
    o.x = clamp(o.x, PR, W - PR);
    o.y = clamp(o.y, PR, H - PR);
    for (const [wx, wy, ww, wh] of WALLS) {
      const cx = clamp(o.x, wx, wx + ww), cy = clamp(o.y, wy, wy + wh);
      const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= PR * PR) continue;
      if (d2 === 0) {
        const l = o.x - wx, r = wx + ww - o.x, t = o.y - wy, b = wy + wh - o.y, m = Math.min(l, r, t, b);
        if (m === l) o.x = wx - PR; else if (m === r) o.x = wx + ww + PR;
        else if (m === t) o.y = wy - PR; else o.y = wy + wh + PR;
      } else {
        const d = Math.sqrt(d2);
        o.x = cx + dx / d * PR; o.y = cy + dy / d * PR;
      }
    }
  }
  const inWall = (x, y, pad = 0) => WALLS.some(([wx, wy, ww, wh]) =>
    x >= wx - pad && x <= wx + ww + pad && y >= wy - pad && y <= wy + wh + pad);

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('c'), ctx = canvas.getContext('2d');
  const ui = {
    lobby: $('lobby'), name: $('name'), create: $('create'), code: $('code'), join: $('join'),
    status: $('status'), room: $('room'), roomCode: $('roomCode'), copy: $('copy'),
  };
  try { ui.name.value = localStorage.getItem('na-name') || ''; } catch {}
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) ui.code.value = urlRoom.toUpperCase();

  // ---------- Sound ----------
  let actx = null, muted = false;
  function sfx(kind, vol = 1) {
    if (muted || !actx) return;
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const spec = {
      shot:   ['square',   900, 240, 0.07, 0.035],
      hit:    ['sawtooth', 220, 60,  0.12, 0.06],
      kill:   ['triangle', 300, 950, 0.28, 0.09],
      pickup: ['sine',     600, 1300, 0.16, 0.07],
      dash:   ['sine',     320, 140, 0.1,  0.05],
      spawn:  ['triangle', 200, 500, 0.2,  0.05],
    }[kind];
    if (!spec) return;
    const [type, f0, f1, dur, gain] = spec;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function initAudio() {
    if (!actx) { try { actx = new AudioContext(); } catch {} }
    if (actx && actx.state === 'suspended') actx.resume();
  }

  // ---------- Input ----------
  const keys = { up: 0, down: 0, left: 0, right: 0, fire: false, dash: false };
  const mouse = { x: 0, y: 0 };
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  addEventListener('keydown', e => {
    if (!started) return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = 1; e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { keys.dash = true; e.preventDefault(); }
    if (e.code === 'KeyM' && !e.repeat) muted = !muted;
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = 0; });
  addEventListener('blur', () => { keys.up = keys.down = keys.left = keys.right = 0; keys.fire = false; });
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) keys.fire = true; initAudio(); });
  addEventListener('mouseup', e => { if (e.button === 0) keys.fire = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- Networking ----------
  let peer = null, isHost = false, myId = -1, started = false, roomCode = '', hostConn = null;
  const conns = new Map(); // slot -> conn (host only)

  function setStatus(t) { ui.status.textContent = t; }
  function playerName() {
    const n = ui.name.value.trim().slice(0, 12) || 'Игрок';
    try { localStorage.setItem('na-name', n); } catch {}
    return n;
  }
  function randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  function createRoom() {
    initAudio();
    const name = playerName();
    const code = randomCode();
    setStatus('Создаю комнату…');
    if (peer) peer.destroy();
    peer = new Peer(PEER_PREFIX + code, { debug: 0 });
    peer.on('open', () => {
      isHost = true; roomCode = code;
      host.addPlayer(0, name);
      myId = 0;
      peer.on('connection', onHostConnection);
      startGame();
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') return createRoom();
      setStatus('Ошибка: ' + (err.type || err.message));
    });
  }

  function onHostConnection(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        let slot = -1;
        for (let i = 1; i < MAX_PLAYERS; i++) if (!host.S.players[i]) { slot = i; break; }
        if (slot < 0) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        conn.slot = slot;
        conns.set(slot, conn);
        host.addPlayer(slot, String(msg.name || 'Игрок').slice(0, 12));
        conn.send({ t: 'welcome', id: slot, code: roomCode });
      } else if (msg.t === 'in' && conn.slot != null) {
        host.applyInput(conn.slot, msg);
      }
    });
    conn.on('close', () => {
      if (conn.slot != null) { conns.delete(conn.slot); host.removePlayer(conn.slot); }
    });
  }

  function joinRoom() {
    initAudio();
    const code = ui.code.value.trim().toUpperCase();
    if (code.length !== 4) return setStatus('Введи код из 4 букв');
    const name = playerName();
    setStatus('Подключаюсь…');
    if (peer) peer.destroy();
    peer = new Peer({ debug: 0 });
    peer.on('open', () => {
      hostConn = peer.connect(PEER_PREFIX + code, { serialization: 'json' });
      const timeout = setTimeout(() => setStatus('Не удалось подключиться. Проверь код.'), 10000);
      hostConn.on('open', () => hostConn.send({ t: 'hello', name }));
      hostConn.on('data', msg => {
        if (msg.t === 'welcome') {
          clearTimeout(timeout);
          myId = msg.id; roomCode = msg.code;
          startGame();
        } else if (msg.t === 'full') {
          clearTimeout(timeout);
          setStatus('Комната заполнена (макс. 4 игрока)');
        } else if (msg.t === 's') {
          onSnapshot(msg);
        }
      });
      hostConn.on('close', () => { if (started) hostLeft = true; });
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') setStatus('Комната не найдена');
      else setStatus('Ошибка: ' + (err.type || err.message));
    });
  }

  ui.create.onclick = createRoom;
  ui.join.onclick = joinRoom;
  ui.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  ui.copy.onclick = () => {
    const link = location.origin + location.pathname + '?room=' + roomCode;
    navigator.clipboard?.writeText(link).then(() => {
      ui.copy.textContent = 'Скопировано!';
      setTimeout(() => (ui.copy.textContent = 'Скопировать ссылку'), 1500);
    });
  };

  // ---------- Host simulation (authoritative for combat) ----------
  const host = {
    S: null,
    init() {
      this.S = { players: {}, bullets: [], pickups: [], nextB: 1, nextP: 1, time: ROUND_TIME,
                 phase: 'play', winner: null, overT: 0, pickT: 3, events: [] };
    },
    ev(e) { this.S.events.push(e); },
    addPlayer(slot, name) {
      if (!this.S) this.init();
      const p = { id: slot, name, x: 0, y: 0, a: 0, hp: 100, alive: false, respT: 0, inv: 0,
                  kills: 0, deaths: 0, cd: 0, buffs: { speed: 0, rapid: 0, triple: 0 },
                  spawnId: 0, fire: false };
      this.S.players[slot] = p;
      this.spawn(p);
      this.ev({ k: 'join', n: name });
    },
    removePlayer(slot) {
      const p = this.S.players[slot];
      if (!p) return;
      delete this.S.players[slot];
      this.ev({ k: 'left', n: p.name });
    },
    spawn(p) {
      const others = Object.values(this.S.players).filter(o => o !== p && o.alive);
      let best = SPAWNS[0], bestD = -1;
      for (const s of SPAWNS) {
        const d = others.length ? Math.min(...others.map(o => Math.hypot(o.x - s[0], o.y - s[1]))) : Math.random() * 1000;
        if (d > bestD) { bestD = d; best = s; }
      }
      p.x = best[0]; p.y = best[1]; p.hp = 100; p.alive = true; p.inv = INVULN;
      p.buffs = { speed: 0, rapid: 0, triple: 0 }; p.spawnId++;
      p.a = Math.atan2(H / 2 - p.y, W / 2 - p.x);
    },
    applyInput(slot, msg) {
      const p = this.S.players[slot];
      if (!p) return;
      if (typeof msg.a === 'number') p.a = msg.a;
      p.fire = !!msg.f;
      if (p.alive && msg.s === p.spawnId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        p.x = clamp(msg.x, PR, W - PR); p.y = clamp(msg.y, PR, H - PR);
      }
    },
    fire(p) {
      const spread = p.buffs.triple > 0 ? [-0.16, 0, 0.16] : [0];
      for (const off of spread) {
        const a = p.a + off;
        this.S.bullets.push({ id: this.S.nextB++, o: p.id,
          x: p.x + Math.cos(a) * (PR + 6), y: p.y + Math.sin(a) * (PR + 6),
          vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: BULLET_LIFE });
      }
      this.ev({ k: 'shot', id: p.id });
    },
    damage(p, ownerId, x, y) {
      p.hp -= DMG;
      this.ev({ k: 'hit', id: p.id, x: Math.round(x), y: Math.round(y) });
      if (p.hp > 0) return;
      p.hp = 0; p.alive = false; p.respT = RESPAWN; p.deaths++;
      const killer = this.S.players[ownerId];
      if (killer) killer.kills++;
      this.ev({ k: 'kill', a: ownerId, b: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      if (killer && killer.kills >= WIN_KILLS) this.endRound();
    },
    endRound() {
      const S = this.S;
      if (S.phase === 'over') return;
      S.phase = 'over'; S.overT = 8; S.bullets = [];
      const ranked = Object.values(S.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      S.winner = ranked[0] ? ranked[0].id : null;
      this.ev({ k: 'over' });
    },
    resetRound() {
      const S = this.S;
      S.phase = 'play'; S.time = ROUND_TIME; S.winner = null; S.bullets = []; S.pickups = []; S.pickT = 3;
      for (const p of Object.values(S.players)) { p.kills = 0; p.deaths = 0; p.alive = false; }
      for (const p of Object.values(S.players)) this.spawn(p);
      this.ev({ k: 'round' });
    },
    step(dt) {
      const S = this.S;
      if (S.phase === 'over') {
        S.overT -= dt;
        if (S.overT <= 0) this.resetRound();
        return;
      }
      S.time -= dt;
      if (S.time <= 0) { S.time = 0; this.endRound(); return; }

      for (const p of Object.values(S.players)) {
        if (!p.alive) {
          p.respT -= dt;
          if (p.respT <= 0) this.spawn(p);
          continue;
        }
        p.inv = Math.max(0, p.inv - dt);
        for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
        p.cd -= dt;
        if (p.fire && p.cd <= 0) { this.fire(p); p.cd = p.buffs.rapid > 0 ? RAPID_CD : FIRE_CD; }
        for (let i = S.pickups.length - 1; i >= 0; i--) {
          const k = S.pickups[i];
          if (Math.hypot(k.x - p.x, k.y - p.y) > PR + 16) continue;
          if (k.type === 'heal') p.hp = Math.min(100, p.hp + 50);
          else p.buffs[k.type] = BUFF_TIME;
          S.pickups.splice(i, 1);
          this.ev({ k: 'pick', id: p.id, type: k.type, x: Math.round(k.x), y: Math.round(k.y) });
        }
      }

      for (let i = S.bullets.length - 1; i >= 0; i--) {
        const b = S.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > W || b.y > H;
        if (!dead && inWall(b.x, b.y)) {
          dead = true;
          this.ev({ k: 'spark', x: Math.round(b.x), y: Math.round(b.y), o: b.o });
        }
        if (!dead) {
          for (const p of Object.values(S.players)) {
            if (!p.alive || p.id === b.o || p.inv > 0) continue;
            if (Math.hypot(p.x - b.x, p.y - b.y) < PR + 4) {
              this.damage(p, b.o, b.x, b.y);
              dead = true;
              break;
            }
          }
        }
        if (dead) S.bullets.splice(i, 1);
        if (S.phase === 'over') return;
      }

      S.pickT -= dt;
      if (S.pickT <= 0) {
        S.pickT = PICKUP_EVERY;
        if (S.pickups.length < MAX_PICKUPS) {
          for (let tries = 0; tries < 30; tries++) {
            const x = 80 + Math.random() * (W - 160), y = 80 + Math.random() * (H - 160);
            if (inWall(x, y, 30)) continue;
            S.pickups.push({ id: S.nextP++, type: PICK_TYPES[Math.floor(Math.random() * PICK_TYPES.length)], x, y });
            break;
          }
        }
      }
    },
    snapshot() {
      const S = this.S;
      const snap = {
        t: 's', ph: S.phase, tm: r1(S.time), w: S.winner, ot: r1(S.overT),
        p: Object.values(S.players).map(p => [p.id, p.name, Math.round(p.x), Math.round(p.y), r1(p.a * 10) / 10,
          p.hp, p.alive ? 1 : 0, p.kills, p.deaths, p.inv > 0 ? 1 : 0, p.spawnId,
          r1(p.buffs.speed), r1(p.buffs.rapid), r1(p.buffs.triple), r1(Math.max(0, p.respT))]),
        b: S.bullets.map(b => [b.id, b.o, Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)]),
        k: S.pickups.map(k => [k.id, k.type, Math.round(k.x), Math.round(k.y)]),
        e: S.events,
      };
      S.events = [];
      return snap;
    },
  };

  // Host loop runs on a timer, not requestAnimationFrame, so the room keeps
  // running for everyone if the host's tab loses focus.
  let hostLast = 0, hostAcc = 0, sendAcc = 0;
  function hostTick() {
    const now = performance.now();
    let dt = Math.min(0.25, (now - hostLast) / 1000);
    hostLast = now;
    // host's own input
    host.applyInput(0, localInputMsg());
    hostAcc += dt;
    while (hostAcc >= 1 / 60) { host.step(1 / 60); hostAcc -= 1 / 60; }
    sendAcc += dt;
    if (sendAcc >= 1 / 30) {
      sendAcc = 0;
      const snap = host.snapshot();
      for (const c of conns.values()) if (c.open) c.send(snap);
      onSnapshot(snap);
    }
  }

  // ---------- Client view state ----------
  const view = { players: {}, bullets: [], pickups: [], phase: 'play', time: ROUND_TIME, winner: null, overT: 0, snapAt: 0 };
  const local = { x: 0, y: 0, a: 0, spawnId: -1, dashT: 0, dashCd: 0, ddx: 0, ddy: 0 };
  const particles = [], feed = [];
  let shake = 0, hostLeft = false;

  function onSnapshot(s) {
    const now = performance.now();
    const seen = new Set();
    for (const a of s.p) {
      const [id, name, x, y, ang, hp, alive, kills, deaths, inv, spawnId, bs, br, bt, respT] = a;
      seen.add(id);
      let p = view.players[id];
      if (!p) p = view.players[id] = { rx: x, ry: y, ra: ang };
      if (p.spawnId !== spawnId) { p.rx = x; p.ry = y; }
      Object.assign(p, { id, name, x, y, a: ang, hp, alive: !!alive, kills, deaths, inv: !!inv, spawnId,
                         buffs: { speed: bs, rapid: br, triple: bt }, respT, color: COLORS[id] });
    }
    for (const id in view.players) if (!seen.has(+id)) delete view.players[id];
    view.bullets = s.b.map(([id, o, x, y, vx, vy]) => ({ id, o, x, y, vx, vy }));
    view.pickups = s.k.map(([id, type, x, y]) => ({ id, type, x, y }));
    view.phase = s.ph; view.time = s.tm; view.winner = s.w; view.overT = s.ot; view.snapAt = now;
    for (const e of s.e) handleEvent(e);
  }

  function burst(x, y, color, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 2 + Math.random() * 3 });
    }
  }
  function addFeed(text, color = '#ececf4') {
    feed.push({ text, color, t: 5 });
    if (feed.length > 5) feed.shift();
  }
  const nameOf = id => (view.players[id] ? view.players[id].name : '?');

  function handleEvent(e) {
    switch (e.k) {
      case 'shot': sfx('shot', e.id === myId ? 1 : 0.4); break;
      case 'hit':
        burst(e.x, e.y, COLORS[e.id] || '#fff', 8, 220, 0.35);
        sfx('hit', e.id === myId ? 1 : 0.5);
        if (e.id === myId) shake = 8;
        break;
      case 'spark': burst(e.x, e.y, COLORS[e.o] || '#fff', 4, 140, 0.25); break;
      case 'kill':
        burst(e.x, e.y, COLORS[e.b] || '#fff', 34, 380, 0.8);
        sfx('kill', e.a === myId || e.b === myId ? 1 : 0.5);
        if (e.b === myId) shake = 16;
        addFeed(`${nameOf(e.a)} ⟶ ${nameOf(e.b)}`, COLORS[e.a]);
        break;
      case 'pick':
        burst(e.x, e.y, PICK_LOOK[e.type].color, 14, 200, 0.5);
        if (e.id === myId) sfx('pickup');
        addFeed(`${nameOf(e.id)} взял ${PICK_NAMES[e.type]}`, PICK_LOOK[e.type].color);
        break;
      case 'join': addFeed(`${e.n} зашёл`, '#8b8ba3'); break;
      case 'left': addFeed(`${e.n} вышел`, '#8b8ba3'); break;
      case 'round': addFeed('Новый раунд!', '#ff2e88'); sfx('spawn'); break;
    }
  }

  // ---------- Local movement (each player moves themselves) ----------
  let scale = 1, ox = 0, oy = 0;
  function localStep(dt) {
    const me = view.players[myId];
    if (!me || !me.alive || view.phase !== 'play') return;
    if (me.spawnId !== local.spawnId) {
      local.x = me.x; local.y = me.y; local.spawnId = me.spawnId; local.dashT = 0;
      if (local.spawnId > 1) sfx('spawn');
    }
    let mx = keys.right - keys.left, my = keys.down - keys.up;
    const len = Math.hypot(mx, my);
    if (len) { mx /= len; my /= len; }
    local.a = Math.atan2((mouse.y - oy) / scale - local.y, (mouse.x - ox) / scale - local.x);
    local.dashCd -= dt;
    if (keys.dash && local.dashCd <= 0) {
      local.dashT = DASH_TIME; local.dashCd = DASH_CD;
      local.ddx = len ? mx : Math.cos(local.a); local.ddy = len ? my : Math.sin(local.a);
      sfx('dash');
      burst(local.x, local.y, COLORS[myId], 10, 160, 0.3);
    }
    keys.dash = false;
    const sp = SPEED * (me.buffs.speed > 0 ? 1.45 : 1);
    let vx = mx * sp, vy = my * sp;
    if (local.dashT > 0) { local.dashT -= dt; vx = local.ddx * sp * DASH_MULT; vy = local.ddy * sp * DASH_MULT; }
    local.x += vx * dt; local.y += vy * dt;
    collide(local);
  }
  function localInputMsg() {
    return { t: 'in', x: Math.round(local.x), y: Math.round(local.y), a: r1(local.a * 10) / 10,
             f: keys.fire && view.phase === 'play', s: local.spawnId };
  }

  // ---------- Rendering ----------
  let dpr = 1, vw = 0, vh = 0;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    vw = innerWidth; vh = innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  }
  addEventListener('resize', resize);
  resize();

  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow() { ctx.shadowBlur = 0; }

  function drawWorld(now) {
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 50; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 50; y < H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // border
    glow('#ff2e88', 18); ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);
    // walls
    for (const [x, y, w, h] of WALLS) {
      noGlow(); ctx.fillStyle = '#141422'; ctx.fillRect(x, y, w, h);
      glow('#ff2e88', 10); ctx.strokeStyle = '#ff2e88aa'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    }
    // pickups
    for (const k of view.pickups) {
      const look = PICK_LOOK[k.type], pulse = 1 + Math.sin(now / 200 + k.id) * 0.12;
      glow(look.color, 18); ctx.strokeStyle = look.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(k.x, k.y, 15 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = look.color; ctx.font = 'bold 20px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(look.label, k.x, k.y + 1);
    }
    // bullets (extrapolated between snapshots)
    const since = Math.min(0.15, (now - view.snapAt) / 1000);
    for (const b of view.bullets) {
      const x = b.x + b.vx * since, y = b.y + b.vy * since;
      const c = COLORS[b.o] || '#fff';
      glow(c, 14); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - b.vx * 0.02, y - b.vy * 0.02); ctx.stroke();
    }
    // players
    for (const p of Object.values(view.players)) {
      if (!p.alive) continue;
      const mine = p.id === myId;
      const x = mine ? local.x : p.rx, y = mine ? local.y : p.ry, a = mine ? local.a : p.ra;
      if (p.inv && Math.floor(now / 90) % 2) continue;
      glow(p.color, p.buffs.speed > 0 ? 30 : 20);
      ctx.fillStyle = '#0b0b14'; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, PR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // gun
      ctx.lineWidth = p.buffs.triple > 0 ? 8 : 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
      ctx.lineTo(x + Math.cos(a) * (PR + 12), y + Math.sin(a) * (PR + 12)); ctx.stroke();
      ctx.lineCap = 'butt';
      if (mine) {
        noGlow(); ctx.strokeStyle = p.color + '55'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, PR + 7, 0, Math.PI * 2); ctx.stroke();
      }
      // name + hp
      noGlow();
      ctx.font = '600 14px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = p.color; ctx.fillText(p.name, x, y - PR - 12);
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(x - 22, y - PR - 9, 44, 4);
      ctx.fillStyle = p.hp > 40 ? '#7cff6b' : '#ff4b4b'; ctx.fillRect(x - 22, y - PR - 9, 44 * p.hp / 100, 4);
    }
    // particles
    noGlow();
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  function fmtTime(t) {
    const s = Math.max(0, Math.ceil(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawHud() {
    noGlow();
    const F = 'ui-monospace, Consolas, monospace';
    // timer
    ctx.font = `700 26px ${F}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = view.time < 30 && view.phase === 'play' ? '#ff4b4b' : '#ececf4';
    ctx.fillText(fmtTime(view.time), vw / 2, 14);
    // scoreboard
    const ranked = Object.values(view.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    ctx.textAlign = 'right'; ctx.font = `600 15px ${F}`;
    ranked.forEach((p, i) => {
      ctx.fillStyle = p.color;
      ctx.fillText(`${p.name}  ${p.kills} / ${p.deaths}`, vw - 16, 16 + i * 22);
    });
    // feed
    ctx.textAlign = 'left'; ctx.font = `14px ${F}`;
    feed.forEach((f, i) => {
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 16, 16 + i * 20);
    });
    ctx.globalAlpha = 1;
    // my buffs / dash
    const me = view.players[myId];
    if (me) {
      const items = [];
      if (me.buffs.speed > 0) items.push(['» скорость', PICK_LOOK.speed.color, me.buffs.speed]);
      if (me.buffs.rapid > 0) items.push(['≡ скорострельность', PICK_LOOK.rapid.color, me.buffs.rapid]);
      if (me.buffs.triple > 0) items.push(['⋔ тройной', PICK_LOOK.triple.color, me.buffs.triple]);
      items.push([local.dashCd <= 0 ? 'рывок готов' : `рывок ${local.dashCd.toFixed(1)}`, local.dashCd <= 0 ? '#ececf4' : '#8b8ba3', 0]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `14px ${F}`;
      const text = items.map(([t, , s]) => s ? `${t} ${Math.ceil(s)}` : t);
      let x = vw / 2 - (items.length - 1) * 95;
      items.forEach(([, c], i) => { ctx.fillStyle = c; ctx.fillText(text[i], x + i * 190, vh - 14); });
      if (!me.alive && view.phase === 'play') {
        ctx.font = `700 30px ${F}`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff2e88';
        ctx.fillText(`Респаун через ${me.respT.toFixed(1)}`, vw / 2, vh / 2);
      }
    }
    // round over
    if (view.phase === 'over') {
      ctx.fillStyle = 'rgba(7,7,12,0.82)'; ctx.fillRect(0, 0, vw, vh);
      const w = view.players[view.winner];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      glow(w ? w.color : '#ff2e88', 24);
      ctx.font = `800 ${Math.min(64, vw / 12)}px ${F}`; ctx.fillStyle = w ? w.color : '#ff2e88';
      ctx.fillText(w ? `ПОБЕДИЛ ${w.name.toUpperCase()}` : 'РАУНД ОКОНЧЕН', vw / 2, vh / 2 - 110);
      noGlow();
      ctx.font = `600 20px ${F}`;
      ranked.forEach((p, i) => {
        ctx.fillStyle = p.color;
        ctx.fillText(`${i + 1}. ${p.name}   убийств ${p.kills}   смертей ${p.deaths}`, vw / 2, vh / 2 - 30 + i * 34);
      });
      ctx.fillStyle = '#8b8ba3'; ctx.font = `16px ${F}`;
      ctx.fillText(`Новый раунд через ${Math.ceil(view.overT)}`, vw / 2, vh / 2 + 130);
    }
    if (hostLeft) {
      ctx.fillStyle = 'rgba(7,7,12,0.9)'; ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff2e88';
      ctx.font = `700 28px ${F}`; ctx.fillText('Хост вышел из игры', vw / 2, vh / 2 - 16);
      ctx.fillStyle = '#8b8ba3'; ctx.font = `16px ${F}`;
      ctx.fillText('Обнови страницу, чтобы создать новую комнату', vw / 2, vh / 2 + 22);
    }
    // crosshair
    const c = COLORS[myId] || '#fff';
    glow(c, 8); ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2);
    ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15);
    ctx.stroke(); noGlow();
  }

  // ---------- Main loop ----------
  let last = 0, inputAcc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    localStep(dt);
    if (!isHost && hostConn && hostConn.open) {
      inputAcc += dt;
      if (inputAcc >= 1 / 30) { inputAcc = 0; hostConn.send(localInputMsg()); }
    }
    // smooth other players toward latest snapshot
    const k = Math.min(1, dt * 18);
    for (const p of Object.values(view.players)) {
      p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k;
      let da = p.a - p.ra; da = Math.atan2(Math.sin(da), Math.cos(da)); p.ra += da * k;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.life -= dt;
      if (q.life <= 0) particles.splice(i, 1);
    }
    for (let i = feed.length - 1; i >= 0; i--) if ((feed[i].t -= dt) <= 0) feed.splice(i, 1);
    shake *= 0.85;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, vw, vh);
    scale = Math.min((vw - 32) / W, (vh - 90) / H);
    ox = (vw - W * scale) / 2; oy = (vh - H * scale) / 2 + 8;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(ox + sx, oy + sy); ctx.scale(scale, scale);
    drawWorld(now);
    ctx.restore();
    drawHud();
    requestAnimationFrame(frame);
  }

  function startGame() {
    started = true;
    ui.lobby.hidden = true;
    ui.room.hidden = false;
    ui.roomCode.textContent = roomCode;
    try { history.replaceState(null, '', location.pathname + '?room=' + roomCode); } catch {}
    if (isHost) { hostLast = performance.now(); setInterval(hostTick, 1000 / 60); }
    requestAnimationFrame(t => { last = t; frame(t); });
  }
})();
