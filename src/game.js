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
    overlay: document.getElementById("overlay"),
    startCard: document.getElementById("start-card"),
    deadCard: document.getElementById("dead-card"),
    pauseCard: document.getElementById("pause-card"),
    deadTitle: document.getElementById("dead-title"),
    resDistance: document.getElementById("res-distance"),
    resScore: document.getElementById("res-score"),
    resBest: document.getElementById("res-best"),
    resNew: document.getElementById("res-new"),
    btnPlay: document.getElementById("btn-play"),
    btnRetry: document.getElementById("btn-retry"),
  };

  var BEST_KEY = "swing-best-v1";

  var game = {
    state: "menu", // menu | playing | dead | paused
    world: new SW.World(1),
    player: new SW.Player(),
    cam: { x: 0, y: -300, zoom: 1, shake: 0 },
    view: { w: 0, h: 0, dpr: 1 },
    aim: { sx: 0, sy: 0, x: 0, y: 0 },
    input: { moveX: 0, reel: 0, jump: false },
    particles: [],
    trail: [],
    time: 0,
    distance: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    deathReason: "",
    hinted: false,
    pointerDown: false,
    spaceWeb: false,
  };

  try {
    game.best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  } catch (e) {
    game.best = 0;
  }
  el.best.textContent = game.best;

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

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  function newRun() {
    game.runId = (game.runId || 0) + 1;
    game.world.reset((Math.random() * 1e9) | 0);
    var pad = game.world.buildings[0];
    game.player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);
    game.cam.x = game.player.pos.x;
    game.cam.y = game.player.pos.y - 60;
    game.cam.zoom = 1;
    game.cam.shake = 0;
    game.particles.length = 0;
    game.trail.length = 0;
    game.distance = 0;
    game.score = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.deathReason = "";
  }

  function startRun() {
    SW.audio.unlock();
    newRun();
    game.state = "playing";
    el.startCard.classList.add("hidden");
    el.deadCard.classList.add("hidden");
    el.pauseCard.classList.add("hidden");
    el.overlay.classList.add("hidden");
    el.hud.classList.remove("hidden");
    el.hint.classList.remove("faded");
    game.hinted = false;
  }

  function endRun() {
    game.state = "dead";
    var dist = Math.floor(game.distance);
    var score = Math.floor(game.score);
    var isBest = score > game.best;
    if (isBest) {
      game.best = score;
      try {
        localStorage.setItem(BEST_KEY, String(game.best));
      } catch (e) {}
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
  };

  game.onLand = function (impact) {
    SW.audio.thud();
    var n = 6 + U.clamp((impact || 0) / (120 * C.PACE), 0, 10);
    burst(game.player.pos.x, game.player.pos.y + C.PLAYER_R, n, "#a9b6ff", 120);
    game.cam.shake = Math.max(game.cam.shake, U.clamp((impact || 0) / (90 * C.PACE), 0, 9));
  };

  game.onScrape = function (x, y, impact) {
    burst(x, y, 3, "#ffd08a", (90 + impact * 0.2) * C.PACE);
    game.cam.shake = Math.max(game.cam.shake, U.clamp(impact / (140 * C.PACE), 0, 7));
  };

  game.onJump = function () {
    burst(game.player.pos.x, game.player.pos.y + C.PLAYER_R, 5, "#8fa0ff", 110);
  };

  // ---------------------------------------------------------------------------
  // Particles
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
  // Simulation
  // ---------------------------------------------------------------------------

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
      game.combo++;
      game.comboTimer = 5;
      game.score += 50 * multiplier();
      ring(o.x, o.y, "rgba(120,240,255,0.9)");
      burst(o.x, o.y, 6, "#8ff0ff", 180);
      SW.audio.ping(Math.min(game.combo - 1, 14));
    }
  }

  function multiplier() {
    return U.clamp(1 + game.combo * 0.25, 1, 8);
  }

  function step(dt) {
    var p = game.player;
    p.update(dt, game.input, game.world, game);

    if (!p.dead) {
      collectOrbs();
      var d = (p.pos.x - game.world.startX) / C.PIXELS_PER_METER;
      if (d > game.distance) {
        game.score += (d - game.distance) * 1;
        game.distance = d;
      }
      if (game.comboTimer > 0) {
        game.comboTimer -= dt;
        if (game.comboTimer <= 0) game.combo = 0;
      }
    }

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

  function updateHud() {
    el.distance.textContent = Math.floor(game.distance);
    el.score.textContent = Math.floor(game.score);
    el.speed.textContent = Math.round((game.player.speed() / C.PIXELS_PER_METER) * 3.6);
    var m = multiplier();
    if (game.combo > 0 && m > 1) {
      el.combo.textContent = "x" + m.toFixed(1);
      el.combo.classList.remove("hidden");
    } else {
      el.combo.classList.add("hidden");
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

    ctx.setTransform(game.view.dpr, 0, 0, game.view.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    SW.Render.sky(ctx, cam, w, h);
    SW.Render.stars(ctx, cam, w, h);
    SW.Render.parallax(ctx, cam, w, h);
    SW.Render.ground(ctx, cam, w, h);

    var shakeX = (Math.random() - 0.5) * cam.shake;
    var shakeY = (Math.random() - 0.5) * cam.shake;

    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    SW.Render.buildings(ctx, game.world, cam, w);
    SW.Render.orbs(ctx, game.world, cam, w, game.time);
    if (game.state === "playing" && !p.dead) {
      SW.Render.aim(ctx, p, game.world, game.aim);
    }
    SW.Render.trail(ctx, game.trail);
    if (game.state !== "menu") {
      SW.Render.web(ctx, p);
      SW.Render.particles(ctx, game.particles);
      p.draw(ctx);
    }

    ctx.restore();

    SW.Render.speedLines(ctx, w, h, intensity);
    SW.Render.vignette(ctx, w, h, intensity);
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
      // Idle city view behind the menu.
      game.cam.x += 26 * dt;
      updateParticles(dt);
      game.world.ensureUpTo(game.cam.x + 3600);
    }

    screenToWorld(game.aim.sx, game.aim.sy);
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

  global.addEventListener("keydown", function (e) {
    if (e.repeat) {
      return;
    }
    keys[e.code] = true;
    refreshMove();

    if (e.code === "Space") {
      e.preventDefault();
      if (game.state === "menu") {
        startRun();
        return;
      }
      if (game.state !== "playing") return;
      if (game.player.onRoof) {
        game.input.jump = true;
      } else if (game.player.web !== "attached") {
        game.spaceWeb = game.player.autoShoot(game.world);
      }
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
        game.player.release();
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
    game.pointerDown = true;
    game.player.shoot(game.aim.x, game.aim.y, game.world);
  });

  global.addEventListener("mouseup", function () {
    if (!game.pointerDown) return;
    game.pointerDown = false;
    game.player.release();
  });

  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      SW.audio.unlock();
      if (game.state === "menu") {
        startRun();
        return;
      }
      if (game.state === "dead") {
        startRun();
        return;
      }
      if (game.state !== "playing") return;
      var t = e.changedTouches[0];
      pointerAim(t.clientX, t.clientY);
      game.pointerDown = true;
      game.player.shoot(game.aim.x, game.aim.y, game.world);
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
    game.player.release();
  }
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", endTouch, { passive: false });

  el.btnPlay.addEventListener("click", startRun);
  el.btnRetry.addEventListener("click", startRun);

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
  newRun();
  game.cam.y = -420;
  requestAnimationFrame(frame);

  global.SWGame = game;
})(window);
