(function (global) {
  "use strict";

  var SW = global.SW;
  var U = SW.util;
  var C = SW.CONST;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  var el = {
    hud: document.getElementById("hud"),
    distance: document.getElementById("hud-distance"),
    score: document.getElementById("hud-score"),
    best: document.getElementById("hud-best"),
    speed: document.getElementById("hud-speed"),
    combo: document.getElementById("hud-combo"),
    hint: document.getElementById("hud-hint"),
    tutor: document.getElementById("hud-tutor"),
    popups: document.getElementById("hud-popups"),
    district: document.getElementById("hud-district"),
    weather: document.getElementById("hud-weather"),
    dash: document.getElementById("hud-dash"),
    dashFill: document.getElementById("dash-fill"),
    overlay: document.getElementById("overlay"),
    startCard: document.getElementById("start-card"),
    deadCard: document.getElementById("dead-card"),
    pauseCard: document.getElementById("pause-card"),
    settingsCard: document.getElementById("settings-card"),
    deadTitle: document.getElementById("dead-title"),
    resDistance: document.getElementById("res-distance"),
    resScore: document.getElementById("res-score"),
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
    optPreview: document.getElementById("opt-preview"),
    optHazards: document.getElementById("opt-hazards"),
    optWeather: document.getElementById("opt-weather"),
    optTutor: document.getElementById("opt-tutor"),
    optDaily: document.getElementById("opt-daily"),
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
    preview: true,
    hazards: true,
    weather: true,
    tutor: true,
    daily: false,
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

  function bestKey() {
    return settings.daily ? BEST_KEY + "-daily-" + dailySeed() : BEST_KEY;
  }

  var game = {
    state: "menu", // menu | playing | dead | paused | settings
    world: new SW.World(1),
    player: new SW.Player(),
    cam: { x: 0, y: -300, zoom: 1, shake: 0 },
    view: { w: 0, h: 0, dpr: 1 },
    aim: { sx: 0, sy: 0, x: 0, y: 0 },
    input: { moveX: 0, reel: 0, jump: false },
    particles: [],
    trail: [],
    preview: [],
    previewAnchor: null,
    time: 0,
    distance: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    lowTime: 0,
    lowAnnounced: false,
    grazeBox: null,
    grazeCd: 0,
    deathReason: "",
    hinted: false,
    pointerDown: false,
    spaceWeb: false,
    tutorStep: 0,
    swings: 0,
    settings: settings,
  };

  game.best = parseInt(load(bestKey(), "0"), 10) || 0;
  el.best.textContent = game.best;

  // ---------------------------------------------------------------------------
  // Settings plumbing
  // ---------------------------------------------------------------------------

  function applySettings() {
    SW.setPace(settings.pace);
    SW.audio.setVolume(settings.volume);
    game.world.hazardsOn = settings.hazards;
    game.world.weatherOn = settings.weather;
    el.optPace.value = settings.pace;
    el.valPace.textContent = settings.pace.toFixed(2);
    el.optVolume.value = Math.round(settings.volume * 100);
    el.valVolume.textContent = Math.round(settings.volume * 100);
    el.optPreview.checked = settings.preview;
    el.optHazards.checked = settings.hazards;
    el.optWeather.checked = settings.weather;
    el.optTutor.checked = settings.tutor;
    el.optDaily.checked = settings.daily;
    store(SETTINGS_KEY, JSON.stringify(settings));
    game.best = parseInt(load(bestKey(), "0"), 10) || 0;
    el.best.textContent = game.best;
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  function resize() {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || global.innerWidth;
    var h = canvas.clientHeight || global.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    game.view.w = w;
    game.view.h = h;
    game.view.dpr = dpr;
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
    game.world.reset(settings.daily ? dailySeed() : (Math.random() * 1e9) | 0);
    var pad = game.world.buildings[0];
    game.player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);
    game.cam.x = game.player.pos.x;
    game.cam.y = game.player.pos.y - 60;
    game.cam.zoom = 1;
    game.cam.shake = 0;
    game.particles.length = 0;
    game.trail.length = 0;
    game.preview.length = 0;
    game.distance = 0;
    game.score = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.lowTime = 0;
    game.lowAnnounced = false;
    game.grazeBox = null;
    game.grazeCd = 0;
    game.swings = 0;
    game.deathReason = "";
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

  function endRun() {
    game.state = "dead";
    var dist = Math.floor(game.distance);
    var score = Math.floor(game.score);
    var isBest = score > game.best;
    if (isBest) {
      game.best = score;
      store(bestKey(), String(game.best));
    }
    el.deadTitle.textContent =
      game.deathReason === "wall"
        ? "Стена оказалась ближе"
        : "Асфальт не прощает";
    el.resDistance.textContent = dist;
    el.resScore.textContent = score;
    el.resBest.textContent = game.best;
    el.best.textContent = game.best;
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
    burst(game.player.anchor.x, game.player.anchor.y, 7, "#eaf6ff", 160);
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
    SW.audio.thud();
    var n = 6 + U.clamp((impact || 0) / (120 * C.PACE), 0, 10);
    burst(game.player.pos.x, game.player.pos.y + C.PLAYER_R, n, "#a9b6ff", 120);
    game.cam.shake = Math.max(game.cam.shake, U.clamp((impact || 0) / (90 * C.PACE), 0, 9));
  };

  game.onJump = function () {
    burst(game.player.pos.x, game.player.pos.y + C.PLAYER_R, 5, "#8fa0ff", 110);
  };

  game.onKick = function (x, y, nx, power) {
    SW.audio.kick();
    burst(x, y, 10, "#cfe0ff", 190 * C.PACE);
    ring(x, y, "rgba(200,225,255,0.85)");
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
    SW.audio.crash();
    burst(game.player.pos.x, game.player.pos.y, 16, "#ff8a5a", 240 * C.PACE);
    game.cam.shake = Math.max(game.cam.shake, 14);
    game.combo = 0;
    game.comboTimer = 0;
    popup(game.player.pos.x, game.player.pos.y - 30, "СБИТ", true);
  };

  game.onScrape = function (x, y, impact) {
    burst(x, y, 3, "#ffd08a", (90 + impact * 0.2) * C.PACE);
    game.cam.shake = Math.max(game.cam.shake, U.clamp(impact / (140 * C.PACE), 0, 7));
  };

  // ---------------------------------------------------------------------------
  // Particles and popups
  // ---------------------------------------------------------------------------

  function burst(x, y, n, color, spread) {
    var s = spread || 260;
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
    return U.clamp(1 + game.combo * 0.25, 1, 8);
  }

  function bumpCombo(n) {
    game.combo += n;
    game.comboTimer = 5;
  }

  function collectOrbs() {
    var p = game.player;
    var orbs = game.world.orbs;
    var reach = C.PLAYER_R + 22;
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      if (o.taken) continue;
      if (o.x < p.pos.x - 200) continue;
      if (o.x > p.pos.x + 200) break;
      var dx = o.x - p.pos.x;
      var dy = o.y - p.pos.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      o.taken = true;
      bumpCombo(1);
      game.score += 50 * multiplier();
      ring(o.x, o.y, "rgba(120,240,255,0.9)");
      burst(o.x, o.y, 6, "#8ff0ff", 180);
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
        var bonus = Math.round(140 * game.lowTime * multiplier());
        game.score += bonus;
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
      game.score += 90 * dt * multiplier();
      if (!game.lowAnnounced && game.lowTime > 0.3) {
        game.lowAnnounced = true;
        popup(p.pos.x, p.pos.y - 46, "НАД САМОЙ УЛИЦЕЙ", true);
      }
    } else if (game.lowTime > 0) {
      if (game.lowTime > 0.35) {
        var b2 = Math.round(140 * game.lowTime * multiplier());
        game.score += b2;
        popup(p.pos.x, p.pos.y - 40, "НИЗКО +" + b2, true);
        bumpCombo(1);
      }
      game.lowTime = 0;
      game.lowAnnounced = false;
    }

    game.grazeCd -= dt;
    if (!fast || game.grazeCd > 0) return;
    var near = game.world.clearance(
      p.pos.x,
      p.pos.y,
      C.PLAYER_R + C.GRAZE_DIST
    );
    if (near.box && near.box !== game.grazeBox && near.dist > C.PLAYER_R + 1) {
      game.grazeBox = near.box;
      game.grazeCd = 0.5;
      var pts = Math.round(70 * multiplier());
      game.score += pts;
      bumpCombo(1);
      popup(p.pos.x, p.pos.y - 30, "ВПРИТИРКУ +" + pts);
      SW.audio.ping(Math.min(game.combo, 12));
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function step(dt) {
    var p = game.player;
    p.update(dt, game.input, game.world, game);

    if (!p.dead) {
      var hz = game.world.hazardAt(p.pos.x, p.pos.y, C.PLAYER_R);
      if (hz) p.hit(hz, game);

      collectOrbs();
      styleScore(dt);

      var d = (p.pos.x - game.world.startX) / C.PIXELS_PER_METER;
      if (d > game.distance) {
        game.score += d - game.distance;
        game.distance = d;
      }
      if (game.comboTimer > 0) {
        game.comboTimer -= dt;
        if (game.comboTimer <= 0) game.combo = 0;
      }
    }

    game.world.update(dt, p.pos.x);
    game.world.ensureUpTo(game.cam.x + 3600);
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
    el.speed.textContent = Math.round((p.speed() / C.PIXELS_PER_METER) * 3.6);

    var m = multiplier();
    if (game.combo > 0 && m > 1) {
      el.combo.textContent = "x" + m.toFixed(1);
      el.combo.classList.remove("hidden");
    } else {
      el.combo.classList.add("hidden");
    }

    var d = game.world.districtAt(p.pos.x);
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

    var ready = p.dashCd <= 0;
    el.dash.classList.toggle("ready", ready);
    el.dashFill.style.width = ready
      ? "100%"
      : (100 * (1 - p.dashCd / C.DASH_COOLDOWN)).toFixed(1) + "%";
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  var TUTOR_TEXT = {
    1: "Зажми мышь и выстрели паутину вверх-вперёд",
    2: "Отпусти в нижней точке дуги — так сохраняется скорость",
    3: "Shift — рывок, если падаешь и цепляться не за что",
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
    var cam = game.cam;
    var p = game.player;
    var sp = p.speed();
    var intensity = U.clamp((sp - 900 * C.PACE) / (1600 * C.PACE), 0, 1);
    var district = game.world.districtAt(
      game.state === "menu" ? cam.x : p.pos.x
    );

    ctx.setTransform(game.view.dpr, 0, 0, game.view.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    SW.Render.sky(ctx, cam, w, h, SW.Render.palette(district));
    SW.Render.stars(ctx, cam, w, h);
    SW.Render.parallax(ctx, cam, w, h, district);
    SW.Render.ground(ctx, cam, w, h);

    var shakeX = (Math.random() - 0.5) * cam.shake;
    var shakeY = (Math.random() - 0.5) * cam.shake;

    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    SW.Render.buildings(ctx, game.world, cam, w);
    SW.Render.props(ctx, game.world, cam, w, game.time);
    SW.Render.orbs(ctx, game.world, cam, w, game.time);
    SW.Render.hazards(ctx, game.world, cam, w, game.time);

    if (game.state === "playing" && !p.dead) {
      if (settings.preview && game.previewAnchor) {
        SW.Render.preview(ctx, game.preview);
      }
      SW.Render.aim(ctx, p, game.world, game.aim);
    }
    SW.Render.trail(ctx, game.trail);
    if (game.state !== "menu" && game.state !== "settings") {
      SW.Render.web(ctx, p);
      SW.Render.particles(ctx, game.particles);
      p.draw(ctx);
    }

    ctx.restore();

    if (settings.weather) {
      SW.Render.weather(ctx, cam, w, h, game.world.weather, game.time);
    }
    SW.Render.speedLines(ctx, w, h, intensity);
    SW.Render.vignette(ctx, w, h, intensity);
  }

  function updatePreview() {
    game.previewAnchor = null;
    if (!settings.preview) return;
    var p = game.player;
    if (game.state !== "playing" || p.dead || p.web === "attached") return;
    var hit = p.probe(game.aim.x, game.aim.y, game.world);
    if (!hit) return;
    game.previewAnchor = hit;
    p.predict(hit.x, hit.y, game.world, game.preview);
  }

  var last = 0;
  var acc = 0;
  var FIXED = 1 / 120;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.time += dt;

    if (game.state === "playing" || game.state === "dead") {
      acc += dt;
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
      if (game.state === "playing") updateHud();
    } else {
      game.cam.x += 26 * dt;
      updateParticles(dt);
      game.world.update(dt, game.cam.x);
      game.world.ensureUpTo(game.cam.x + 3600);
    }

    screenToWorld(game.aim.sx, game.aim.sy);
    updatePreview();
    draw();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  var keys = {};

  function refreshMove() {
    var left = keys["KeyA"] || keys["ArrowLeft"];
    var right = keys["KeyD"] || keys["ArrowRight"];
    game.input.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    var up = keys["KeyW"] || keys["ArrowUp"];
    var down = keys["KeyS"] || keys["ArrowDown"];
    game.input.reel = (up ? 1 : 0) - (down ? 1 : 0);
  }

  function releaseWeb() {
    if (game.player.web === "attached") tutorSwingDone();
    game.player.release();
  }

  function fireOrKick() {
    var p = game.player;
    if (p.shoot(game.aim.x, game.aim.y, game.world)) return;
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
    keys[e.code] = true;
    refreshMove();

    if (e.code === "Space") {
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

    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (game.state === "playing") game.player.dash(game.aim.x, game.aim.y, game);
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
    if (e.code === "Space") {
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
  bindToggle(el.optPreview, "preview");
  bindToggle(el.optHazards, "hazards");
  bindToggle(el.optWeather, "weather");
  bindToggle(el.optTutor, "tutor");
  bindToggle(el.optDaily, "daily");

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

  resize();
  applySettings();
  newRun();
  game.cam.y = -420;
  requestAnimationFrame(frame);

  global.SWGame = game;
})(window);
