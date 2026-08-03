(function (global) {
  "use strict";

  var SW = global.SW;
  var U = SW.util;
  var C = SW.CONST;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var sceneCv = null;
  var sceneCtx = null;

  var el = {
    hud: document.getElementById("hud"),
    distance: document.getElementById("hud-distance"),
    score: document.getElementById("hud-score"),
    deliveries: document.getElementById("hud-deliveries"),
    web: document.getElementById("hud-web"),
    shift: document.getElementById("hud-shift"),
    shiftPlan: document.getElementById("shift-plan"),
    shiftLeft: document.getElementById("shift-left"),
    stars: document.getElementById("res-stars"),
    optEndless: document.getElementById("opt-endless"),
    webFill: document.getElementById("web-fill"),
    webValue: document.getElementById("web-value"),
    best: document.getElementById("hud-best"),
    speed: document.getElementById("hud-speed"),
    combo: document.getElementById("hud-combo"),
    chain: document.getElementById("hud-chain"),
    startTasks: document.getElementById("start-tasks"),
    levelList: document.getElementById("level-list"),
    levelHint: document.getElementById("level-hint"),
    deadTasks: document.getElementById("dead-tasks"),
    breakdown: document.getElementById("res-breakdown"),
    hint: document.getElementById("hud-hint"),
    tutor: document.getElementById("hud-tutor"),
    popups: document.getElementById("hud-popups"),
    district: document.getElementById("hud-district"),
    weather: document.getElementById("hud-weather"),
    dash: document.getElementById("hud-dash"),
    contract: document.getElementById("hud-contract"),
    contractTimer: document.getElementById("contract-timer"),
    dashFill: document.getElementById("dash-fill"),
    overlay: document.getElementById("overlay"),
    startCard: document.getElementById("start-card"),
    deadCard: document.getElementById("dead-card"),
    pauseCard: document.getElementById("pause-card"),
    settingsCard: document.getElementById("settings-card"),
    deadTitle: document.getElementById("dead-title"),
    resDistance: document.getElementById("res-distance"),
    resScore: document.getElementById("res-score"),
    resDeliveries: document.getElementById("res-deliveries"),
    resBest: document.getElementById("res-best"),
    resNew: document.getElementById("res-new"),
    btnPlay: document.getElementById("btn-play"),
    btnRetry: document.getElementById("btn-retry"),
    btnSettings: document.getElementById("btn-settings"),
    btnSettingsClose: document.getElementById("btn-settings-close"),
    optPace: document.getElementById("opt-pace"),
    valPace: document.getElementById("val-pace"),
    optVolume: document.getElementById("opt-volume"),
    valVolume: document.getElementById("val-volume"),
    optHazards: document.getElementById("opt-hazards"),
    optWeather: document.getElementById("opt-weather"),
    optTutor: document.getElementById("opt-tutor"),
    optDaily: document.getElementById("opt-daily"),
    optLow: document.getElementById("opt-low"),
    optPerf: document.getElementById("opt-perf"),
    optCalm: document.getElementById("opt-calm"),
    optShapes: document.getElementById("opt-shapes"),
    perf: document.getElementById("hud-perf"),
    binds: document.getElementById("binds"),
  };

  var SETTINGS_KEY = "swing-settings-v1";
  var BEST_KEY = "swing-best-v1";
  var TUTOR_KEY = "swing-tutor-done-v1";

  function store(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  var settings = {
    pace: 0.7,
    volume: 0.5,
    hazards: true,
    weather: true,
    tutor: true,
    daily: false,
    level: 0,
    low: false,
    perf: false,
    calm: false,
    shapes: false,
    binds: null,
  };
  try {
    var saved = JSON.parse(load(SETTINGS_KEY, "null"));
    if (saved) {
      for (var k in settings) {
        if (saved[k] !== undefined) settings[k] = saved[k];
      }
    }
  } catch (e) {}

  function dailySeed() {
    var d = new Date();
    var key =
      d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    var h = 2166136261;
    var s = String(key);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var STARS_KEY = "swing-stars-v1";

  function starsOf(id) {
    return parseInt(load(STARS_KEY + "-" + id, "0"), 10) || 0;
  }

  function levelDef() {
    return SW.World.LEVELS[settings.level] || SW.World.LEVELS[0];
  }

  function bestKey() {
    var lvl = "-" + levelDef().id;
    return settings.daily ? BEST_KEY + lvl + "-daily-" + dailySeed() : BEST_KEY + lvl;
  }

  var DEFAULT_BINDS = {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    reelIn: ["KeyW", "ArrowUp"],
    reelOut: ["KeyS", "ArrowDown"],
    jump: ["Space"],
    dash: ["ShiftLeft", "ShiftRight"],
    zip: ["KeyE"],
  };

  var BIND_NAMES = {
    left: "Раскачка влево",
    right: "Раскачка вправо",
    reelIn: "Подтянуть нить / вверх по стене",
    reelOut: "Отпустить нить / вниз",
    jump: "Прыжок и толчок от стены",
    dash: "Рывок",
    zip: "Подтянуться к якорю",
  };

  var binds = {};
  var actionOf = {};

  function rebuildBinds() {
    binds = {};
    for (var a in DEFAULT_BINDS) {
      binds[a] = (settings.binds && settings.binds[a]) || DEFAULT_BINDS[a].slice();
    }
    actionOf = {};
    for (var act in binds) {
      for (var i = 0; i < binds[act].length; i++) actionOf[binds[act][i]] = act;
    }
  }

  function keyLabel(code) {
    return code
      .replace("Key", "")
      .replace("Digit", "")
      .replace("Arrow", "→")
      .replace("Left", "Shift/←")
      .replace("Space", "Пробел");
  }

  var game = {
    aimHit: null,
    state: "menu", // menu | playing | dead | paused | settings
    world: new SW.World(1),
    player: new SW.Player(),
    cam: { x: 0, y: -300, zoom: 1, shake: 0 },
    view: { w: 0, h: 0, dpr: 1 },
    aim: { sx: 0, sy: 0, x: 0, y: 0 },
    input: { moveX: 0, reel: 0, jump: false, zip: false },
    particles: [],
    webShots: [],
    shotCd: 0,
    targetEnemy: null,
    trail: [],
    time: 0,
    distance: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    chain: 0,
    breakdown: null,
    rescue: null,
    challenges: [],
    slowmo: 0,
    slowCd: 0,
    webWarned: false,
    lowTime: 0,
    lowAnnounced: false,
    deliveries: 0,
    streak: 0,
    deathReason: "",
    hinted: false,
    pointerDown: false,
    spaceWeb: false,
    tutorStep: 0,
    swings: 0,
    contract: { state: "idle", pickup: null, drop: null, timer: 0, limit: 0 },
    ghost: null,
    ghostIndex: 0,
    record: [],
    recordTimer: 0,
    runTime: 0,
    settings: settings,
  };

  game.best = parseInt(load(bestKey(), "0"), 10) || 0;
  el.best.textContent = game.best;

  // ---------------------------------------------------------------------------
  // Settings plumbing
  // ---------------------------------------------------------------------------

  function renderBinds() {
    el.binds.innerHTML = "";
    for (var act in binds) {
      (function (action) {
        var label = document.createElement("span");
        label.textContent = BIND_NAMES[action];
        var btn = document.createElement("button");
        btn.className = "bind-key";
        btn.textContent = binds[action].map(keyLabel).join(" / ");
        btn.addEventListener("click", function () {
          btn.classList.add("listening");
          btn.textContent = "нажмите клавишу";
          game.listening = { action: action, btn: btn };
        });
        el.binds.appendChild(label);
        el.binds.appendChild(btn);
      })(act);
    }
  }

  function applySettings() {
    SW.setPace(settings.pace);
    SW.audio.setVolume(settings.volume);
    game.world.hazardsOn = settings.hazards;
    game.world.weatherOn = settings.weather;
    el.optPace.value = settings.pace;
    el.valPace.textContent = settings.pace.toFixed(2);
    el.optVolume.value = Math.round(settings.volume * 100);
    el.valVolume.textContent = Math.round(settings.volume * 100);
    el.optHazards.checked = settings.hazards;
    el.optWeather.checked = settings.weather;
    el.optTutor.checked = settings.tutor;
    el.optDaily.checked = settings.daily;
    el.optEndless.checked = settings.endless;
    el.shift.classList.toggle("hidden", settings.endless);
    el.optLow.checked = settings.low;
    el.optPerf.checked = settings.perf;
    el.optCalm.checked = settings.calm;
    el.optShapes.checked = settings.shapes;
    el.perf.classList.toggle("hidden", !settings.perf);
    SW.Render.quality = settings.low ? 0 : 1;
    SW.Render.calm = !!settings.calm;
    SW.Render.shapes = !!settings.shapes;
    resize();
    store(SETTINGS_KEY, JSON.stringify(settings));
    game.best = parseInt(load(bestKey(), "0"), 10) || 0;
    el.best.textContent = game.best;
    if (el.levelList.children.length) renderLevels();
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  function resize() {
    var dpr = Math.min(global.devicePixelRatio || 1, settings.low ? 1 : 2);
    var w = canvas.clientWidth || global.innerWidth;
    var h = canvas.clientHeight || global.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    game.view.w = w;
    game.view.h = h;
    game.view.dpr = dpr;
    var pw = Math.floor(w * dpr);
    var ph = Math.floor(h * dpr);
    if (!sceneCv) {
      sceneCv = document.createElement("canvas");
      sceneCtx = sceneCv.getContext("2d");
    }
    if (sceneCv.width !== pw || sceneCv.height !== ph) {
      sceneCv.width = pw;
      sceneCv.height = ph;
    }
    if (!game.aim.sx) {
      game.aim.sx = w * 0.62;
      game.aim.sy = h * 0.28;
    }
  }
  global.addEventListener("resize", resize);

  function screenToWorld(sx, sy) {
    game.aim.x = (sx - game.view.w / 2) / game.cam.zoom + game.cam.x;
    game.aim.y = (sy - game.view.h / 2) / game.cam.zoom + game.cam.y;
  }

  function worldToScreen(x, y, out) {
    out.x = (x - game.cam.x) * game.cam.zoom + game.view.w / 2;
    out.y = (y - game.cam.y) * game.cam.zoom + game.view.h / 2;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  function newRun() {
    game.runId = (game.runId || 0) + 1;
    game.world.hazardsOn = settings.hazards;
    game.world.weatherOn = settings.weather;
    // Each level is its own map: fixed layout on the daily seed, fresh otherwise.
    game.world.reset(
      settings.daily ? dailySeed() ^ levelDef().seed : (Math.random() * 1e9) | 0,
      settings.level
    );
    var pad = game.world.buildings[0];
    game.player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);
    game.cam.x = game.player.pos.x;
    game.cam.y = game.player.pos.y - 60;
    game.cam.zoom = 1;
    game.cam.shake = 0;
    game.particles.length = 0;
    game.webShots.length = 0;
    game.shotCd = 0;
    game.targetEnemy = null;
    game.trail.length = 0;
    game.distance = 0;
    game.score = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.chain = 0;
    game.rescue = null;
    game.rescueCd = 10;
    game.challenges = buildChallenges();
    game.breakdown = {
      distance: 0,
      pizzas: 0,
      style: 0,
      perfect: 0,
      contracts: 0,
      enemies: 0,
      rescues: 0,
      challenges: 0,
    };
    game.lowTime = 0;
    game.slowmo = 0;
    game.slowCd = 0;
    game.webWarned = false;
    game.hits = 0;
    game.won = false;
    game.stars = 0;
    game.lowAnnounced = false;
    game.swings = 0;
    game.deathReason = "";
    game.contract.state = "idle";
    game.contract.pickup = null;
    game.contract.drop = null;
    game.contract.thief = null;
    game.deliveries = 0;
    game.streak = 0;
    game.player.carrying = false;
    game.contractRng = new U.Rng((game.world.startX | 0) ^ 0x9e3779b9 ^ Date.now());
    game.record.length = 0;
    game.recordTimer = 0;
    game.runTime = 0;
    game.ghostIndex = 0;
    game.ghost = settings.daily ? loadGhost() : null;
  }

  function startRun() {
    SW.audio.unlock();
    newRun();
    game.state = "playing";
    el.startCard.classList.add("hidden");
    el.deadCard.classList.add("hidden");
    el.pauseCard.classList.add("hidden");
    el.settingsCard.classList.add("hidden");
    el.overlay.classList.add("hidden");
    el.hud.classList.remove("hidden");
    el.hint.classList.remove("faded");
    game.hinted = false;
    game.tutorStep = settings.tutor && load(TUTOR_KEY, "0") !== "1" ? 1 : 0;
    updateTutor();
  }

  var STAR_LABELS = ["план", "время", "без потерь"];

  function shiftStars() {
    var def = levelDef();
    return [
      game.deliveries >= def.quota,
      game.runTime <= def.par,
      game.hits === 0,
    ];
  }

  function finishShift() {
    if (game.won) return;
    game.won = true;
    var def = levelDef();
    var earned = shiftStars();
    game.stars = earned.filter(Boolean).length;
    var prev = starsOf(def.id);
    if (game.stars > prev) store(STARS_KEY + "-" + def.id, String(game.stars));
    award("challenges", 600 * game.stars);
    SW.audio.ping(14);
    popup(game.player.pos.x, game.player.pos.y - 60, "СМЕНА СДАНА", true);
    var runId = game.runId;
    setTimeout(function () {
      if (game.runId === runId) endRun();
    }, 900);
  }

  function endRun() {
    game.state = "dead";
    var dist = Math.floor(game.distance);
    var score = Math.floor(game.score);
    var isBest = score > game.best;
    if (isBest) {
      game.best = score;
      store(bestKey(), String(game.best));
      saveGhost();
    }
    el.deadTitle.textContent = game.won
      ? "Смена сдана"
      : game.deathReason === "wall"
      ? "Стена оказалась ближе"
      : "Асфальт не прощает";

    el.stars.innerHTML = "";
    if (!settings.endless) {
      var earned = shiftStars();
      for (var si = 0; si < 3; si++) {
        var cell = document.createElement("span");
        cell.className = earned[si] && game.won ? "on" : "";
        cell.innerHTML =
          (earned[si] && game.won ? "★" : "☆") +
          "<small>" +
          STAR_LABELS[si] +
          "</small>";
        el.stars.appendChild(cell);
      }
    }
    el.resDistance.textContent = dist;
    el.resScore.textContent = score;
    el.resDeliveries.textContent = game.deliveries;
    el.resBest.textContent = game.best;
    el.best.textContent = game.best;
    var LABELS = {
      distance: "дистанция",
      pizzas: "пицца",
      style: "стиль",
      perfect: "точные отпускания",
      contracts: "доставка",
      enemies: "враги",
      rescues: "спасённые",
      challenges: "задачи",
    };
    el.breakdown.innerHTML = "";
    for (var key in LABELS) {
      var value = Math.round(game.breakdown[key] || 0);
      if (!value) continue;
      var row = document.createElement("div");
      var name = document.createElement("span");
      name.textContent = LABELS[key];
      var val = document.createElement("b");
      val.textContent = value;
      row.appendChild(name);
      row.appendChild(val);
      el.breakdown.appendChild(row);
    }
    renderChallenges(el.deadTasks);

    el.resNew.classList.toggle("hidden", !isBest);
    el.overlay.classList.remove("hidden");
    el.deadCard.classList.remove("hidden");
    el.tutor.classList.add("hidden");
  }

  game.kill = function (reason) {
    if (game.player.dead) return;
    game.deathReason = reason;
    game.player.dead = true;
    game.player.release();
    game.cam.shake = 22;
    SW.audio.crash();
    burst(
      game.player.pos.x,
      game.player.pos.y,
      reason === "ground" ? 26 : 20,
      "#ff6a4a"
    );
    var runId = game.runId;
    setTimeout(function () {
      if (game.state === "playing" && game.runId === runId) endRun();
    }, 850);
  };

  game.onAttach = function () {
    SW.audio.thwip();
    if (!game.hinted) {
      game.hinted = true;
      el.hint.classList.add("faded");
    }
    if (game.tutorStep === 1) {
      game.tutorStep = 2;
      updateTutor();
    }
  };

  game.onLand = function (impact) {
    game.chain = 0;
    SW.audio.thud();
    game.cam.shake = Math.max(game.cam.shake, U.clamp((impact || 0) / (90 * C.PACE), 0, 9));
  };

  game.onJump = function () {};

  game.onKick = function (x, y, nx, power) {
    SW.audio.kick();
    game.cam.shake = Math.max(game.cam.shake, 6);
  };

  game.onDash = function (x, y, ux, uy) {
    SW.audio.dash();
    for (var i = 0; i < 14; i++) {
      game.particles.push({
        x: x - ux * i * 6,
        y: y - uy * i * 6,
        vx: -ux * 120 * C.PACE,
        vy: -uy * 120 * C.PACE,
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.55,
        size: 2 + Math.random() * 3,
        color: "#ffc46b",
      });
    }
    ring(x, y, "rgba(255,196,107,0.9)");
    game.cam.shake = Math.max(game.cam.shake, 5);
    popup(x, y - 24, "РЫВОК", true);
  };

  game.onHazardHit = function (hz) {
    game.hits++;
    // A red model does not just knock you off course: it takes the parcel.
    if (
      game.contract.state === "carry" &&
      hz.color === "red" &&
      hz.state === "alive" &&
      !hz.stole
    ) {
      hz.stole = true;
      hz.carrying = true;
      game.contract.state = "stolen";
      game.contract.thief = hz;
      game.player.carrying = false;
      game.streak = 0;
      popup(hz.x, hz.y - 30, "ГРУЗ УКРАДЕН", true);
    }
    SW.audio.crash();
    burst(game.player.pos.x, game.player.pos.y, 16, "#ff8a5a", 240 * C.PACE);
    game.cam.shake = Math.max(game.cam.shake, 14);
    game.combo = 0;
    game.comboTimer = 0;
    popup(game.player.pos.x, game.player.pos.y - 30, "СБИТ", true);
  };

  game.onSnared = function () {
    game.hits++;
    SW.audio.crash();
    game.combo = 0;
    game.comboTimer = 0;
    game.chain = 0;
    game.cam.shake = Math.max(game.cam.shake, 10);
    popup(game.player.pos.x, game.player.pos.y - 34, "В СЕТИ", true);
  };

  game.onTetherBreak = function () {};

  game.onScrape = function (x, y, impact) {
    game.chain = 0;
    game.cam.shake = Math.max(game.cam.shake, U.clamp(impact / (140 * C.PACE), 0, 7));
  };

  // ---------------------------------------------------------------------------
  // Particles and popups
  // ---------------------------------------------------------------------------

  function burst(x, y, n, color, spread) {
    var s = spread || 260;
    if (settings.low) n = Math.ceil(n * 0.45);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * U.TAU;
      var v = Math.random() * s;
      game.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 2 + Math.random() * 3,
        color: color,
      });
    }
  }

  function ring(x, y, color) {
    game.particles.push({
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      life: 0.42,
      maxLife: 0.42,
      size: 26,
      color: color,
      ring: true,
    });
  }

  var _pt = { x: 0, y: 0 };

  function popup(worldX, worldY, text, warm) {
    worldToScreen(worldX, worldY, _pt);
    if (_pt.x < -80 || _pt.x > game.view.w + 80) return;
    var node = document.createElement("div");
    node.className = warm ? "popup warm" : "popup";
    node.textContent = text;
    node.style.left = Math.round(_pt.x) + "px";
    node.style.top = Math.round(U.clamp(_pt.y, 40, game.view.h - 40)) + "px";
    el.popups.appendChild(node);
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 1000);
  }

  function updateParticles(dt) {
    for (var i = game.particles.length - 1; i >= 0; i--) {
      var p = game.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        game.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
      p.vx *= 0.98;
    }
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  function multiplier() {
    return U.clamp(
      1 + game.combo * 0.25 + game.chain * 0.15 + game.streak * 0.3,
      1,
      10
    );
  }

  /** All score goes through here so the end screen can explain itself. */
  function award(kind, points) {
    game.score += points;
    if (game.breakdown) game.breakdown[kind] += points;
    return Math.round(points);
  }

  function bumpCombo(n) {
    game.combo += n;
    game.comboTimer = 5;
  }

  function collectPizzas() {
    var p = game.player;
    var pizzas = game.world.pizzas;
    var reach = C.PLAYER_R + 30;
    for (var i = 0; i < pizzas.length; i++) {
      var o = pizzas[i];
      if (o.taken) continue;
      if (o.x < p.pos.x - 200) continue;
      if (o.x > p.pos.x + 200) break;
      var dx = o.x - p.pos.x;
      var dy = o.y - p.pos.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      o.taken = true;
      bumpCombo(1);
      award("pizzas", 50 * multiplier());
      progressChallenge("pizzas", 1);
      var gained = p.addWeb(C.WEB_PER_PIZZA);
      game.webWarned = false;
      ring(o.x, o.y, "rgba(255,196,107,0.9)");
      burst(o.x, o.y, 6, "#ffc46b", 180);
      popup(o.x, o.y - 26, gained ? "+" + gained + " паутины" : "запас полон", true);
      SW.audio.ping(Math.min(game.combo - 1, 14));
    }
  }

  /**
   * Style: the only lethal surface is also the richest one. Flying low over the
   * street and shaving past facades both pay, so the risk has a purpose.
   */
  function styleScore(dt) {
    var p = game.player;
    if (p.dead || p.onRoof || p.onWall) {
      if (game.lowTime > 0.35) {
        var bonus = award("style", 140 * game.lowTime * multiplier());
        popup(p.pos.x, p.pos.y - 40, "НИЗКО +" + bonus, true);
        bumpCombo(1);
      }
      game.lowTime = 0;
      game.lowAnnounced = false;
      return;
    }

    var fast = p.speed() > 340 * C.PACE;
    if (p.altitude() < C.LOW_ALTITUDE && fast) {
      game.lowTime += dt;
      award("style", 90 * dt * multiplier());
      if (!game.lowAnnounced && game.lowTime > 0.3) {
        game.lowAnnounced = true;
        popup(p.pos.x, p.pos.y - 46, "НАД САМОЙ УЛИЦЕЙ", true);
      }
    } else if (game.lowTime > 0) {
      if (game.lowTime > 0.35) {
        var b2 = award("style", 140 * game.lowTime * multiplier());
        popup(p.pos.x, p.pos.y - 40, "НИЗКО +" + b2, true);
        bumpCombo(1);
      }
      game.lowTime = 0;
      game.lowAnnounced = false;
    }

  }

  // ---------------------------------------------------------------------------
  // Daily challenges
  // ---------------------------------------------------------------------------

  var CHALLENGE_KEY = "swing-daily-tasks-v1";

  var CHALLENGE_POOL = [
    { id: "enemies", text: "Сбей %n врагов паутиной", min: 4, max: 7, bonus: 900 },
    { id: "pizzas", text: "Собери %n пицц", min: 14, max: 26, bonus: 700 },
    { id: "contracts", text: "Доставь %n груза", min: 3, max: 5, bonus: 1200 },
    { id: "rescues", text: "Спаси %n человек", min: 1, max: 3, bonus: 1100 },
    { id: "perfect", text: "Отпусти нить точно %n раз", min: 5, max: 10, bonus: 800 },
    { id: "chain", text: "Слепи серию из %n качаний без касания", min: 5, max: 9, bonus: 900 },
  ];

  function buildChallenges() {
    var rng = new U.Rng(dailySeed() ^ 0x51ed270b);
    var pool = CHALLENGE_POOL.slice();
    var out = [];

    // The courier always has a delivery quota; the rest of the day varies.
    var quotaIndex = -1;
    for (var q = 0; q < pool.length; q++) {
      if (pool[q].id === "contracts") quotaIndex = q;
    }
    if (quotaIndex >= 0) {
      var quota = pool.splice(quotaIndex, 1)[0];
      var qTarget = rng.int(quota.min, quota.max);
      out.push({
        id: quota.id,
        text: quota.text.replace("%n", qTarget),
        target: qTarget,
        bonus: quota.bonus,
        progress: 0,
        done: false,
      });
    }

    for (var i = out.length; i < 3 && pool.length; i++) {
      var def = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      var target = rng.int(def.min, def.max);
      out.push({
        id: def.id,
        text: def.text.replace("%n", target),
        target: target,
        bonus: def.bonus,
        progress: 0,
        done: false,
      });
    }
    var saved = load(CHALLENGE_KEY + "-" + dailySeed(), "");
    for (var k = 0; k < out.length; k++) {
      if (saved.charAt(k) === "1") out[k].claimed = true;
    }
    return out;
  }

  function saveChallenges() {
    var mask = "";
    for (var i = 0; i < game.challenges.length; i++) {
      mask += game.challenges[i].done || game.challenges[i].claimed ? "1" : "0";
    }
    store(CHALLENGE_KEY + "-" + dailySeed(), mask);
  }

  function progressChallenge(id, amount) {
    for (var i = 0; i < game.challenges.length; i++) {
      var c = game.challenges[i];
      if (c.id !== id || c.done) continue;
      c.progress = Math.max(c.progress, 0) + amount;
      if (c.progress >= c.target) {
        c.done = true;
        var pts = award("challenges", c.bonus * multiplier());
        popup(game.player.pos.x, game.player.pos.y - 60, "ЗАДАЧА +" + pts, true);
        SW.audio.ping(14);
        saveChallenges();
      }
    }
  }

  function setChallenge(id, value) {
    for (var i = 0; i < game.challenges.length; i++) {
      var c = game.challenges[i];
      if (c.id !== id || c.done) continue;
      if (value > c.progress) {
        c.progress = value;
        if (c.progress >= c.target) progressChallenge(id, 0);
      }
    }
  }

  function renderChallenges(node) {
    node.innerHTML = "";
    for (var i = 0; i < game.challenges.length; i++) {
      var c = game.challenges[i];
      var row = document.createElement("div");
      row.className = "task" + (c.done || c.claimed ? " done" : "");
      var name = document.createElement("span");
      name.textContent = c.text;
      var val = document.createElement("b");
      val.textContent =
        c.done || c.claimed ? "готово" : Math.min(c.progress, c.target) + "/" + c.target;
      row.appendChild(name);
      row.appendChild(val);
      node.appendChild(row);
    }
  }

  // ---------------------------------------------------------------------------
  // Rescue: someone falls, and only speed decides whether they land
  // ---------------------------------------------------------------------------

  function spawnRescue() {
    var spot = pickRoof(game.player.pos.x, 900, 2200);
    if (!spot || spot.y > -420) return;
    game.rescue = {
      x: spot.x,
      y: spot.y - 20,
      vy: 0,
      state: "wait",
      phase: 0,
    };
  }

  function updateRescue(dt) {
    var r = game.rescue;
    var p = game.player;
    if (!r) {
      game.rescueCd -= dt;
      if (game.rescueCd <= 0) {
        spawnRescue();
        // No tall roof ahead: try again shortly instead of losing the event.
        game.rescueCd = game.rescue ? 14 + Math.random() * 12 : 1.5;
      }
      return;
    }

    r.phase += dt;
    if (r.state === "wait") {
      if (Math.abs(p.pos.x - r.x) < 1000) {
        r.state = "fall";
        popup(r.x, r.y - 40, "ЧЕЛОВЕК ПАДАЕТ", true);
        SW.audio.ping(2);
      } else if (p.pos.x > r.x + 400) {
        game.rescue = null;
      }
      return;
    }

    if (r.state === "fall") {
      r.vy += C.GRAVITY * C.RESCUE_FALL * dt;
      r.y += r.vy * dt;
      var dx = p.pos.x - r.x;
      var dy = p.pos.y - r.y;
      if (dx * dx + dy * dy < 56 * 56) {
        var pts = award("rescues", 650 * multiplier());
        bumpCombo(2);
        progressChallenge("rescues", 1);
        popup(r.x, r.y - 30, "СПАСЁН +" + pts, true);
        ring(r.x, r.y, "rgba(255,240,180,0.95)");
        burst(r.x, r.y, 14, "#ffe8a8", 220 * C.PACE);
        SW.audio.ping(13);
        game.rescue = null;
        return;
      }
      if (r.y > C.GROUND_Y - 14) {
        popup(r.x, C.GROUND_Y - 70, "НЕ УСПЕЛ");
        burst(r.x, C.GROUND_Y - 8, 10, "#8590b8", 140);
        game.rescue = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Shooting web at enemies
  // ---------------------------------------------------------------------------

  var _hand = { x: 0, y: 0 };

  function fireWebShot(tx, ty) {
    var p = game.player;
    if (game.shotCd > 0 || p.dead || p.stun > 0) return false;
    if (!p.hasWeb(C.WEB_COST_SHOT)) {
      outOfWeb();
      return false;
    }
    var dx = tx - p.pos.x;
    var dy = ty - p.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return false;
    game.shotCd = C.WEB_SHOT_CD;
    p.spendWeb(C.WEB_COST_SHOT);
    p.handPos(_hand);
    game.webShots.push({
      x: _hand.x,
      y: _hand.y,
      vx: (dx / d) * C.WEB_SHOT_SPEED,
      vy: (dy / d) * C.WEB_SHOT_SPEED,
      life: C.WEB_SHOT_LIFE,
      ox: p.pos.x,
      oy: p.pos.y,
    });
    p.missDir = { x: dx / d, y: dy / d };
    SW.audio.thwip();
    return true;
  }

  function updateWebShots(dt) {
    game.shotCd -= dt;
    for (var i = game.webShots.length - 1; i >= 0; i--) {
      var s = game.webShots[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      var enemy = game.world.enemyAt(s.x, s.y, C.WEB_SHOT_R);
      if (enemy) {
        game.webShots.splice(i, 1);
        var downed = game.world.webEnemy(enemy);
        if (downed && enemy.stole && game.contract.state === "stolen") {
          enemy.stole = false;
          enemy.carrying = false;
          game.contract.state = "offer";
          game.contract.pickup = { x: enemy.x, y: enemy.y };
          game.contract.thief = null;
          popup(enemy.x, enemy.y - 34, "ГРУЗ ОТБИТ", true);
          SW.audio.ping(10);
        }
        burst(s.x, s.y, downed ? 12 : 6, "#ffffff", 170 * C.PACE);
        if (downed) {
          var pts = award(
            "enemies",
            (enemy.type === "hunter"
              ? 220
              : enemy.type === "sentry"
              ? 160
              : enemy.type === "netter"
              ? 180
              : 120) * multiplier()
          );
          bumpCombo(1);
          progressChallenge("enemies", 1);
          ring(s.x, s.y, "rgba(255,255,255,0.9)");
          popup(enemy.x, enemy.y - 26, "СБИТ +" + pts);
          SW.audio.ping(Math.min(game.combo, 12));
        } else {
          popup(enemy.x, enemy.y - 26, "ПОПАЛ");
          SW.audio.thud();
        }
        continue;
      }

      if (s.life <= 0 || s.y > C.GROUND_Y || game.world.collide(s.x, s.y, 3)) {
        burst(s.x, s.y, 3, "#dfe8ff", 80 * C.PACE);
        game.webShots.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Contracts: a reason to go somewhere specific instead of just forward
  // ---------------------------------------------------------------------------

  var GHOST_KEY = "swing-ghost-v1";
  var GHOST_STEP = 0.1;

  function loadGhost() {
    try {
      var raw = JSON.parse(load(GHOST_KEY + "-" + dailySeed(), "null"));
      return raw && raw.length ? raw : null;
    } catch (e) {
      return null;
    }
  }

  function saveGhost() {
    if (!settings.daily || game.record.length < 20) return;
    store(GHOST_KEY + "-" + dailySeed(), JSON.stringify(game.record));
  }

  /** A wide roof ahead of x, used for both pickup and drop points. */
  function pickRoof(fromX, minAhead, maxAhead) {
    game.world.ensureUpTo(fromX + maxAhead + 800);
    var bs = game.world.buildings;
    var options = [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var cx = b.x + b.w * 0.5;
      if (cx < fromX + minAhead || cx > fromX + maxAhead) continue;
      if (b.w < 100) continue;
      // Never on top of a chimney, a billboard or a stepped tier.
      var spot = game.world.freeRoofSpot(b, 26);
      if (spot) options.push(spot);
    }
    if (!options.length) return null;
    return options[game.contractRng.int(0, options.length - 1)];
  }

  function updateContract(dt) {
    var c = game.contract;
    var p = game.player;

    if (c.state === "idle") {
      var near = game.deliveries === 0 && game.distance < 30;
      var spot = pickRoof(p.pos.x, near ? 500 : 1100, near ? 1500 : 2400);
      if (spot) {
        c.pickup = { x: spot.x, y: spot.y - 26 };
        c.state = "offer";
      }
      return;
    }

    if (c.state === "offer") {
      if (p.pos.x > c.pickup.x + 900) {
        c.state = "idle"; // missed it, offer another one further on
        return;
      }
      var dx = p.pos.x - c.pickup.x;
      var dy = p.pos.y - c.pickup.y;
      if (dx * dx + dy * dy < 46 * 46) {
        var drop = pickRoof(p.pos.x, 1500, 3200);
        if (!drop) return;
        c.drop = { x: drop.x, y: drop.y };
        c.limit = Math.max(6, (drop.x - p.pos.x) / (330 * C.PACE));
        c.timer = c.limit;
        c.state = "carry";
        game.player.carrying = true;
        SW.audio.ping(6);
        popup(c.pickup.x, c.pickup.y - 30, "ГРУЗ ВЗЯТ", true);
        ring(c.pickup.x, c.pickup.y, "rgba(255,196,107,0.9)");
      }
      return;
    }

    if (c.state === "stolen") {
      var thief = c.thief;
      if (!thief || thief.removed || thief.state !== "alive") {
        // Lost him: the job is gone, a new one will turn up.
        if (thief && thief.state === "webbed") return;
        popup(p.pos.x, p.pos.y - 40, "ГРУЗ ПОТЕРЯН", true);
        c.state = "idle";
        c.thief = null;
        c.drop = null;
        return;
      }
      if (Math.abs(thief.x - p.pos.x) > 3000) {
        popup(p.pos.x, p.pos.y - 40, "ГРУЗ ПОТЕРЯН", true);
        c.state = "idle";
        c.thief = null;
        c.drop = null;
      }
      return;
    }

    if (c.state === "carry") {
      c.timer -= dt;
      if (c.timer <= 0) {
        popup(p.pos.x, p.pos.y - 40, "ПРОСРОЧЕНО", true);
        game.streak = 0;
        game.player.carrying = false;
        c.state = "idle";
        c.drop = null;
        return;
      }
      var ddx = p.pos.x - c.drop.x;
      var ddy = p.pos.y - c.drop.y;
      if (ddx * ddx + ddy * ddy < 60 * 60) {
        game.deliveries++;
        game.streak++;
        game.player.carrying = false;
        var bonus = award("contracts", (400 + c.timer * 50) * multiplier());
        bumpCombo(2);
        progressChallenge("contracts", 1);
        popup(
          c.drop.x,
          c.drop.y - 40,
          "ДОСТАВЛЕНО +" + bonus + (game.streak > 1 ? "  x" + game.streak : ""),
          true
        );
        ring(c.drop.x, c.drop.y, "rgba(120,240,255,0.95)");
        burst(c.drop.x, c.drop.y, 14, "#8ff0ff", 220 * C.PACE);
        SW.audio.ping(12);
        c.state = "idle";
        c.drop = null;
      }
    }
  }

  function updateGhost(dt) {
    game.runTime += dt;
    game.recordTimer -= dt;
    if (game.recordTimer <= 0 && game.record.length < 3000) {
      game.recordTimer = GHOST_STEP;
      game.record.push(Math.round(game.player.pos.x), Math.round(game.player.pos.y));
    }
    if (game.ghost) {
      game.ghostIndex = Math.min(
        Math.floor(game.runTime / GHOST_STEP) * 2,
        game.ghost.length - 2
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function step(dt) {
    var p = game.player;
    p.update(dt, game.input, game.world, game);

    updateWebShots(dt);
    dryCd -= dt;

    // One warning per drain, not a siren every frame.
    if (!game.player.dead) {
      if (game.player.webAmmo <= 4 && !game.webWarned) {
        game.webWarned = true;
        SW.audio.warn();
      } else if (game.player.webAmmo > 6) {
        game.webWarned = false;
      }
    }

    if (!p.dead) {
      var hz = game.world.hazardAt(p.pos.x, p.pos.y, C.PLAYER_R);
      if (hz) p.hit(hz, game);
      var incoming = game.world.shotAt(p.pos.x, p.pos.y, C.PLAYER_R);
      if (incoming) {
        if (incoming.net && incoming.src) {
          p.snare({ x: incoming.src.x, y: incoming.src.y, obj: incoming.src }, game);
        } else {
          p.hit(incoming, game);
        }
      }

      collectPizzas();
      styleScore(dt);
      updateContract(dt);
      updateRescue(dt);
      updateGhost(dt);

      // Last chance: the world slows while the dash is still available.
      game.slowCd -= dt;
      if (
        game.slowmo <= 0 &&
        game.slowCd <= 0 &&
        p.canDash() &&
        p.altitude() < C.SLOWMO_ALT &&
        p.vel.y > 260 * C.PACE &&
        !p.onRoof &&
        !p.onWall
      ) {
        game.slowmo = C.SLOWMO_TIME;
        game.slowCd = C.SLOWMO_COOLDOWN;
        SW.audio.slowmo();
        popup(p.pos.x, p.pos.y - 36, "РЫВОК!", true);
      }

      var d = (p.pos.x - game.world.startX) / C.PIXELS_PER_METER;
      if (d > game.distance) {
        award("distance", d - game.distance);
        game.distance = d;
      }

      // The shift ends on the roof finish pad once the delivery plan is done.
      if (!settings.endless && !game.won) {
        var def = levelDef();
        if (game.deliveries >= def.quota && game.world.finish) {
          var f = game.world.finish;
          var fdx = p.pos.x - f.x;
          var fdy = p.pos.y - (f.y - C.PLAYER_R);
          if (fdx * fdx + fdy * fdy < 58 * 58) finishShift();
        }
      }
      if (game.comboTimer > 0) {
        game.comboTimer -= dt;
        if (game.comboTimer <= 0) game.combo = 0;
      }
    }

    game.world.update(dt, p.pos.x, p.pos.y);
    game.world.ensureUpTo(game.cam.x + 3600);
    if (!settings.endless && !game.world.finish) {
      var routeDef = levelDef();
      game.world.ensureUpTo(
        game.world.startX + routeDef.length * C.PIXELS_PER_METER + 1600
      );
      game.world._ensureFinish();
    }
    if (game.world.wavePulse && game.state === "playing" && !p.dead) {
      popup(p.pos.x, p.pos.y - 48, "ВОЛНА ×" + game.world.wavePulse, true);
      game.world.wavePulse = 0;
    }
    game.world.prune(game.cam.x - 2200);
    updateParticles(dt);
  }

  function updateCamera(dt) {
    var p = game.player;
    var cam = game.cam;
    var sp = p.speed();

    var tx = p.pos.x + U.clamp(p.vel.x * 0.3, -240, 380);
    var ty = p.pos.y + U.clamp(p.vel.y * 0.16, -170, 210) - 30;
    cam.x = U.damp(cam.x, tx, 6, dt);
    cam.y = U.damp(cam.y, ty, 4.6, dt);

    var tz = 1 - U.clamp((sp - 520 * C.PACE) / (2600 * C.PACE), 0, 0.34);
    cam.zoom = U.damp(cam.zoom, tz, 3, dt);
    cam.shake = U.damp(cam.shake, 0, 6, dt);
  }

  var lastDistrict = "";

  function updateHud() {
    var p = game.player;
    el.distance.textContent = Math.floor(game.distance);
    el.score.textContent = Math.floor(game.score);
    el.deliveries.textContent = game.deliveries;
    el.speed.textContent = Math.round((p.speed() / C.PIXELS_PER_METER) * 3.6);

    var m = multiplier();
    if (game.combo > 0 && m > 1) {
      el.combo.textContent = "x" + m.toFixed(1);
      el.combo.classList.remove("hidden");
    } else {
      el.combo.classList.add("hidden");
    }

    if (!settings.endless) {
      var def = levelDef();
      var left = Math.ceil(game.world.finishMetersLeft(p.pos.x));
      var planDone = game.deliveries >= def.quota;
      el.shiftPlan.textContent = game.deliveries + "/" + def.quota;
      el.shiftLeft.textContent = left + " м";
      el.shift.classList.toggle("done", planDone && left <= 8);
    }

    var ammo = p.webAmmo;
    el.webValue.textContent = Math.floor(ammo);
    el.webFill.style.width = ((100 * ammo) / C.WEB_MAX).toFixed(1) + "%";
    el.web.classList.toggle("low", ammo <= 4);
    el.web.classList.toggle("empty", ammo <= 0);

    if (game.chain > 1) {
      el.chain.textContent = "серия " + game.chain;
      el.chain.classList.remove("hidden");
    } else {
      el.chain.classList.add("hidden");
    }

    var d = game.world.districtAt();
    if (d.def.name !== lastDistrict) {
      lastDistrict = d.def.name;
      el.district.textContent = d.def.name;
    }

    var w = game.world.weather;
    var parts = [];
    if (Math.abs(w.wind) > 0.12) {
      parts.push("ветер " + (w.wind > 0 ? "→" : "←"));
    }
    if (w.rain > 0.15) parts.push("дождь");
    if (w.fog > 0.15) parts.push("туман");
    el.weather.textContent = parts.join(" · ");

    var c = game.contract;
    if (c.state === "carry") {
      el.contract.classList.remove("hidden");
      el.contract.classList.toggle("urgent", c.timer < 3);
      el.contractTimer.textContent = c.timer.toFixed(1);
    } else {
      el.contract.classList.add("hidden");
    }
    el.shift.classList.toggle("heavy", !!p.carrying);

    var ready = p.dashCd <= 0;
    el.dash.classList.toggle("ready", ready);
    el.dashFill.style.width = ready
      ? "100%"
      : (100 * (1 - p.dashCd / C.DASH_COOLDOWN)).toFixed(1) + "%";
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  var ENEMY_HINT_KEY = "swing-enemy-hint-v1";

  function maybeEnemyHint() {
    if (game.enemyHintShown || load(ENEMY_HINT_KEY, "0") === "1") return;
    game.enemyHintShown = true;
    store(ENEMY_HINT_KEY, "1");
    el.tutor.textContent = "Враг на прицеле — стреляй паутиной, чтобы сбить";
    el.tutor.classList.remove("hidden");
    setTimeout(function () {
      if (!game.tutorStep) el.tutor.classList.add("hidden");
      else updateTutor();
    }, 4500);
  }

  var TUTOR_TEXT = {
    1: "Зажми мышь и выстрели паутину вверх-вперёд",
    2: "Отпусти в нижней точке дуги — так сохраняется скорость",
    3: "Забери груз на крыше и донеси до светящейся площадки",
  };

  function updateTutor() {
    if (!game.tutorStep) {
      el.tutor.classList.add("hidden");
      return;
    }
    el.tutor.textContent = TUTOR_TEXT[game.tutorStep];
    el.tutor.classList.remove("hidden");
  }

  function tutorSwingDone() {
    game.swings++;
    if (game.tutorStep === 2) {
      game.tutorStep = 3;
      updateTutor();
      setTimeout(function () {
        if (game.tutorStep === 3) {
          game.tutorStep = 0;
          store(TUTOR_KEY, "1");
          updateTutor();
        }
      }, 5000);
    }
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  function draw() {
    var w = game.view.w;
    var h = game.view.h;
    var dpr = game.view.dpr;
    var cam = game.cam;
    var p = game.player;
    var sp = p.speed();
    var intensity = U.clamp((sp - 900 * C.PACE) / (1600 * C.PACE), 0, 1);
    var district = game.world.districtAt();
    var sky = SW.Render.palette(district);
    var accent = district.def.accent || "#ff3b6b";

    SW.Render.accent = accent;
    SW.Render.wet = settings.weather ? game.world.weather.rain : 0;

    var sctx = sceneCtx;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);

    SW.Render.sky(sctx, cam, w, h, sky);
    SW.Render.stars(sctx, cam, w, h);
    SW.Render.parallax(sctx, cam, w, h, district);
    SW.Render.ground(sctx, cam, w, h, game.time);

    var shakeAmt = settings.calm ? 0 : cam.shake;
    var shakeX = (Math.random() - 0.5) * shakeAmt;
    var shakeY = (Math.random() - 0.5) * shakeAmt;

    sctx.save();
    sctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    sctx.scale(cam.zoom, cam.zoom);
    sctx.translate(-cam.x, -cam.y);

    SW.Render.buildings(sctx, game.world, cam, w);
    SW.Render.props(sctx, game.world, cam, w, game.time);
    SW.Render.pizzas(sctx, game.world, cam, w, game.time);
    SW.Render.hazards(sctx, game.world, cam, w, game.time);
    SW.Render.enemyShots(sctx, game.world.shots);
    SW.Render.webShots(sctx, game.webShots);
    if (game.targetEnemy && game.state === "playing") {
      SW.Render.target(sctx, game.targetEnemy, game.time);
    }

    if (game.state === "playing" && !p.dead) {
      SW.Render.aim(sctx, p, game.world, game.aim, game.aimHit);
    }
    SW.Render.contract(sctx, game.contract, game.time);
    SW.Render.rescue(sctx, game.rescue, game.time);
    if (!settings.endless && game.world.finish && game.state === "playing") {
      SW.Render.finishPad(sctx, game.world.finish, game.time, accent);
    }
    if (game.state !== "menu" && game.state !== "settings") {
      SW.Render.tether(sctx, p);
    }
    if (game.ghost && game.state === "playing") {
      SW.Render.ghost(
        sctx,
        game.ghost[game.ghostIndex],
        game.ghost[game.ghostIndex + 1]
      );
    }
    SW.Render.trail(sctx, game.trail);
    if (game.state !== "menu" && game.state !== "settings") {
      SW.Render.web(sctx, p);
      SW.Render.particles(sctx, game.particles);
      p.draw(sctx);
    }

    sctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sceneCv, 0, 0, w, h);
    if (SW.Render.quality > 0) {
      SW.Render.bloom(ctx, sceneCv, w, h, 0.52);
    }

    if (settings.weather) {
      SW.Render.weather(ctx, cam, w, h, game.world.weather, game.time);
    }
    if (game.slowmo > 0 && game.state === "playing") {
      SW.Render.slowmo(ctx, w, h, game.slowmo / C.SLOWMO_TIME);
    }
    if (game.state === "playing" && !p.dead && !p.hasWeb(C.WEB_COST_SWING)) {
      var nearest = null;
      var bestD = 4000;
      var list = game.world.pizzas;
      for (var pi = 0; pi < list.length; pi++) {
        var o = list[pi];
        if (o.taken || o.x < p.pos.x - 300) continue;
        var od = Math.hypot(o.x - p.pos.x, o.y - p.pos.y);
        if (od < bestD) {
          bestD = od;
          nearest = o;
        }
      }
      if (nearest) {
        worldToScreen(nearest.x, nearest.y, _pt);
        SW.Render.marker(ctx, w, h, _pt.x, _pt.y, "#ffc46b", "пицца");
      }
    }

    if (
      !settings.endless &&
      game.world.finish &&
      game.deliveries >= levelDef().quota &&
      game.state === "playing" &&
      !p.dead
    ) {
      worldToScreen(game.world.finish.x, game.world.finish.y, _pt);
      SW.Render.marker(ctx, w, h, _pt.x, _pt.y, accent, "финиш");
    }

    if (game.rescue && game.rescue.state === "fall" && game.state === "playing") {
      worldToScreen(game.rescue.x, game.rescue.y, _pt);
      SW.Render.marker(ctx, w, h, _pt.x, _pt.y, "#ffe8a8", "спаси!");
    }

    var target =
      game.contract.state === "carry"
        ? game.contract.drop
        : game.contract.state === "stolen"
        ? game.contract.thief
        : game.contract.state === "offer"
        ? game.contract.pickup
        : null;
    if (target && game.state === "playing") {
      worldToScreen(target.x, target.y, _pt);
      SW.Render.marker(
        ctx,
        w,
        h,
        _pt.x,
        _pt.y,
        game.contract.state === "carry"
          ? "#8ff0ff"
          : game.contract.state === "stolen"
          ? "#ff6a6a"
          : "#ffc46b",
        Math.round(Math.abs(target.x - p.pos.x) / C.PIXELS_PER_METER) + " м"
      );
    }

    if (!settings.calm) SW.Render.speedLines(ctx, w, h, intensity);
    SW.Render.vignette(ctx, w, h, intensity);
  }

  function updateAim() {
    game.aimHit = null;
    game.targetEnemy = null;
    var p = game.player;
    if (game.state !== "playing" || p.dead) return;
    // An enemy under the cursor turns the web into a weapon, in any direction.
    game.targetEnemy = game.world.enemyNear(game.aim.x, game.aim.y, 90);
    if (game.targetEnemy) {
      maybeEnemyHint();
      return;
    }
    if (p.web === "attached") return;
    // The reticle shows the anchor magnetism will actually choose.
    game.aimHit = p.aimAssist(game.aim.x, game.aim.y, game.world);
  }

  var last = 0;
  var acc = 0;
  var FIXED = 1 / 120;
  var frameMs = 0;
  var perfTimer = 0;
  var frameCount = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var frameStart = now;
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.time += dt;
    frameCount++;

    if (game.state === "playing" || game.state === "dead") {
      var scale = 1;
      if (game.slowmo > 0) {
        game.slowmo = Math.max(0, game.slowmo - dt);
        scale = C.SLOWMO_SCALE;
      }
      acc += dt * scale;
      var steps = 0;
      while (acc >= FIXED && steps < 8) {
        step(FIXED);
        acc -= FIXED;
        steps++;
      }
      if (steps === 8) acc = 0;
      updateCamera(dt);

      var p = game.player;
      if (p.speed() > 220 * C.PACE) {
        game.trail.push({ x: p.pos.x, y: p.pos.y });
        if (game.trail.length > 26) game.trail.shift();
      } else if (game.trail.length) {
        game.trail.shift();
      }
      if (game.state === "playing") {
        updateHud();
        SW.audio.setWind(p.speed() / C.MAX_SPEED);
      } else {
        SW.audio.setWind(0);
      }
    } else {
      SW.audio.setWind(0);
      game.cam.x += 26 * dt;
      updateParticles(dt);
      game.world.update(dt, game.cam.x);
      game.world.ensureUpTo(game.cam.x + 3600);
    }

    screenToWorld(game.aim.sx, game.aim.sy);
    // Anchor magnetism simulates candidate swings, so halve it when asked.
    if (!settings.low || frameCount % 2 === 0) updateAim();
    draw();

    if (settings.perf) {
      var spent = (global.performance ? performance.now() : Date.now()) - frameStart;
      frameMs = frameMs * 0.9 + spent * 0.1;
      perfTimer -= dt;
      if (perfTimer <= 0) {
        perfTimer = 0.4;
        el.perf.textContent =
          frameMs.toFixed(1) +
          " мс · " +
          Math.round(1 / Math.max(dt, 0.0001)) +
          " fps · " +
          game.world.boxes.length +
          " тел";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  var keys = {};

  function held(action) {
    var list = binds[action] || [];
    for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true;
    return false;
  }

  function refreshMove() {
    game.input.moveX = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    game.input.reel = (held("reelIn") ? 1 : 0) - (held("reelOut") ? 1 : 0);
    game.input.zip = held("zip") || touchActs.zip;
  }

  function releaseWeb() {
    var p = game.player;
    if (p.web !== "attached") {
      p.release();
      return;
    }
    tutorSwingDone();
    p.release();
    game.chain++;
    setChallenge("chain", game.chain);
    if (p.releasePerfect) {
      var pts = award("perfect", 90 * multiplier());
      bumpCombo(1);
      progressChallenge("perfect", 1);
      popup(p.pos.x, p.pos.y - 34, "ТОЧНО +" + pts);
      ring(p.pos.x, p.pos.y, "rgba(255,255,255,0.85)");
      SW.audio.ping(Math.min(game.combo + 4, 14));
    }
  }

  var dryCd = 0;

  function outOfWeb() {
    if (dryCd > 0) return;
    dryCd = 1.2;
    SW.audio.warn();
    popup(game.player.pos.x, game.player.pos.y - 34, "ПАУТИНА КОНЧИЛАСЬ", true);
  }

  /** Where a rival will be when the web gets there. */
  function interceptOf(e) {
    var p = game.player;
    var vx = e.vx || 0;
    var vy = e.vy || 0;
    var tx = e.x;
    var ty = e.y;
    for (var i = 0; i < 2; i++) {
      var t = Math.hypot(tx - p.pos.x, ty - p.pos.y) / C.WEB_SHOT_SPEED;
      tx = e.x + vx * t;
      ty = e.y + vy * t;
    }
    return { x: tx, y: ty };
  }

  function fireOrKick() {
    var p = game.player;
    if (game.targetEnemy) {
      // The target is already chosen, so the throw leads it instead of
      // trailing behind a rival running along a roof.
      var aimAt = interceptOf(game.targetEnemy);
      fireWebShot(aimAt.x, aimAt.y);
      return;
    }
    if (p.shoot(game.aim.x, game.aim.y, game.world)) return;
    if (!p.hasWeb(C.WEB_COST_SWING) && !p.tether && p.stun <= 0) outOfWeb();
    if (p.canKick()) p.kickToward(game.aim.x, game.aim.y, game);
  }

  function openSettings() {
    game.state = "settings";
    el.overlay.classList.remove("hidden");
    el.startCard.classList.add("hidden");
    el.settingsCard.classList.remove("hidden");
  }

  function closeSettings() {
    game.state = "menu";
    el.settingsCard.classList.add("hidden");
    el.startCard.classList.remove("hidden");
  }

  global.addEventListener("keydown", function (e) {
    if (e.repeat) return;

    if (game.listening) {
      e.preventDefault();
      var act = game.listening.action;
      binds[act] = [e.code];
      settings.binds = binds;
      game.listening.btn.classList.remove("listening");
      game.listening = null;
      rebuildBinds();
      renderBinds();
      applySettings();
      return;
    }

    keys[e.code] = true;
    refreshMove();

    var action = actionOf[e.code];
    if (action === "jump") {
      e.preventDefault();
      if (game.state === "menu") {
        startRun();
        return;
      }
      if (game.state !== "playing") return;
      if (game.player.onRoof || game.player.canKick()) {
        game.input.jump = true;
      } else if (game.player.web !== "attached") {
        game.spaceWeb = game.player.autoShoot(game.world);
      }
      return;
    }

    if (action === "dash") {
      if (game.state === "playing") game.player.dash(game.aim.x, game.aim.y, game);
      return;
    }
    if (e.code === "F3") {
      settings.perf = !settings.perf;
      applySettings();
      return;
    }
    if (e.code === "KeyR") {
      if (game.state === "playing" || game.state === "dead") startRun();
      return;
    }
    if (e.code === "KeyM") {
      SW.audio.unlock();
      SW.audio.toggleMute();
      return;
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (game.state === "playing") {
        game.state = "paused";
        el.overlay.classList.remove("hidden");
        el.pauseCard.classList.remove("hidden");
      } else if (game.state === "paused") {
        game.state = "playing";
        el.overlay.classList.add("hidden");
        el.pauseCard.classList.add("hidden");
        last = 0;
      } else if (game.state === "settings") {
        closeSettings();
      }
      return;
    }
    if (game.state === "menu") startRun();
    else if (game.state === "dead" && e.code === "Enter") startRun();
  });

  global.addEventListener("keyup", function (e) {
    keys[e.code] = false;
    refreshMove();
    if (actionOf[e.code] === "jump") {
      game.input.jump = false;
      if (game.spaceWeb) {
        releaseWeb();
        game.spaceWeb = false;
      }
    }
  });

  function pointerAim(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    game.aim.sx = clientX - rect.left;
    game.aim.sy = clientY - rect.top;
    screenToWorld(game.aim.sx, game.aim.sy);
  }

  canvas.addEventListener("mousemove", function (e) {
    pointerAim(e.clientX, e.clientY);
  });

  canvas.addEventListener("mousedown", function (e) {
    e.preventDefault();
    SW.audio.unlock();
    if (game.state !== "playing") return;
    pointerAim(e.clientX, e.clientY);
    if (e.button === 2) {
      game.player.dash(game.aim.x, game.aim.y, game);
      return;
    }
    game.pointerDown = true;
    fireOrKick();
  });

  global.addEventListener("mouseup", function (e) {
    if (!game.pointerDown || e.button === 2) return;
    game.pointerDown = false;
    releaseWeb();
  });

  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      SW.audio.unlock();
      showTouchControls();
      if (game.state === "menu" || game.state === "dead") {
        startRun();
        return;
      }
      if (game.state !== "playing") return;
      if (e.touches.length >= 2) {
        game.player.dash(game.aim.x, game.aim.y, game);
        return;
      }
      var t = e.changedTouches[0];
      pointerAim(t.clientX, t.clientY);
      game.pointerDown = true;
      fireOrKick();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      pointerAim(t.clientX, t.clientY);
    },
    { passive: false }
  );

  function endTouch(e) {
    e.preventDefault();
    if (!game.pointerDown) return;
    game.pointerDown = false;
    releaseWeb();
  }
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", endTouch, { passive: false });

  // ---------------------------------------------------------------------------
  // Touch controls: a thumb layout that does not fight the aiming hand
  // ---------------------------------------------------------------------------

  var touchLayer = document.getElementById("touch");
  var touchActs = {
    left: false,
    right: false,
    reelIn: false,
    reelOut: false,
    zip: false,
  };

  function applyTouchMove() {
    game.input.moveX = (touchActs.right ? 1 : 0) - (touchActs.left ? 1 : 0);
    game.input.reel = (touchActs.reelIn ? 1 : 0) - (touchActs.reelOut ? 1 : 0);
    game.input.zip = touchActs.zip || held("zip");
  }

  function showTouchControls() {
    touchLayer.classList.remove("hidden");
  }

  Array.prototype.forEach.call(
    touchLayer.querySelectorAll(".tbtn"),
    function (btn) {
      var act = btn.getAttribute("data-act");
      function down(e) {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add("held");
        SW.audio.unlock();
        if (act === "dash") {
          game.player.dash(game.aim.x, game.aim.y, game);
        } else if (act === "jump") {
          if (game.player.onRoof || game.player.canKick()) {
            game.input.jump = true;
          } else if (game.player.web !== "attached") {
            game.spaceWeb = game.player.autoShoot(game.world);
          }
        } else {
          touchActs[act] = true;
          applyTouchMove();
        }
      }
      function up(e) {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("held");
        if (act === "jump") {
          game.input.jump = false;
          if (game.spaceWeb) {
            releaseWeb();
            game.spaceWeb = false;
          }
        } else if (act !== "dash") {
          touchActs[act] = false;
          applyTouchMove();
        }
      }
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
    }
  );

  if (global.matchMedia && global.matchMedia("(pointer: coarse)").matches) {
    showTouchControls();
  }

  el.btnPlay.addEventListener("click", startRun);
  el.btnRetry.addEventListener("click", startRun);
  el.btnSettings.addEventListener("click", openSettings);
  el.btnSettingsClose.addEventListener("click", closeSettings);

  el.optPace.addEventListener("input", function () {
    settings.pace = parseFloat(el.optPace.value);
    el.valPace.textContent = settings.pace.toFixed(2);
    SW.setPace(settings.pace);
    store(SETTINGS_KEY, JSON.stringify(settings));
  });
  el.optVolume.addEventListener("input", function () {
    settings.volume = parseInt(el.optVolume.value, 10) / 100;
    el.valVolume.textContent = el.optVolume.value;
    SW.audio.unlock();
    SW.audio.setVolume(settings.volume);
    store(SETTINGS_KEY, JSON.stringify(settings));
  });

  function bindToggle(node, key) {
    node.addEventListener("change", function () {
      settings[key] = node.checked;
      applySettings();
    });
  }
  bindToggle(el.optHazards, "hazards");
  bindToggle(el.optWeather, "weather");
  bindToggle(el.optTutor, "tutor");
  bindToggle(el.optDaily, "daily");
  bindToggle(el.optEndless, "endless");
  bindToggle(el.optLow, "low");
  bindToggle(el.optPerf, "perf");
  bindToggle(el.optCalm, "calm");
  bindToggle(el.optShapes, "shapes");

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game.state === "playing") {
      game.state = "paused";
      el.overlay.classList.remove("hidden");
      el.pauseCard.classList.remove("hidden");
    }
    last = 0;
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function renderLevels() {
    var levels = SW.World.LEVELS;
    el.levelList.innerHTML = "";
    for (var i = 0; i < levels.length; i++) {
      (function (index) {
        var def = levels[index];
        var btn = document.createElement("button");
        btn.className = "level" + (index === settings.level ? " active" : "");
        btn.innerHTML = "";
        btn.appendChild(document.createTextNode(def.name));
        var best = document.createElement("b");
        var stars = starsOf(def.id);
        best.textContent = stars
          ? "★".repeat(stars) + "☆".repeat(3 - stars)
          : "☆☆☆";
        btn.appendChild(best);
        btn.addEventListener("click", function () {
          settings.level = index;
          applySettings();
          renderLevels();
        });
        el.levelList.appendChild(btn);
      })(i);
    }
    el.levelHint.textContent = levelDef().hint;
  }

  function refreshMenuTasks() {
    game.challenges = buildChallenges();
    renderChallenges(el.startTasks);
  }

  resize();
  rebuildBinds();
  renderBinds();
  applySettings();
  renderLevels();
  newRun();
  refreshMenuTasks();
  game.cam.y = -420;
  requestAnimationFrame(frame);

  global.SWGame = game;
})(window);
