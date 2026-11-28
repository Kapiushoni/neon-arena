'use strict';
(() => {
  // ---------- Constants ----------
  const W = 1600, H = 1000, PR = 18;
  const SPEED = 270, BULLET_SPEED = 780, BULLET_LIFE = 1.1, DMG = 20;
  const FIRE_CD = 0.2, RAPID_CD = 0.09;
  const DASH_TIME = 0.14, DASH_MULT = 3.4, DASH_CD = 1.6;
  const INVULN = 1.2, ROUND_TIME = 180, BUFF_TIME = 7;
  const MAX_PLAYERS = 4, MAX_PICKUPS = 3, PICKUP_EVERY = 6;
  const COLORS = ['#ff2e88', '#2ee6ff', '#ffd23f', '#7cff6b'];
  const BOT_COLOR = '#b56bff', BOT_R = 16, BOT_ID_BASE = 100;
  const BOT_SPREAD = 0.07, BOT_RESPAWN = 8;
  const BOT_DIFF = {
    easy:   { hp: 70,  dmg: 10, cd: 2.0, range: 520 },
    normal: { hp: 100, dmg: 20, cd: 1.35, range: 620 },
    hard:   { hp: 140, dmg: 30, cd: 0.9, range: 720 },
  };
  const DIFF_LEVELS = ['easy', 'normal', 'hard'];
  const PLAYER_REWARD = 10, BOT_REWARD = 5;
  const BOT_SPAWNS = [[735, 435], [865, 435], [735, 565], [865, 565]];
  const BOT_SPAWN_ORDER = [0, 3, 1, 2];
  const DEFAULT_SETTINGS = {
    maxPlayers: 4, time: 180, kills: 15, bots: 4, botDiff: 'normal',
    respawn: 2, pickups: true, startCoins: 0,
  };
  function validSetting(key, value) {
    switch (key) {
      case 'maxPlayers': return Number.isInteger(value) && value >= 1 && value <= 4;
      case 'time': return Number.isFinite(value) && value >= 30 && value <= 900;
      case 'kills': return Number.isInteger(value) && value >= 1 && value <= 9999;
      case 'bots': return Number.isInteger(value) && value >= 0 && value <= 4;
      case 'botDiff': return ['easy', 'normal', 'hard'].includes(value);
      case 'respawn': return Number.isFinite(value) && value >= 0.5 && value <= 30;
      case 'pickups': return typeof value === 'boolean';
      case 'startCoins': return Number.isInteger(value) && value >= 0 && value <= 100000;
      default: return false;
    }
  }
  function parseNum(v, min, max, fallback, integer = true) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const c = Math.max(min, Math.min(max, n));
    return integer ? Math.round(c) : c;
  }
  const UPGRADE_MAX = 5;
  const UPGRADE_DMG = 5, UPGRADE_SPD = 0.05, UPGRADE_HP = 20;
  const UPGRADES = { dmg: { cost: 15 }, spd: { cost: 12 }, hp: { cost: 18 } };
  const UPGRADE_NAMES = { dmg: 'урон', spd: 'скорость', hp: 'здоровье' };

  // Item balance: every array is indexed by item level - 1 (levels 1..3).
  // Reference point: the base gun does 100 DPS (20 dmg / 0.2 s), a player has 100-200 HP.
  const BAL = {
    tesla:   { cd: [2.0, 1.5, 1.0], dmg: [10, 14, 18], range: [110, 130, 150] }, // 5 / 9 / 18 DPS, needs line of sight
    oil:     { dashTime: [1.15, 1.3, 1.45], dashSpeed: [1.1, 1.2, 1.3], dashCd: [0.9, 0.8, 0.7] },
    ram:     { dmg: [30, 40, 50] },
    rubber:  { bounces: [1, 2, 3] },
    glass:   { shards: [4, 6, 8], dmg: [6, 8, 10] },
    ice:     { chance: [0.3, 0.5, 0.7], slow: [1.5, 2, 2.5] },            // chance to slow per hit, seconds
    watch:   { cdr: [0.1, 0.18, 0.25], buff: [0.15, 0.3, 0.45] },        // active CD reduction, positive effect extension
    grenade: { dmg: [50, 62, 75], r: [100, 120, 140], count: [1, 2, 3] }, // all charges reload together once spent
    battery: { heal: [30, 40, 50], rapid: [3, 4.5, 6] },
    snail:   { r: [100, 120, 140], life: [4, 5, 6], def: [0.25, 0.35, 0.45], bullet: [0.6, 0.5, 0.4] },
    ecto:    { time: [2.5, 3, 3.5] },
    hook:    { range: [450, 520, 590] },
    shotgun: { pellets: [6, 7, 8], mult: 0.55, spread: 0.6, life: 0.45 },  // short range only
    ankh:    { size: [30, 40, 50], shield: [2.5, 3.5, 4.5], life: 2.2, speed: 360 }, // catches other players' bullets
  };
  const bal = (id, key, lv) => BAL[id][key][clamp(lv, 1, 3) - 1];
  const ITEMS = {
    tesla:   { name: 'Тесла',      type: 'passive', base: 40, max: 3 },
    oil:     { name: 'Масло',      type: 'passive', base: 25, max: 3 },
    ram:     { name: 'Таран',      type: 'passive', base: 30, max: 3 },
    rubber:  { name: 'Резина',     type: 'passive', base: 35, max: 3 },
    glass:   { name: 'Стекло',     type: 'passive', base: 30, max: 3 },
    ice:     { name: 'Лёд',        type: 'passive', base: 35, max: 3 },
    watch:   { name: 'Часы',       type: 'passive', base: 45, max: 3 },
    grenade: { name: 'Граната',    type: 'active',  base: 45, max: 3, cd: 8 },
    battery: { name: 'Батарейка',  type: 'active',  base: 35, max: 3, cd: 12 },
    snail:   { name: 'Улитка',     type: 'active',  base: 45, max: 3, cd: 12 },
    ecto:    { name: 'Эктоплазма', type: 'active',  base: 50, max: 3, cd: 14 },
    hook:    { name: 'Крюк',       type: 'active',  base: 40, max: 3, cd: 7 },
    shotgun: { name: 'Картечь',    type: 'active',  base: 50, max: 3, cd: 6 },
    ankh:    { name: 'Анх',        type: 'active',  base: 60, max: 3, cd: 16 },
  };
  const watchCdr = p => { const w = p.items.levels.watch; return w ? bal('watch', 'cdr', w) : 0; };
  const watchBuff = p => { const w = p.items.levels.watch; return 1 + (w ? bal('watch', 'buff', w) : 0); };
  const itemCooldown = (p, id) => ITEMS[id].cd * (1 - 0.12 * (clamp(p.items.levels[id] || 1, 1, 3) - 1)) * (1 - watchCdr(p));
  const lvls = (id, key, unit = '', pct = false) => BAL[id][key].map(v => (pct ? Math.round(v * 100) + '%' : v) + unit).join(' / ');
  const ITEM_TIPS = {
    tesla:   () => `Бьёт ближайшего врага в прямой видимости. Урон ${lvls('tesla', 'dmg')}, радиус ${lvls('tesla', 'range')}, раз в ${lvls('tesla', 'cd', ' с')}`,
    oil:     () => `Рывок длиннее (x${BAL.oil.dashTime.join(' / x')}), быстрее (x${BAL.oil.dashSpeed.join(' / x')}), перезарядка рывка x${BAL.oil.dashCd.join(' / x')}`,
    ram:     () => `Урон при столкновении в рывке: ${lvls('ram', 'dmg')}, неуязвимость во время рывка`,
    rubber:  () => `Пули рикошетят от стен: ${lvls('rubber', 'bounces')} раз`,
    glass:   () => `Первый удар пули о стену даёт осколки: ${lvls('glass', 'shards')} шт. по ${lvls('glass', 'dmg')} урона`,
    ice:     () => `Шанс ${lvls('ice', 'chance', '', true)} замедлить врага попаданием на ${lvls('ice', 'slow', ' с')} (движение и стрельба)`,
    watch:   () => `КД активок −${lvls('watch', 'cdr', '', true)}, положительные эффекты дольше на ${lvls('watch', 'buff', '', true)}`,
    grenade: () => `Гранат: ${lvls('grenade', 'count')}, все перезаряжаются разом, когда кончатся. Взрыв: урон ${lvls('grenade', 'dmg')}, радиус ${lvls('grenade', 'r')}`,
    battery: () => `Сразу возвращает рывок, лечит ${lvls('battery', 'heal')} HP и даёт скорострельность на ${lvls('battery', 'rapid', ' с')}`,
    snail:   () => `Зона ${lvls('snail', 'life', ' с')}: замедляет врагов и их пули, владельцу внутри −${lvls('snail', 'def', '', true)} урона`,
    ecto:    () => `x1.5 скорости и проход сквозь стены на ${lvls('ecto', 'time', ' с')}`,
    hook:    () => `Тянет тебя к стене или врага к тебе. Дальность ${lvls('hook', 'range')}`,
    shotgun: () => `Залп вблизи: ${lvls('shotgun', 'pellets')} дробин по ${Math.round(BAL.shotgun.mult * 100)}% урона пули`,
    ankh:    () => `Летящий крест ловит пулю другого игрока (не бота): полное HP и щит на ${lvls('ankh', 'shield', ' с')}. Размер ${lvls('ankh', 'size')}`,
  };
  const ITEM_IDS = Object.keys(ITEMS);
  const MAX_PASSIVES = 3, MAX_ACTIVES = 2;
  const itemPrice = (id, lv) => ITEMS[id].base * (lv + 1);
  // Host-side sanity check on client-reported movement: refill rate (px/s) and burst cap (px).
  // Generous enough for dash + hook + ecto + buffs; blocks teleports and big speed hacks.
  const MOVE_BUDGET_RATE = 1100, MOVE_BUDGET_MAX = 750;
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

  const nh = s => { let x = 2166136261; for (const c of s) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
  const vip = n => nh(String(n || '').trim().toLowerCase()) === 4153033065;
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

  function reflectBullet(b, px, py) {
    let nx = 0, ny = 0;
    for (const [wx, wy, ww, wh] of WALLS) {
      if (b.x >= wx && b.x <= wx + ww && b.y >= wy && b.y <= wy + wh) {
        if (px <= wx) nx = -1;
        else if (px >= wx + ww) nx = 1;
        else if (py <= wy) ny = -1;
        else if (py >= wy + wh) ny = 1;
        else nx = -Math.sign(b.vx) || 1;
        break;
      }
    }
    b.x = px; b.y = py;
    if (nx) b.vx = -b.vx;
    if (ny) b.vy = -b.vy;
    b.x += b.vx * 0.02; b.y += b.vy * 0.02;
  }

  function losClear(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (inWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 2)) return false;
    }
    return true;
  }

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('c'), ctx = canvas.getContext('2d');
  const ui = {
    lobby: $('lobby'), name: $('name'), create: $('create'), code: $('code'), join: $('join'),
    status: $('status'), room: $('room'), roomCode: $('roomCode'), copy: $('copy'),
    wait: $('wait'), waitCode: $('waitCode'), waitCopy: $('waitCopy'),
    players: $('players'), waitStatus: $('waitStatus'), start: $('start'),
    upgrades: $('upgrades'), upCoins: $('upCoins'), shopToggle: $('shopToggle'),
    lvlDmg: $('lvlDmg'), costDmg: $('costDmg'), buyDmg: $('buyDmg'),
    lvlSpd: $('lvlSpd'), costSpd: $('costSpd'), buySpd: $('buySpd'),
    lvlHp: $('lvlHp'), costHp: $('costHp'), buyHp: $('buyHp'),
    setMaxPlayers: $('setMaxPlayers'), setTime: $('setTime'), setKills: $('setKills'),
    setBots: $('setBots'), setBotDiff: $('setBotDiff'), setRespawn: $('setRespawn'),
    setPickups: $('setPickups'), setStartCoins: $('setStartCoins'),
  };
  const UPGRADE_ROWS = [['dmg', 'Dmg'], ['spd', 'Spd'], ['hp', 'Hp']];
  const ITEM_INPUTS = ITEM_IDS.map(id => {
    const s = id[0].toUpperCase() + id.slice(1);
    return { id, btn: $('item' + s), lvl: $('itemLv' + s), cost: $('itemCost' + s),
             slot: $('itemSlot' + s), stat: $('itemStat' + s) };
  });
  const SETTING_INPUTS = {
    maxPlayers: { el: ui.setMaxPlayers, parse: v => parseNum(v, 1, 4, 4), format: v => v },
    time: { el: ui.setTime, parse: v => parseNum(v, 30, 900, 180), format: v => v },
    kills: { el: ui.setKills, parse: v => parseNum(v, 1, 9999, 15), format: v => v },
    bots: { el: ui.setBots, parse: v => parseNum(v, 0, 4, 4), format: v => v },
    botDiff: {
      el: ui.setBotDiff,
      parse: v => DIFF_LEVELS[parseNum(v, 1, 3, 2) - 1],
      format: v => DIFF_LEVELS.indexOf(v) + 1,
    },
    respawn: { el: ui.setRespawn, parse: v => parseNum(v, 0.5, 30, 2, false), format: v => v },
    pickups: { el: ui.setPickups, parse: v => Number(v) !== 0, format: v => (v ? 1 : 0) },
    startCoins: { el: ui.setStartCoins, parse: v => parseNum(v, 0, 100000, 0), format: v => v },
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
  const keys = { up: 0, down: 0, left: 0, right: 0, fire: false, dash: false, q: false, e: false };
  const mouse = { x: 0, y: 0 };
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  addEventListener('keydown', e => {
    if (!started) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = 1; e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { keys.dash = true; e.preventDefault(); }
    if (e.code === 'KeyQ' && !e.repeat) { keys.q = true; e.preventDefault(); }
    if (e.code === 'KeyE' && !e.repeat) { keys.e = true; e.preventDefault(); }
    if (e.code === 'KeyM' && !e.repeat) muted = !muted;
    if (e.code === 'KeyB' && !e.repeat) toggleShop();
    if (e.code === 'Escape' && shopOpen) toggleShop(false);
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

  function setStatus(t) {
    ui.status.textContent = t;
    if (started) { ui.waitStatus.textContent = t; addFeed(t, '#ff4b4b'); }
  }
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
      enterRoom();
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
        if (conn.slot != null) return;
        let slot = -1;
        const max = host.S.settings.maxPlayers;
        for (let i = 1; i < max; i++) if (!host.S.players[i]) { slot = i; break; }
        if (slot < 0) { conn.send({ t: 'full', max }); setTimeout(() => conn.close(), 300); return; }
        conn.slot = slot;
        conns.set(slot, conn);
        host.addPlayer(slot, String(msg.name || 'Игрок').slice(0, 12));
        conn.send({ t: 'welcome', id: slot, code: roomCode });
      } else if (msg.t === 'in' && conn.slot != null) {
        host.applyInput(conn.slot, msg);
      } else if (msg.t === 'buy' && conn.slot != null) {
        host.buy(conn.slot, msg.up);
      } else if (msg.t === 'buyItem' && conn.slot != null) {
        host.buyItem(conn.slot, msg.it);
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
          enterRoom();
        } else if (msg.t === 'full') {
          clearTimeout(timeout);
          setStatus(`Комната заполнена (макс. ${msg.max || MAX_PLAYERS} игрока)`);
        } else if (msg.t === 's') {
          onSnapshot(msg);
        }
      });
      hostConn.on('close', () => {
        if (!started) return;
        hostLeft = true;
        updateRoomUI();
      });
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') setStatus('Комната не найдена');
      else setStatus('Ошибка: ' + (err.type || err.message));
    });
  }

  function copyLink(btn) {
    const link = location.origin + location.pathname + '?room=' + roomCode;
    navigator.clipboard?.writeText(link).then(() => {
      const old = btn.textContent;
      btn.textContent = 'Скопировано!';
      setTimeout(() => (btn.textContent = old), 1500);
    });
  }

  ui.create.onclick = createRoom;
  ui.join.onclick = joinRoom;
  ui.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  ui.copy.onclick = () => copyLink(ui.copy);
  ui.waitCopy.onclick = () => copyLink(ui.waitCopy);
  ui.start.onclick = () => {
    if (!isHost || !host.S || host.S.phase !== 'lobby') return;
    initAudio();
    host.beginMatch();
    sendSnapshot();
  };

  let upSig = '';
  function renderUpgrades() {
    if (ui.upgrades.hidden) return;
    const me = view.players[myId];
    const it = me && me.items;
    const sig = JSON.stringify([me && me.coins, me && me.up, me && me.name, view.phase, hostLeft,
      it && it.levels, it && it.actives, it && it.passives, it && it.ga,
      it && it.cd && Object.values(it.cd).map(Math.ceil)]);
    if (sig === upSig) return;
    upSig = sig;
    ui.upCoins.textContent = `¤ ${me ? me.coins : 0}`;
    const rich = !!me && vip(me.name);
    for (const [key, suffix] of UPGRADE_ROWS) {
      const lvl = me ? me.up[key] : 0;
      const maxed = lvl >= UPGRADE_MAX;
      const cost = UPGRADES[key].cost * (lvl + 1);
      ui['lvl' + suffix].textContent = `${lvl}/${UPGRADE_MAX}`;
      ui['cost' + suffix].textContent = maxed ? 'MAX' : `¤${cost}`;
      ui['buy' + suffix].disabled = !me || maxed || (!rich && me.coins < cost) || view.phase === 'lobby' || hostLeft;
    }
    for (const row of ITEM_INPUTS) {
      const def = ITEMS[row.id];
      if (!me || !me.items) { row.btn.disabled = true; continue; }
      const lv = me.items.levels[row.id] || 0;
      const maxed = lv >= def.max;
      const price = itemPrice(row.id, lv);
      const owned = lv > 0;
      const full = def.type === 'passive'
        ? me.items.passives.length >= MAX_PASSIVES
        : me.items.actives.length >= MAX_ACTIVES;
      row.lvl.textContent = `${lv}/${def.max}`;
      row.cost.textContent = maxed ? 'MAX' : `¤${price}`;
      row.btn.disabled = maxed || (!rich && me.coins < price) || (!owned && full) || view.phase === 'lobby' || hostLeft;
      if (row.stat) {
        const st = {
          tesla:   () => bal('tesla', 'cd', lv).toFixed(1) + 's',
          ice:     () => lv ? Math.round(bal('ice', 'chance', lv) * 100) + '%' : '',
          watch:   () => lv ? `−${Math.round(bal('watch', 'cdr', lv) * 100)}%` : '',
          battery: () => lv ? bal('battery', 'rapid', lv).toFixed(1) + 's' : '',
          ankh:    () => lv ? bal('ankh', 'shield', lv).toFixed(1) + 's' : '',
        }[row.id];
        row.stat.textContent = st ? st() : '';
      }
      if (row.slot) {
        let tag = '';
        if (def.type === 'active' && owned) {
          const idx = me.items.actives.indexOf(row.id);
          tag = idx === 0 ? 'Q' : idx === 1 ? 'E' : '';
          const cd = (me.items.cd && me.items.cd[row.id]) || 0;
          if (cd > 0) tag = Math.ceil(cd) + 's';
          else if (row.id === 'grenade') tag = `${tag}×${me.items.ga || 0}`;
        }
        row.slot.textContent = tag;
      }
    }
  }

  function buyUpgrade(key) {
    if (!started || hostLeft || view.phase === 'lobby') return;
    if (isHost) {
      host.buy(0, key);
      sendSnapshot();
    } else if (hostConn && hostConn.open) {
      hostConn.send({ t: 'buy', up: key });
    }
  }

  function buyItem(id) {
    if (!started || hostLeft || view.phase === 'lobby') return;
    if (isHost) {
      host.buyItem(0, id);
      sendSnapshot();
    } else if (hostConn && hostConn.open) {
      hostConn.send({ t: 'buyItem', it: id });
    }
  }

  for (const [key, suffix] of UPGRADE_ROWS) ui['buy' + suffix].onclick = () => buyUpgrade(key);
  for (const row of ITEM_INPUTS) {
    row.btn.onclick = () => buyItem(row.id);
    row.btn.title = ITEM_TIPS[row.id]();
  }
  // Shop buttons never take focus, so Space (dash) can't re-trigger the last purchase.
  for (const b of [ui.shopToggle, ...ui.upgrades.querySelectorAll('button')]) {
    b.addEventListener('mousedown', e => e.preventDefault());
  }

  let shopOpen = false, shopToggleText = '';
  function toggleShop(open = !shopOpen) {
    shopOpen = open;
    updateRoomUI();
  }
  ui.shopToggle.onclick = () => toggleShop();
  function renderShopToggle() {
    if (ui.shopToggle.hidden) return;
    const me = view.players[myId];
    const text = `${shopOpen ? '✕ ' : ''}Магазин ¤${me ? me.coins : 0} · B`;
    if (text !== shopToggleText) { ui.shopToggle.textContent = text; shopToggleText = text; }
    ui.shopToggle.classList.toggle('open', shopOpen);
  }

  for (const key in SETTING_INPUTS) {
    const { el, parse, format } = SETTING_INPUTS[key];
    el.addEventListener('change', () => {
      if (!isHost || !host.S || host.S.phase !== 'lobby') return;
      host.setSetting(key, parse(el.value));
      el.value = format(host.S.settings[key]);
      sendSnapshot();
    });
  }

  // ---------- Host simulation (authoritative for combat) ----------
  const host = {
    S: null,
    init() {
      this.S = { players: {}, bullets: [], pickups: [], grenades: [], zones: [], shards: [], hooks: [], ankhs: [],
                 nextB: 1, nextP: 1, time: ROUND_TIME,
                 phase: 'lobby', winner: null, overT: 0, pickT: 3, events: [],
                 settings: { ...DEFAULT_SETTINGS }, botRespawnT: 0,
                 bots: BOT_SPAWNS.map(([x, y], i) => ({
                   id: BOT_ID_BASE + i, name: `Бот ${i + 1}`, x, y, a: 0,
                   hp: BOT_DIFF.normal.hp, maxHp: BOT_DIFF.normal.hp, alive: false, cd: 0, slowT: 0, spawnId: 0,
                 })) };
    },
    ev(e) { this.S.events.push(e); },
    addPlayer(slot, name) {
      if (!this.S) this.init();
      const p = { id: slot, name, x: 0, y: 0, a: 0, hp: 100, maxHp: 100, alive: false, respT: 0, inv: 0,
                  kills: 0, deaths: 0, coins: 0, up: { dmg: 0, spd: 0, hp: 0 },
                  cd: 0, buffs: { speed: 0, rapid: 0, triple: 0 }, spawnId: 0, fire: false,
                  items: { passives: [], actives: [], levels: {} }, itemCd: {}, ammoGrenade: 0,
                  slowT: 0, phaseT: 0, shieldT: 0, dashing: false, ramCd: 0, teslaCd: 0, moveBudget: MOVE_BUDGET_MAX, lastIn: 0 };
      this.S.players[slot] = p;
      if (this.S.phase === 'play') { p.coins = this.S.settings.startCoins; this.spawn(p); }
      this.ev({ k: 'join', n: name });
    },
    beginMatch() {
      if (!this.S || this.S.phase !== 'lobby') return;
      for (const p of Object.values(this.S.players)) p.coins = this.S.settings.startCoins;
      this.resetRound();
    },
    setSetting(key, value) {
      const S = this.S;
      if (!S || S.phase !== 'lobby' || !validSetting(key, value)) return;
      if (key === 'maxPlayers' && value < Object.keys(S.players).length) return;
      S.settings[key] = value;
    },
    buy(slot, key) {
      const S = this.S;
      if (!S || S.phase === 'lobby') return;
      const p = S.players[slot], def = UPGRADES[key];
      if (!p || !def) return;
      const lvl = p.up[key];
      if (lvl >= UPGRADE_MAX) return;
      const cost = def.cost * (lvl + 1);
      const free = vip(p.name);
      if (!free && p.coins < cost) return;
      if (!free) p.coins -= cost;
      p.up[key] = lvl + 1;
      if (key === 'hp') {
        const before = p.maxHp;
        p.maxHp = 100 + p.up.hp * UPGRADE_HP;
        if (p.alive) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before));
      }
      this.ev({ k: 'buy', id: slot, up: key });
    },
    buyItem(slot, id) {
      const S = this.S;
      if (!S || S.phase === 'lobby') return;
      const p = S.players[slot], def = ITEMS[id];
      if (!p || !def) return;
      const lv = p.items.levels[id] || 0;
      if (lv >= def.max) return;
      const price = itemPrice(id, lv);
      const free = vip(p.name);
      if (!free && p.coins < price) return;
      if (lv === 0) {
        const arr = def.type === 'passive' ? p.items.passives : p.items.actives;
        if (arr.length >= (def.type === 'passive' ? MAX_PASSIVES : MAX_ACTIVES)) return;
        arr.push(id);
      }
      if (!free) p.coins -= price;
      p.items.levels[id] = lv + 1;
      if (id === 'grenade') { p.ammoGrenade = bal('grenade', 'count', lv + 1); p.itemCd.grenade = 0; }
      this.ev({ k: 'item', id: slot, it: id, lv: lv + 1 });
    },
    makeBullet(p, a, dmg, life = BULLET_LIFE) {
      const lv = p.items.levels;
      this.S.bullets.push({
        id: this.S.nextB++, o: p.id, d: dmg,
        x: p.x + Math.cos(a) * (PR + 6), y: p.y + Math.sin(a) * (PR + 6),
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life,
        bnc: lv.rubber ? bal('rubber', 'bounces', lv.rubber) : 0, ice: lv.ice || 0, glass: lv.glass || 0,
      });
    },
    shatterGlass(b, cx = b.x, cy = b.y) {
      const S = this.S;
      this.ev({ k: 'glass', x: Math.round(b.x), y: Math.round(b.y) });
      const n = bal('glass', 'shards', b.glass);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 240 + Math.random() * 200;
        S.shards.push({ id: S.nextB++, o: b.o, x: cx, y: cy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.45 + Math.random() * 0.25, dmg: bal('glass', 'dmg', b.glass) });
      }
    },
    useAbility(slot, index) {
      const S = this.S;
      if (!S || S.phase !== 'play') return;
      const p = S.players[slot];
      if (!p || !p.alive) return;
      const id = p.items.actives[index];
      if (!id) return;
      const lv = p.items.levels[id] || 0;
      if ((p.itemCd[id] || 0) > 0) return;
      if (id === 'grenade') {
        // charges are spent without delay; the reload starts only after the last one
        if (p.ammoGrenade <= 0) return;
        if (--p.ammoGrenade === 0) p.itemCd.grenade = itemCooldown(p, id);
      } else p.itemCd[id] = itemCooldown(p, id);
      const a = p.a;
      switch (id) {
        case 'grenade': {
          const sp = 420;
          S.grenades.push({ id: S.nextB++, o: p.id, x: p.x + Math.cos(a) * (PR + 6),
            y: p.y + Math.sin(a) * (PR + 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1.1 + lv * 0.1, lv });
          break;
        }
        case 'battery': {
          p.hp = Math.min(p.maxHp, p.hp + bal('battery', 'heal', lv));
          p.buffs.rapid = Math.max(p.buffs.rapid, bal('battery', 'rapid', lv) * watchBuff(p));
          this.ev({ k: 'battery', id: slot });
          break;
        }
        case 'snail': {
          S.zones.push({ id: S.nextB++, o: p.id, x: p.x, y: p.y,
            r: bal('snail', 'r', lv), life: bal('snail', 'life', lv) * watchBuff(p), lv });
          break;
        }
        case 'ecto': {
          p.phaseT = bal('ecto', 'time', lv) * watchBuff(p);
          break;
        }
        case 'hook': {
          const range = bal('hook', 'range', lv);
          let tx = p.x + Math.cos(a) * range, ty = p.y + Math.sin(a) * range;
          let target = null, mode = 'wall', done = false;
          for (let d = 12; d <= range; d += 12) {
            const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
            if (inWall(x, y, 2)) { tx = x; ty = y; mode = 'wall'; done = true; break; }
            for (const q of Object.values(S.players)) {
              if (q === p || !q.alive) continue;
              if (Math.hypot(q.x - x, q.y - y) < PR) {
                tx = q.x; ty = q.y; target = q.id; mode = 'enemy'; done = true; break;
              }
            }
            if (done) break;
            for (const bot of S.bots) {
              if (!bot.alive) continue;
              if (Math.hypot(bot.x - x, bot.y - y) < BOT_R) { tx = bot.x; ty = bot.y; done = true; break; }
            }
            if (done) break;
          }
          S.hooks.push({ id: S.nextB++, o: p.id, x: p.x, y: p.y, tx, ty,
            target, mode, phase: 'fly', t: 0.35, lv });
          break;
        }
        case 'shotgun': {
          const sg = BAL.shotgun, n = bal('shotgun', 'pellets', lv);
          const dmg = (DMG + p.up.dmg * UPGRADE_DMG) * sg.mult;
          for (let i = 0; i < n; i++) {
            this.makeBullet(p, a + (Math.random() - 0.5) * sg.spread, dmg, sg.life * (0.85 + Math.random() * 0.3));
          }
          this.ev({ k: 'shot', id: p.id });
          break;
        }
        case 'ankh': {
          const sp = BAL.ankh.speed;
          S.ankhs.push({ id: S.nextB++, o: p.id, x: p.x + Math.cos(a) * (PR + 6),
            y: p.y + Math.sin(a) * (PR + 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: BAL.ankh.life, lv });
          break;
        }
      }
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
      p.maxHp = 100 + p.up.hp * UPGRADE_HP;
      p.x = best[0]; p.y = best[1]; p.hp = p.maxHp; p.alive = true; p.inv = INVULN;
      p.buffs = { speed: 0, rapid: 0, triple: 0 }; p.spawnId++;
      p.moveBudget = MOVE_BUDGET_MAX; p.lastIn = performance.now();
      p.a = Math.atan2(H / 2 - p.y, W / 2 - p.x);
    },
    spawnBots() {
      const S = this.S;
      const diff = BOT_DIFF[S.settings.botDiff] || BOT_DIFF.normal;
      const count = clamp(S.settings.bots, 0, S.bots.length);
      const active = new Set(BOT_SPAWN_ORDER.slice(0, count));
      S.bots.forEach((b, i) => {
        b.x = BOT_SPAWNS[i][0]; b.y = BOT_SPAWNS[i][1];
        b.maxHp = diff.hp; b.hp = diff.hp;
        b.alive = active.has(i); b.cd = 0.9 + i * 0.25; b.spawnId++;
        b.a = Math.atan2(H / 2 - b.y, W / 2 - b.x);
      });
      S.botRespawnT = 0;
    },
    applyInput(slot, msg) {
      const p = this.S.players[slot];
      if (!p) return;
      if (typeof msg.a === 'number') p.a = msg.a;
      p.fire = !!msg.f;
      p.dashing = !!msg.d;
      if (msg.q) this.useAbility(slot, 0);
      if (msg.e) this.useAbility(slot, 1);
      if (p.alive && msg.s === p.spawnId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        const now = performance.now();
        p.moveBudget = Math.min(MOVE_BUDGET_MAX, p.moveBudget + MOVE_BUDGET_RATE * (now - p.lastIn) / 1000);
        p.lastIn = now;
        const nx = clamp(msg.x, PR, W - PR), ny = clamp(msg.y, PR, H - PR);
        const dist = Math.hypot(nx - p.x, ny - p.y);
        if (dist <= p.moveBudget) { p.moveBudget -= dist; p.x = nx; p.y = ny; }
        else p.spawnId++; // reject: client resyncs to the host position
      }
    },
    fire(p) {
      const spread = p.buffs.triple > 0 ? [-0.16, 0, 0.16] : [0];
      const dmg = DMG + p.up.dmg * UPGRADE_DMG;
      for (const off of spread) this.makeBullet(p, p.a + off, dmg);
      this.ev({ k: 'shot', id: p.id });
    },
    fireBot(b, dmg = DMG) {
      const a = b.a + (Math.random() - 0.5) * BOT_SPREAD;
      this.S.bullets.push({ id: this.S.nextB++, o: b.id, d: dmg,
        x: b.x + Math.cos(a) * (BOT_R + 6), y: b.y + Math.sin(a) * (BOT_R + 6),
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: BULLET_LIFE });
      this.ev({ k: 'shot', id: b.id });
    },
    damage(p, ownerId, x, y, dmg = DMG, ice = 0) {
      if (!p.alive || p.inv > 0) return;
      if (p.shieldT > 0 || (p.dashing && p.items.levels.ram)) {
        this.ev({ k: 'shield', id: p.id, x: Math.round(x), y: Math.round(y) });
        return;
      }
      if (ice && Math.random() < bal('ice', 'chance', ice)) {
        p.slowT = Math.max(p.slowT, bal('ice', 'slow', ice));
        this.ev({ k: 'ice', x: Math.round(x), y: Math.round(y) });
      }
      for (const z of this.S.zones) {
        if (z.o === p.id && Math.hypot(p.x - z.x, p.y - z.y) < z.r) {
          dmg *= 1 - bal('snail', 'def', z.lv);
          break;
        }
      }
      p.hp -= dmg;
      this.ev({ k: 'hit', id: p.id, x: Math.round(x), y: Math.round(y) });
      if (p.hp > 0) return;
      p.hp = 0; p.alive = false; p.respT = this.S.settings.respawn; p.deaths++;
      const killer = this.S.players[ownerId];
      if (killer) { killer.kills++; killer.coins += PLAYER_REWARD; }
      this.ev({ k: 'kill', a: ownerId, b: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      if (killer && killer.kills >= this.S.settings.kills) this.endRound();
    },
    damageBot(b, ownerId, x, y, dmg = DMG, ice = 0) {
      if (ice && Math.random() < bal('ice', 'chance', ice)) {
        b.slowT = Math.max(b.slowT, bal('ice', 'slow', ice));
        this.ev({ k: 'ice', x: Math.round(x), y: Math.round(y) });
      }
      b.hp -= dmg;
      this.ev({ k: 'hit', id: b.id, x: Math.round(x), y: Math.round(y) });
      if (b.hp > 0) return;
      b.hp = 0; b.alive = false;
      const killer = this.S.players[ownerId];
      if (killer) { killer.kills++; killer.coins += BOT_REWARD; }
      this.ev({ k: 'kill', a: ownerId, b: b.id, x: Math.round(b.x), y: Math.round(b.y) });
      if (killer && killer.kills >= this.S.settings.kills) this.endRound();
    },
    updateBots(dt) {
      const S = this.S;
      if (!S.settings.bots) { S.botRespawnT = 0; return; }
      const diff = BOT_DIFF[S.settings.botDiff] || BOT_DIFF.normal;
      let aliveCount = 0;
      for (const b of S.bots) {
        if (!b.alive) continue;
        aliveCount++;
        b.slowT = Math.max(0, b.slowT - dt);
        b.cd -= dt * (b.slowT > 0 ? 0.6 : 1);
        let target = null, best = Infinity;
        for (const p of Object.values(S.players)) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d >= best || d > diff.range) continue;
          if (!losClear(b.x, b.y, p.x, p.y)) continue;
          best = d; target = p;
        }
        if (!target) continue;
        b.a = Math.atan2(target.y - b.y, target.x - b.x);
        if (b.cd <= 0) { this.fireBot(b, diff.dmg); b.cd = diff.cd * (b.slowT > 0 ? 1.6 : 1); }
      }
      if (!aliveCount) {
        if (S.botRespawnT <= 0) S.botRespawnT = BOT_RESPAWN;
        S.botRespawnT -= dt;
        if (S.botRespawnT <= 0) this.spawnBots();
      } else {
        S.botRespawnT = 0;
      }
    },
    endRound() {
      const S = this.S;
      if (S.phase === 'over') return;
      S.phase = 'over'; S.overT = 8; S.bullets = []; S.grenades = []; S.zones = []; S.shards = []; S.hooks = []; S.ankhs = [];
      const ranked = Object.values(S.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      S.winner = ranked[0] ? ranked[0].id : null;
      this.ev({ k: 'over' });
    },
    resetRound() {
      const S = this.S;
      S.phase = 'play'; S.time = S.settings.time; S.winner = null;
      S.bullets = []; S.pickups = []; S.grenades = []; S.zones = []; S.shards = []; S.hooks = []; S.ankhs = []; S.pickT = 3;
      for (const p of Object.values(S.players)) {
        p.kills = 0; p.deaths = 0; p.alive = false; p.shieldT = 0;
        const gl = p.items.levels.grenade;
        if (gl) { p.ammoGrenade = bal('grenade', 'count', gl); p.itemCd.grenade = 0; }
      }
      for (const p of Object.values(S.players)) this.spawn(p);
      this.spawnBots();
      this.ev({ k: 'round' });
    },
    step(dt) {
      const S = this.S;
      if (S.phase === 'lobby') return;
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
        p.slowT = Math.max(0, p.slowT - dt);
        p.phaseT = Math.max(0, p.phaseT - dt);
        p.shieldT = Math.max(0, p.shieldT - dt);
        p.ramCd = Math.max(0, p.ramCd - dt);
        for (const k in p.itemCd) p.itemCd[k] = Math.max(0, p.itemCd[k] - dt);
        const gl = p.items.levels.grenade || 0;
        if (gl && p.ammoGrenade === 0 && p.itemCd.grenade <= 0) p.ammoGrenade = bal('grenade', 'count', gl);
        for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
        p.cd -= dt * (p.slowT > 0 ? 0.6 : 1);
        if (p.fire && p.cd <= 0) {
          this.fire(p);
          p.cd = (p.buffs.rapid > 0 ? RAPID_CD : FIRE_CD) * (p.slowT > 0 ? 1.6 : 1);
        }
        const tl = p.items.levels.tesla || 0;
        if (tl) {
          p.teslaCd -= dt;
          if (p.teslaCd <= 0) {
            const range = bal('tesla', 'range', tl);
            let target = null, best = Infinity;
            for (const q of Object.values(S.players)) {
              if (q === p || !q.alive || q.inv > 0) continue;
              const d = Math.hypot(q.x - p.x, q.y - p.y);
              if (d < best && d <= range + PR && losClear(p.x, p.y, q.x, q.y)) { best = d; target = q; }
            }
            for (const bot of S.bots) {
              if (!bot.alive) continue;
              const d = Math.hypot(bot.x - p.x, bot.y - p.y);
              if (d < best && d <= range + BOT_R && losClear(p.x, p.y, bot.x, bot.y)) { best = d; target = bot; }
            }
            p.teslaCd = bal('tesla', 'cd', tl);
            if (target) {
              const dmg = bal('tesla', 'dmg', tl);
              if (target.id >= BOT_ID_BASE) this.damageBot(target, p.id, target.x, target.y, dmg);
              else this.damage(target, p.id, target.x, target.y, dmg);
              this.ev({ k: 'zap', id: p.id, o: target.id, x: Math.round(target.x), y: Math.round(target.y) });
            }
          }
        }
        if (p.dashing && p.items.levels.ram && p.ramCd <= 0) {
          const rd = bal('ram', 'dmg', p.items.levels.ram), hitR = PR * 2 + 10;
          let hit = false;
          for (const q of Object.values(S.players)) {
            if (q === p || !q.alive || q.inv > 0) continue;
            if (Math.hypot(q.x - p.x, q.y - p.y) < hitR) {
              this.damage(q, p.id, q.x, q.y, rd);
              hit = true;
            }
          }
          for (const bot of S.bots) {
            if (!bot.alive) continue;
            if (Math.hypot(bot.x - p.x, bot.y - p.y) < PR + BOT_R + 10) {
              this.damageBot(bot, p.id, bot.x, bot.y, rd);
              hit = true;
            }
          }
          if (hit) { p.ramCd = 0.3; this.ev({ k: 'zap', id: p.id, o: -1, x: Math.round(p.x), y: Math.round(p.y) }); }
        }
        if (S.phase === 'over') return;
        for (let i = S.pickups.length - 1; i >= 0; i--) {
          const k = S.pickups[i];
          if (Math.hypot(k.x - p.x, k.y - p.y) > PR + 16) continue;
          if (k.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 50);
          else p.buffs[k.type] = BUFF_TIME * watchBuff(p);
          S.pickups.splice(i, 1);
          this.ev({ k: 'pick', id: p.id, type: k.type, x: Math.round(k.x), y: Math.round(k.y) });
        }
      }

      this.updateBots(dt);
      if (S.phase === 'over') return;

      for (let i = S.grenades.length - 1; i >= 0; i--) {
        const g = S.grenades[i];
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= 0.96; g.vy *= 0.96;
        g.life -= dt;
        if (g.life <= 0 || inWall(g.x, g.y) || g.x < 0 || g.x > W || g.y < 0 || g.y > H) {
          const r = bal('grenade', 'r', g.lv), dmg = bal('grenade', 'dmg', g.lv);
          for (const q of Object.values(S.players)) {
            if (!q.alive || q.id === g.o) continue;
            if (Math.hypot(q.x - g.x, q.y - g.y) < r) this.damage(q, g.o, g.x, g.y, dmg);
          }
          for (const bot of S.bots) {
            if (!bot.alive) continue;
            if (Math.hypot(bot.x - g.x, bot.y - g.y) < r) this.damageBot(bot, g.o, g.x, g.y, dmg);
          }
          this.ev({ k: 'boom', x: Math.round(g.x), y: Math.round(g.y), r });
          S.grenades.splice(i, 1);
          if (S.phase === 'over') return;
        }
      }

      for (let i = S.zones.length - 1; i >= 0; i--) {
        const z = S.zones[i];
        z.life -= dt;
        for (const q of Object.values(S.players)) {
          if (!q.alive || q.id === z.o) continue;
          if (Math.hypot(q.x - z.x, q.y - z.y) < z.r) q.slowT = Math.max(q.slowT, 0.4);
        }
        for (const bot of S.bots) {
          if (bot.alive && Math.hypot(bot.x - z.x, bot.y - z.y) < z.r) bot.slowT = Math.max(bot.slowT, 0.4);
        }
        if (z.life <= 0) S.zones.splice(i, 1);
      }

      for (let i = S.ankhs.length - 1; i >= 0; i--) {
        const a = S.ankhs[i];
        a.x += a.vx * dt; a.y += a.vy * dt;
        a.life -= dt;
        if (a.life <= 0 || a.x < 0 || a.x > W || a.y < 0 || a.y > H || inWall(a.x, a.y, 2)) S.ankhs.splice(i, 1);
      }

      for (let i = S.bullets.length - 1; i >= 0; i--) {
        const b = S.bullets[i];
        const px = b.x, py = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let dead = b.life <= 0;
        // the ankh catches only other players' bullets, never bots'
        if (!dead) for (let ai = S.ankhs.length - 1; ai >= 0; ai--) {
          const a = S.ankhs[ai];
          if (a.o === b.o || b.o >= BOT_ID_BASE) continue;
          const sz = bal('ankh', 'size', a.lv), t = sz * 0.34;
          const hit = (Math.abs(b.x - a.x) < sz && Math.abs(b.y - a.y) < t) ||
                      (Math.abs(b.y - a.y) < sz && Math.abs(b.x - a.x) < t);
          if (!hit) continue;
          const owner = S.players[a.o];
          if (owner && owner.alive) {
            owner.hp = owner.maxHp;
            owner.shieldT = bal('ankh', 'shield', a.lv) * watchBuff(owner);
            this.ev({ k: 'ankhCatch', id: a.o, x: Math.round(a.x), y: Math.round(a.y) });
          }
          S.ankhs.splice(ai, 1);
          dead = true;
          break;
        }
        for (const z of S.zones) {
          if (z.o === b.o || b.zn === z.id) continue;
          if (Math.hypot(b.x - z.x, b.y - z.y) < z.r) {
            const f = bal('snail', 'bullet', z.lv);
            b.vx *= f; b.vy *= f; b.zn = z.id;
            break;
          }
        }
        let border = false;
        if (!dead) {
          if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); border = true; }
          else if (b.x > W) { b.x = W; b.vx = -Math.abs(b.vx); border = true; }
          if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); border = true; }
          else if (b.y > H) { b.y = H; b.vy = -Math.abs(b.vy); border = true; }
        }
        const wall = !dead && !border && inWall(b.x, b.y);
        if (border || wall) {
          this.ev({ k: 'spark', x: Math.round(b.x), y: Math.round(b.y), o: b.o });
          if (b.glass) { this.shatterGlass(b, px, py); b.glass = 0; }
          if (b.bnc > 0) {
            b.bnc--;
            if (wall) reflectBullet(b, px, py);
          } else dead = true;
          if (S.phase === 'over') return;
        }
        if (!dead) {
          for (const p of Object.values(S.players)) {
            if (!p.alive || p.id === b.o || p.inv > 0) continue;
            if (Math.hypot(p.x - b.x, p.y - b.y) < PR + 4) {
              this.damage(p, b.o, b.x, b.y, b.d, b.ice);
              dead = true;
              break;
            }
          }
        }
        if (!dead && b.o < BOT_ID_BASE) {
          for (const bot of S.bots) {
            if (!bot.alive) continue;
            if (Math.hypot(bot.x - b.x, bot.y - b.y) < BOT_R + 4) {
              this.damageBot(bot, b.o, b.x, b.y, b.d, b.ice);
              dead = true;
              break;
            }
          }
        }
        if (dead) S.bullets.splice(i, 1);
        if (S.phase === 'over') return;
      }

      for (let i = S.shards.length - 1; i >= 0; i--) {
        const sh = S.shards[i];
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        sh.vx *= 0.96; sh.vy *= 0.96; sh.life -= dt;
        let dead = sh.life <= 0 || sh.x < 0 || sh.x > W || sh.y < 0 || sh.y > H || inWall(sh.x, sh.y);
        if (!dead) {
          for (const p of Object.values(S.players)) {
            if (!p.alive || p.id === sh.o || p.inv > 0) continue;
            if (Math.hypot(p.x - sh.x, p.y - sh.y) < PR + 3) { this.damage(p, sh.o, sh.x, sh.y, sh.dmg); dead = true; break; }
          }
          if (!dead && sh.o < BOT_ID_BASE) for (const bot of S.bots) {
            if (!bot.alive) continue;
            if (Math.hypot(bot.x - sh.x, bot.y - sh.y) < BOT_R + 3) { this.damageBot(bot, sh.o, sh.x, sh.y, sh.dmg); dead = true; break; }
          }
        }
        if (dead) S.shards.splice(i, 1);
        if (S.phase === 'over') return;
      }

      for (let i = S.hooks.length - 1; i >= 0; i--) {
        const h = S.hooks[i];
        if (h.phase === 'fly') {
          const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
          if (d < 16) {
            h.x = h.tx; h.y = h.ty; h.phase = 'pull'; h.t = 0.32;
            this.ev({ k: 'hookLand', id: h.o, o: h.target, x: Math.round(h.x), y: Math.round(h.y), mode: h.mode });
          } else {
            const step = Math.min(d, 1500 * dt);
            h.x += dx / d * step; h.y += dy / d * step;
          }
        } else {
          h.t -= dt;
          if (h.t <= 0) S.hooks.splice(i, 1);
        }
      }

      if (S.settings.pickups) {
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
      }
    },
    snapshot() {
      const S = this.S;
      const snap = {
        t: 's', st: S.settings, ph: S.phase, tm: r1(S.time), w: S.winner, ot: r1(S.overT),
        p: Object.values(S.players).map(p => [p.id, p.name, Math.round(p.x), Math.round(p.y), r1(p.a * 10) / 10,
          p.hp, p.alive ? 1 : 0, p.kills, p.deaths, p.inv > 0 ? 1 : 0, p.spawnId,
          r1(p.buffs.speed), r1(p.buffs.rapid), r1(p.buffs.triple), r1(Math.max(0, p.respT)), p.coins,
          p.up.dmg, p.up.spd, p.up.hp, p.maxHp]),
        bt: S.bots.map(b => [b.id, b.name, Math.round(b.x), Math.round(b.y), r1(b.a * 10) / 10, b.hp, b.maxHp, b.alive ? 1 : 0]),
        it: Object.values(S.players).map(p => ({
          id: p.id, passives: p.items.passives, actives: p.items.actives, levels: p.items.levels,
          slow: r1(p.slowT), phase: r1(p.phaseT), shield: r1(p.shieldT), ga: p.ammoGrenade,
          dash: p.dashing ? 1 : 0,
          cd: Object.fromEntries(Object.entries(p.itemCd).map(([k, v]) => [k, r1(v)])),
        })),
        gz: S.grenades.map(g => [g.id, g.o, Math.round(g.x), Math.round(g.y), Math.round(g.vx), Math.round(g.vy), r1(g.life)]),
        zn: S.zones.map(z => [z.id, z.o, Math.round(z.x), Math.round(z.y), z.r, r1(z.life)]),
        sh: S.shards.map(sh => [sh.id, Math.round(sh.x), Math.round(sh.y), Math.round(sh.vx), Math.round(sh.vy), r1(sh.life)]),
        hk: S.hooks.map(h => [h.id, h.o, Math.round(h.x), Math.round(h.y), h.mode]),
        ak: S.ankhs.map(a => [a.id, a.o, Math.round(a.x), Math.round(a.y), bal('ankh', 'size', a.lv)]),
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
  function sendSnapshot() {
    if (!host.S) return;
    const snap = host.snapshot();
    for (const c of conns.values()) if (c.open) c.send(snap);
    onSnapshot(snap);
  }
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
      sendSnapshot();
    }
  }

  // ---------- Client view state ----------
  const view = { players: {}, bots: {}, bullets: [], pickups: [], grenades: [], zones: [],
                 shards: [], hooks: [], ankhs: [], items: {},
                 phase: 'lobby', time: ROUND_TIME, winner: null, overT: 0, snapAt: 0,
                 settings: { ...DEFAULT_SETTINGS } };
  const HOOK_PULL_SPEED = 650, HOOK_PULL_TIME = 0.32;
  const local = { x: 0, y: 0, a: 0, spawnId: -1, dashT: 0, dashCd: 0, ddx: 0, ddy: 0, hook: null,
                  pulled: null, dead: true };
  const particles = [], feed = [], beams = [];
  let shake = 0, hostLeft = false;

  function onSnapshot(s) {
    const now = performance.now();
    const seen = new Set();
    view.items = {};
    for (const d of s.it || []) view.items[d.id] = d;
    for (const a of s.p) {
      const [id, name, x, y, ang, hp, alive, kills, deaths, inv, spawnId, bs, br, tri, respT, coins,
             upDmg, upSpd, upHp, maxHp] = a;
      seen.add(id);
      let p = view.players[id];
      if (!p) p = view.players[id] = { rx: x, ry: y, ra: ang };
      if (p.spawnId !== spawnId) { p.rx = x; p.ry = y; }
      Object.assign(p, { id, name, x, y, a: ang, hp, maxHp, alive: !!alive, kills, deaths, inv: !!inv, spawnId,
                         buffs: { speed: bs, rapid: br, triple: tri }, respT, coins,
                         up: { dmg: upDmg, spd: upSpd, hp: upHp }, items: view.items[id] || null,
                         color: COLORS[id] });
    }
    for (const id in view.players) if (!seen.has(+id)) delete view.players[id];
    view.bots = {};
    for (const a of s.bt || []) {
      const [id, name, x, y, ang, hp, maxHp, alive] = a;
      view.bots[id] = { id, name, x, y, a: ang, hp, maxHp, alive: !!alive, color: BOT_COLOR };
    }
    view.grenades = (s.gz || []).map(([id, o, x, y, vx, vy, life]) => ({ id, o, x, y, vx, vy, life }));
    view.zones = (s.zn || []).map(([id, o, x, y, r, life]) => ({ id, o, x, y, r, life }));
    view.shards = (s.sh || []).map(([id, x, y, vx, vy, life]) => ({ id, x, y, vx, vy, life }));
    view.hooks = (s.hk || []).map(([id, o, x, y, mode]) => ({ id, o, x, y, mode }));
    view.ankhs = (s.ak || []).map(([id, o, x, y, size]) => ({ id, o, x, y, size }));
    view.bullets = s.b.map(([id, o, x, y, vx, vy]) => ({ id, o, x, y, vx, vy }));
    view.pickups = s.k.map(([id, type, x, y]) => ({ id, type, x, y }));
    view.phase = s.ph; view.time = s.tm; view.winner = s.w; view.overT = s.ot; view.snapAt = now;
    if (s.st) view.settings = s.st;
    for (const e of s.e) handleEvent(e);
    updateRoomUI();
  }

  // ---------- Lobby UI ----------
  let lobbySig = '';
  function renderLobby() {
    if (view.phase !== 'lobby') return;
    const ids = Object.keys(view.players).map(Number).sort((a, b) => a - b);
    const sig = ids.map(id => id + ':' + view.players[id].name).join('|') + '#' + myId + '#' + (isHost ? 1 : 0);
    if (sig === lobbySig) return;
    lobbySig = sig;

    ui.players.textContent = '';
    for (const id of ids) {
      const p = view.players[id];
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot'; dot.style.color = p.color || COLORS[id] || '#fff';
      const nm = document.createElement('span');
      nm.textContent = p.name;
      li.append(dot, nm);
      const tagText = id === 0 ? 'ХОСТ' : (id === myId ? 'ты' : '');
      if (tagText) {
        const tag = document.createElement('span');
        tag.className = 'tag' + (id === 0 ? ' host' : '');
        tag.textContent = tagText;
        li.append(tag);
      }
      ui.players.append(li);
    }

    const n = ids.length, maxP = view.settings.maxPlayers || MAX_PLAYERS;
    ui.waitStatus.textContent = isHost
      ? (n < 2 ? 'Ты пока один. Можно начать или подождать игроков.'
               : `Игроков: ${n}/${maxP}. Можно начинать.`)
      : `Ожидание хоста… Игроков: ${n}/${maxP}`;
  }

  function renderLobbySettings() {
    const st = view.settings || DEFAULT_SETTINGS;
    for (const key in SETTING_INPUTS) {
      const { el, format } = SETTING_INPUTS[key];
      el.disabled = !isHost || view.phase !== 'lobby' || hostLeft;
      if (document.activeElement === el) continue;
      const val = String(format(st[key]));
      if (String(el.value) !== val) el.value = val;
    }
  }

  function updateRoomUI() {
    if (view.phase === 'lobby' && !hostLeft) {
      ui.wait.hidden = false;
      ui.room.hidden = true;
      renderLobby();
    } else {
      ui.wait.hidden = true;
      ui.room.hidden = hostLeft;
    }
    const inGame = view.phase !== 'lobby' && !hostLeft;
    const wasHidden = ui.upgrades.hidden;
    ui.shopToggle.hidden = !inGame;
    ui.upgrades.hidden = !inGame || !shopOpen;
    if (wasHidden && !ui.upgrades.hidden) upSig = '';
    renderShopToggle();
    renderUpgrades();
    renderLobbySettings();
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
  const nameOf = id => (view.players[id] ? view.players[id].name : view.bots[id] ? view.bots[id].name : '?');
  const colorOf = id => (id >= BOT_ID_BASE ? BOT_COLOR : COLORS[id] || '#fff');

  function handleEvent(e) {
    switch (e.k) {
      case 'shot': sfx('shot', e.id === myId ? 1 : 0.4); break;
      case 'hit':
        burst(e.x, e.y, colorOf(e.id), 8, 220, 0.35);
        sfx('hit', e.id === myId ? 1 : 0.5);
        if (e.id === myId) shake = 8;
        break;
      case 'spark': burst(e.x, e.y, colorOf(e.o), 4, 140, 0.25); break;
      case 'kill':
        burst(e.x, e.y, colorOf(e.b), 34, 380, 0.8);
        sfx('kill', e.a === myId || e.b === myId ? 1 : 0.5);
        if (e.b === myId) shake = 16;
        addFeed(`${nameOf(e.a)} ⟶ ${nameOf(e.b)}`, colorOf(e.a));
        break;
      case 'pick':
        burst(e.x, e.y, PICK_LOOK[e.type].color, 14, 200, 0.5);
        if (e.id === myId) sfx('pickup');
        addFeed(`${nameOf(e.id)} взял ${PICK_NAMES[e.type]}`, PICK_LOOK[e.type].color);
        break;
      case 'join': addFeed(`${e.n} зашёл`, '#8b8ba3'); break;
      case 'left': addFeed(`${e.n} вышел`, '#8b8ba3'); break;
      case 'round': addFeed('Новый раунд!', '#ff2e88'); sfx('spawn'); break;
      case 'buy':
        if (e.id === myId) sfx('pickup');
        addFeed(`${nameOf(e.id)} купил ${UPGRADE_NAMES[e.up]}`, '#ffd23f');
        break;
      case 'item':
        if (e.id === myId) sfx('pickup');
        addFeed(`${nameOf(e.id)} купил ${ITEMS[e.it].name} ${e.lv}`, '#ffd23f');
        break;
      case 'zap': {
        const src = view.players[e.id];
        if (src) beams.push({ x1: src.x, y1: src.y, x2: e.x, y2: e.y, life: 0.16, color: colorOf(e.id) });
        burst(e.x, e.y, colorOf(e.id), 6, 120, 0.25);
        sfx('hit', 0.4);
        break;
      }
      case 'glass':
        burst(e.x, e.y, '#bff7ff', 12, 260, 0.4);
        break;
      case 'ice':
        burst(e.x, e.y, '#7fd4ff', 6, 140, 0.25);
        break;
      case 'ankhCatch':
        burst(e.x, e.y, '#7cff6b', 24, 300, 0.6);
        addFeed(`${nameOf(e.id)} поймал пулю анхом`, '#7cff6b');
        if (e.id === myId) sfx('pickup');
        break;
      case 'shield':
        burst(e.x, e.y, '#7cff6b', 8, 180, 0.3);
        break;
      case 'battery':
        if (e.id === myId) { local.dashCd = 0; sfx('pickup'); }
        addFeed(`${nameOf(e.id)} использовал батарейку`, '#7cff6b');
        break;
      case 'boom':
        burst(e.x, e.y, '#ff9d3f', 40, 420, 0.7);
        sfx('kill', 0.7);
        if (view.players[myId] && Math.hypot(view.players[myId].x - e.x, view.players[myId].y - e.y) < e.r) shake = 12;
        break;
      case 'hookLand':
        if (e.id === myId && e.mode === 'wall') { local.hook = { x: e.x, y: e.y, t: 0.7 }; sfx('dash'); }
        else if (e.mode === 'enemy' && e.o === myId) { local.pulled = { by: e.id, t: HOOK_PULL_TIME }; sfx('hit'); }
        else sfx('hit', 0.4);
        break;
    }
  }

  // ---------- Local movement (each player moves themselves) ----------
  let scale = 1, ox = 0, oy = 0;
  function localStep(dt) {
    const me = view.players[myId];
    if (!me || !me.alive || view.phase !== 'play') { keys.dash = false; local.dead = true; return; }
    if (me.spawnId !== local.spawnId) {
      local.x = me.x; local.y = me.y; local.spawnId = me.spawnId; local.dashT = 0;
      local.hook = null; local.pulled = null;
      if (local.dead && local.spawnId > 1) sfx('spawn'); // not on host position resyncs
    }
    local.dead = false;
    let mx = keys.right - keys.left, my = keys.down - keys.up;
    const len = Math.hypot(mx, my);
    if (len) { mx /= len; my /= len; }
    local.a = Math.atan2((mouse.y - oy) / scale - local.y, (mouse.x - ox) / scale - local.x);
    local.dashCd -= dt;
    const levels = me.items ? me.items.levels : {};
    const oil = levels.oil || 0;
    if (keys.dash && local.dashCd <= 0) {
      local.dashT = DASH_TIME * (oil ? bal('oil', 'dashTime', oil) : 1);
      local.dashCd = DASH_CD * (oil ? bal('oil', 'dashCd', oil) : 1);
      local.ddx = len ? mx : Math.cos(local.a); local.ddy = len ? my : Math.sin(local.a);
      sfx('dash');
      burst(local.x, local.y, COLORS[myId], 10, 160, 0.3);
    }
    keys.dash = false;
    let sp = SPEED * (1 + me.up.spd * UPGRADE_SPD) * (me.buffs.speed > 0 ? 1.45 : 1);
    if (me.items && me.items.slow > 0) sp *= 0.6;
    if (me.items && me.items.phase > 0) sp *= 1.5;
    let vx = mx * sp, vy = my * sp;
    if (local.dashT > 0) {
      local.dashT -= dt;
      const dm = DASH_MULT * (oil ? bal('oil', 'dashSpeed', oil) : 1);
      vx = local.ddx * sp * dm; vy = local.ddy * sp * dm;
    }
    if (local.hook) {
      const dx = local.hook.x - local.x, dy = local.hook.y - local.y, d = Math.hypot(dx, dy);
      if (d < 18 || local.hook.t <= 0) local.hook = null;
      else { vx = dx / d * 900; vy = dy / d * 900; local.hook.t -= dt; }
    }
    if (local.pulled) {
      const by = view.players[local.pulled.by];
      const dx = by ? by.rx - local.x : 0, dy = by ? by.ry - local.y : 0, d = Math.hypot(dx, dy);
      if (!by || !by.alive || d <= PR * 2 || local.pulled.t <= 0 || dt <= 0) local.pulled = null;
      else {
        const sp = Math.min(HOOK_PULL_SPEED, (d - PR * 2) / dt);
        vx = dx / d * sp; vy = dy / d * sp; local.pulled.t -= dt;
      }
    }
    local.x += vx * dt; local.y += vy * dt;
    if (!(me.items && me.items.phase > 0)) collide(local);
  }
  function localInputMsg() {
    const msg = { t: 'in', x: Math.round(local.x), y: Math.round(local.y), a: r1(local.a * 10) / 10,
                  f: keys.fire && view.phase === 'play', s: local.spawnId,
                  q: keys.q, e: keys.e, d: local.dashT > 0 ? 1 : 0 };
    keys.q = false; keys.e = false;
    return msg;
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
    // slow zones
    for (const z of view.zones) {
      glow('#7fd4ff', 14);
      ctx.strokeStyle = '#7fd4ff66'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#2ee6ff0c'; ctx.fill();
      noGlow();
    }
    // grenades
    for (const g of view.grenades) {
      glow('#ff9d3f', 16); ctx.fillStyle = '#ff9d3f';
      ctx.beginPath(); ctx.arc(g.x, g.y, 6, 0, Math.PI * 2); ctx.fill();
      noGlow();
    }
    // ankh crosses
    for (const a of view.ankhs) {
      const s = a.size, t = s * 0.34;
      glow('#7cff6b', 16); ctx.strokeStyle = '#7cff6b'; ctx.lineWidth = t * 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x - s, a.y); ctx.lineTo(a.x + s, a.y);
      ctx.moveTo(a.x, a.y - s); ctx.lineTo(a.x, a.y + s);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(a.x, a.y - s - 5, 6 + t * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
      noGlow();
    }
    // bots
    for (const b of Object.values(view.bots)) {
      if (!b.alive) continue;
      glow(b.color, 22);
      ctx.fillStyle = '#0b0b14'; ctx.strokeStyle = b.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, BOT_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
      // gun
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x + Math.cos(b.a) * 8, b.y + Math.sin(b.a) * 8);
      ctx.lineTo(b.x + Math.cos(b.a) * (BOT_R + 12), b.y + Math.sin(b.a) * (BOT_R + 12)); ctx.stroke();
      ctx.lineCap = 'butt';
      // name + hp
      noGlow();
      ctx.font = '600 13px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = b.color; ctx.fillText(b.name, b.x, b.y - BOT_R - 12);
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(b.x - 22, b.y - BOT_R - 9, 44, 4);
      ctx.fillStyle = b.hp > b.maxHp * 0.4 ? '#7cff6b' : '#ff4b4b';
      ctx.fillRect(b.x - 22, b.y - BOT_R - 9, 44 * b.hp / b.maxHp, 4);
    }
    // bullets (extrapolated between snapshots)
    const since = Math.min(0.15, (now - view.snapAt) / 1000);
    for (const b of view.bullets) {
      const x = b.x + b.vx * since, y = b.y + b.vy * since;
      const c = colorOf(b.o);
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
      if (p.items && p.items.levels.tesla) {
        noGlow(); ctx.strokeStyle = '#2ee6ff66'; ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.arc(x, y, bal('tesla', 'range', p.items.levels.tesla), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (p.items && p.items.shield > 0) {
        glow('#7cff6b', 28); ctx.strokeStyle = '#7cff6bcc'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, PR + 9, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.items && p.items.dash && p.items.levels.ram) {
        glow('#ffd23f', 22); ctx.strokeStyle = '#ffd23fbb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, PR + 6, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.items && p.items.phase > 0) {
        glow('#ff2e88', 34); ctx.strokeStyle = '#ff2e8899'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, PR + 10, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.items && p.items.actives.includes('snail') &&
          view.zones.some(z => z.o === p.id && Math.hypot(x - z.x, y - z.y) < z.r)) {
        glow('#7cff6b', 26); ctx.strokeStyle = '#7cff6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, PR + 12, 0, Math.PI * 2); ctx.stroke();
      }
      // name + hp
      noGlow();
      ctx.font = '600 14px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = p.color; ctx.fillText(p.name, x, y - PR - 12);
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(x - 22, y - PR - 9, 44, 4);
      ctx.fillStyle = p.hp > p.maxHp * 0.4 ? '#7cff6b' : '#ff4b4b';
      ctx.fillRect(x - 22, y - PR - 9, 44 * p.hp / p.maxHp, 4);
    }
    // tesla beams
    for (const b of beams) {
      ctx.globalAlpha = Math.min(1, b.life / 0.16);
      ctx.strokeStyle = b.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // particles
    noGlow();
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    // glass shards
    for (const sh of view.shards) {
      ctx.globalAlpha = Math.min(1, sh.life / 0.3);
      glow('#bff7ff', 8); ctx.strokeStyle = '#dffaff'; ctx.lineWidth = 2;
      const a = Math.atan2(sh.vy, sh.vx);
      ctx.beginPath();
      ctx.moveTo(sh.x - Math.cos(a) * 5, sh.y - Math.sin(a) * 5);
      ctx.lineTo(sh.x + Math.cos(a) * 6, sh.y + Math.sin(a) * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; noGlow();

    // hooks
    for (const h of view.hooks) {
      const owner = view.players[h.o];
      if (!owner) continue;
      const ox = h.o === myId ? local.x : owner.rx, oy = h.o === myId ? local.y : owner.ry;
      glow('#ffd23f', 10); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, Math.PI * 2); ctx.fill();
      noGlow();
    }
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
      ctx.fillText(`${p.name}  ${p.kills} / ${p.deaths}  ¤${p.coins}`, vw - 16, 16 + i * 22);
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
      if (me.items && me.items.levels.grenade) {
        const gd = (me.items.cd && me.items.cd.grenade) || 0;
        items.push([gd > 0 ? `гранаты ${Math.ceil(gd)}s` : `гранаты ×${me.items.ga || 0}`,
                    gd > 0 ? '#8b8ba3' : '#ff9d3f', 0]);
      }
      if (me.items && me.items.shield > 0) items.push([`щит ${Math.ceil(me.items.shield)}s`, '#7cff6b', 0]);
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
        ctx.fillText(`${i + 1}. ${p.name}   убийств ${p.kills}   смертей ${p.deaths}   ¤${p.coins}`, vw / 2, vh / 2 - 30 + i * 34);
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
    for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].life -= dt) <= 0) beams.splice(i, 1);
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

  function enterRoom() {
    if (started) return;
    started = true;
    ui.lobby.hidden = true;
    ui.wait.hidden = false;
    ui.room.hidden = true;
    ui.waitCode.textContent = roomCode;
    ui.roomCode.textContent = roomCode;
    ui.start.hidden = !isHost;
    view.phase = 'lobby';
    updateRoomUI();
    try { history.replaceState(null, '', location.pathname + '?room=' + roomCode); } catch {}
    if (isHost) { hostLast = performance.now(); setInterval(hostTick, 1000 / 60); }
    requestAnimationFrame(t => { last = t; frame(t); });
  }
})();
