(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  var HIGH_ANCHOR = 760; // height above the street that always stays reachable
  var WEATHER_LEN = 3400;

  var SIGN_HUES = ["#ff3b6b", "#43e5ff", "#ffb03a", "#8b5cff", "#3ee08f"];

  /**
   * Districts change both the skyline geometry and the palette, so the tactics
   * change with them: towers give short arcs, the outskirts force long ones.
   */
  /**
   * Levels are whole maps, not stretches of one endless city: each one fixes
   * the architecture, the set of things worth shooting a web at, and the
   * palette. `props` are probabilities per block.
   */
  var LEVELS = [
    {
      id: "centre",
      quota: 3,
      length: 1000,
      par: 115,
      name: "Деловой центр",
      hint: "Башни и мачты. Учебная смена: дуги короткие, зацепов много.",
      seed: 10427,
      w: [130, 235],
      h: [420, 780],
      tower: [820, 1250],
      towerChance: 0.3,
      gap: [210, 400],
      setback: 0.45,
      props: { crane: 0.14, sign: 0.4, wire: 0.4, mast: 0.85, blimp: 1 },
      facades: [
        ["#1b2540", "#0d1428"],
        ["#232041", "#100e26"],
      ],
      sky: ["#080a1c", "#2a1b48", "#6b2f52", "#c2603f"],
      far: "rgba(24,26,58,0.85)",
      mid: "rgba(15,17,42,0.92)",
      accent: "#ff3b6b",
      neon: ["#ff3b6b", "#43e5ff", "#ffb03a"],
      words: ["ОФИС", "БАНК", "24 ЧАСА", "КОФЕ", "БИРЖА"],
    },
    {
      id: "industrial",
      quota: 3,
      length: 950,
      par: 120,
      name: "Промзона",
      hint: "Низкие корпуса, широкие провалы. Держат трубы и стрелы кранов.",
      seed: 20521,
      w: [190, 340],
      h: [150, 320],
      tower: [430, 680],
      towerChance: 0.18,
      gap: [320, 540],
      setback: 0,
      chimney: 0.75,
      props: { crane: 0.5, sign: 0.08, wire: 0.7, mast: 0.35, blimp: 1 },
      facades: [
        ["#1c2b2e", "#0b1417"],
        ["#26261f", "#111109"],
      ],
      sky: ["#050a12", "#123043", "#2f5b5c", "#9e7a3c"],
      far: "rgba(18,34,40,0.85)",
      mid: "rgba(9,20,26,0.92)",
      accent: "#ffb03a",
      neon: ["#ffb03a", "#7dffcb", "#ff6a3d"],
      words: ["ЦЕХ 4", "СКЛАД", "ГРУЗ", "ТЭЦ", "ВЪЕЗД"],
    },
    {
      id: "residential",
      quota: 4,
      length: 1200,
      par: 130,
      name: "Спальный район",
      hint: "Ровные панельки. Выручают только тросы и аэростаты.",
      seed: 31337,
      w: [130, 210],
      h: [190, 330],
      tower: [400, 520],
      towerChance: 0.08,
      gap: [280, 480],
      setback: 0,
      balloon: 0.5,
      props: { crane: 0.06, sign: 0.18, wire: 0.9, mast: 0.5, blimp: 0.6 },
      facades: [
        ["#1e2440", "#0e1024"],
        ["#242a4a", "#12142c"],
      ],
      sky: ["#060814", "#1c1f4a", "#3f3b78", "#7d5f9c"],
      far: "rgba(26,28,64,0.85)",
      mid: "rgba(14,16,40,0.92)",
      accent: "#8b5cff",
      neon: ["#8b5cff", "#43e5ff", "#ff8ab0"],
      words: ["ПРОДУКТЫ", "АПТЕКА", "ПИЦЦА", "САЛОН", "24"],
    },
    {
      id: "oldtown",
      quota: 4,
      length: 1000,
      par: 120,
      name: "Старый город",
      hint: "Узкие дома и шпили. Всё близко, ошибаться некогда.",
      seed: 44011,
      w: [95, 165],
      h: [250, 430],
      tower: [520, 800],
      towerChance: 0.22,
      gap: [170, 300],
      setback: 0.2,
      spire: 0.8,
      props: { crane: 0.05, sign: 0.45, wire: 0.75, mast: 0.3, blimp: 1.4 },
      facades: [
        ["#2f2333", "#170f1c"],
        ["#33261f", "#180f0c"],
      ],
      sky: ["#0b0714", "#3a1d34", "#7d3b3a", "#d08243"],
      far: "rgba(42,28,46,0.85)",
      mid: "rgba(24,15,28,0.92)",
      accent: "#ff9f4a",
      neon: ["#ff9f4a", "#ffd76a", "#ff5a7a"],
      words: ["ТРАКТИРЪ", "ЛАВКА", "ЧАЙ", "ТЕАТРЪ", "БАНЯ"],
    },
    {
      id: "skyline",
      quota: 3,
      length: 1000,
      par: 115,
      name: "Небесный квартал",
      hint: "Сверхвысотки, связанные переходами. Мост — и опора, и якорь.",
      seed: 51199,
      w: [150, 250],
      h: [700, 1150],
      tower: [1150, 1600],
      towerChance: 0.4,
      gap: [260, 460],
      setback: 0.6,
      bridge: 0.75,
      props: { crane: 0.08, sign: 0.3, wire: 0.25, mast: 0.9, blimp: 0.5 },
      facades: [
        ["#16233f", "#0a1020"],
        ["#1d2a4d", "#0c1226"],
      ],
      sky: ["#04060f", "#101b3e", "#2b3f6e", "#5d7bb0"],
      far: "rgba(18,24,52,0.85)",
      mid: "rgba(10,14,34,0.92)",
      accent: "#43e5ff",
      neon: ["#43e5ff", "#8b5cff", "#eaf6ff"],
      words: ["SKY", "ОБЛАКО", "ЛИФТ", "ВЫШЕ", "ЭФИР"],
    },
    {
      id: "site",
      quota: 3,
      length: 950,
      par: 115,
      name: "Стройка",
      hint: "Каркасы и леса. Цепляться можно почти везде, падать — тоже.",
      seed: 60077,
      w: [140, 260],
      h: [230, 620],
      tower: [640, 900],
      towerChance: 0.25,
      gap: [260, 520],
      setback: 0.3,
      scaffold: 0.7,
      chimney: 0.2,
      props: { crane: 0.85, sign: 0.1, wire: 0.5, mast: 0.5, blimp: 1.2 },
      facades: [
        ["#2a2418", "#141008"],
        ["#232a2c", "#0e1214"],
      ],
      sky: ["#0a0810", "#2a2038", "#6b4a3a", "#c98a4a"],
      far: "rgba(34,28,26,0.85)",
      mid: "rgba(18,15,16,0.92)",
      accent: "#ffc46b",
      neon: ["#ffc46b", "#ff6a3d", "#7dffcb"],
      words: ["СТРОЙ", "ОПАСНО", "КАСКА", "БЕТОН", "СМЕНА"],
    },
  ];

  function buildSprite(b, rng, district) {
    var totalH = b.h + b.antennaH;
    var cv = document.createElement("canvas");
    cv.width = Math.ceil(b.w);
    cv.height = Math.ceil(totalH);
    var g = cv.getContext("2d");
    var top = b.antennaH; // roof line inside the sprite

    var pal = rng.pick(district.facades);
    var grad = g.createLinearGradient(0, top, b.w, totalH);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(1, pal[1]);
    g.fillStyle = grad;
    g.fillRect(0, top, b.w, b.h);

    g.fillStyle = "rgba(140,180,255,0.16)";
    g.fillRect(0, top, b.w, 2);
    g.fillRect(0, top, 2, b.h);

    var cw = 11;
    var ch = 15;
    var cols = Math.max(1, Math.floor((b.w - 16) / (cw + 6)));
    var offX = (b.w - cols * (cw + 6) + 6) / 2;
    for (var y = top + 16; y < totalH - 14; y += ch + 9) {
      var floorLit = rng.chance(0.55);
      for (var i = 0; i < cols; i++) {
        var lit = floorLit ? rng.chance(0.62) : rng.chance(0.12);
        var x = offX + i * (cw + 6);
        if (lit) {
          var warm = rng.chance(0.78);
          g.fillStyle = warm
            ? "rgba(255, 214, 150, " + (0.5 + rng.next() * 0.45).toFixed(2) + ")"
            : "rgba(150, 235, 255, " + (0.4 + rng.next() * 0.4).toFixed(2) + ")";
        } else {
          g.fillStyle = "rgba(10,14,30,0.55)";
        }
        g.fillRect(x, y, cw, ch);
      }
    }

    if (b.w > 90 && rng.chance(0.7)) {
      var tw = rng.range(18, 34);
      var th = rng.range(12, 26);
      var tx = rng.range(6, b.w - tw - 6);
      g.fillStyle = "#0a0f1e";
      g.fillRect(tx, top - th, tw, th);
      g.fillStyle = "rgba(140,180,255,0.14)";
      g.fillRect(tx, top - th, tw, 2);
    }

    if (b.antennaH > 0) {
      var ax = b.ax - b.x;
      g.fillStyle = "#0a0f1e";
      g.fillRect(ax - 2.5, 0, 5, b.antennaH);
      g.fillStyle = "rgba(255,90,120,0.85)";
      g.beginPath();
      g.arc(ax, 3, 3, 0, U.TAU);
      g.fill();
    }

    return cv;
  }

  function World(seed) {
    this.rng = new U.Rng(seed || 1337);
    this.buildings = [];
    this.props = [];
    this.hazards = [];
    this.shots = [];
    this.boxes = [];
    this.pizzas = [];
    this.startX = 0;
    this.nextX = 0;
    this.id = 0;
    this.lastHighX = 0;
    this.prev = null;
    this.nextBlimpX = 0;
    this.nextHazardX = 0;
    this.waveLeft = 0;
    this.weather = { wind: 0, rain: 0, fog: 0 };
    this.target = { wind: 0, rain: 0, fog: 0 };
    this.districtIndex = 0;
    this.levelIndex = 0;
    this.hazardsOn = true;
    this.weatherOn = true;
  }

  World.prototype.reset = function (seed, levelIndex) {
    this.levelIndex = U.clamp(levelIndex || 0, 0, LEVELS.length - 1);
    this.rng = new U.Rng(seed);
    this.buildings.length = 0;
    this.props.length = 0;
    this.hazards.length = 0;
    this.shots.length = 0;
    this.boxes.length = 0;
    this.pizzas.length = 0;
    this.nextX = -400;
    this.startX = 0;
    this.id = 0;
    this.lastHighX = -400;
    this.prev = null;
    this.nextBlimpX = 1800;
    this.nextHazardX = 2600;
    this.waveLeft = 0;
    this.weather = { wind: 0, rain: 0, fog: 0 };
    this.target = { wind: 0, rain: 0, fog: 0 };
    this.districtIndex = 0;
    var pad = this._push(300, 620, true);
    this.nextX = pad.x + pad.w + 240;
    this.ensureUpTo(3000);
  };

  // ---------------------------------------------------------------------------
  // Districts and weather
  // ---------------------------------------------------------------------------

  /** Index of the district at world position x, plus the blend into the next. */
  /** The level's theme, in the shape the renderer already expects. */
  World.prototype.districtAt = function () {
    var def = LEVELS[this.levelIndex] || LEVELS[0];
    return { def: def, next: def, blend: 0, index: this.levelIndex };
  };

  World.prototype._rollWeather = function (index) {
    if (!this.weatherOn) {
      this.target.wind = 0;
      this.target.rain = 0;
      this.target.fog = 0;
      return;
    }
    var rng = new U.Rng((index + 1) * 9176 + this.id);
    var def = LEVELS[this.levelIndex] || LEVELS[0];
    var gusty = def.id === "industrial" || def.id === "residential";
    this.target.wind = rng.chance(gusty ? 0.75 : 0.45)
      ? rng.range(-1, 1) * (gusty ? 1 : 0.6)
      : 0;
    this.target.rain = rng.chance(0.3) ? rng.range(0.35, 1) : 0;
    this.target.fog = rng.chance(0.28) ? rng.range(0.25, 0.8) : 0;
  };

  World.prototype.update = function (dt, playerX) {
    this.time = (this.time || 0) + dt;
    // Weather rolls over as the run goes, but the architecture stays the level's.
    var band = Math.floor(Math.max(0, playerX - this.startX) / WEATHER_LEN);
    if (band !== this.districtIndex) {
      this.districtIndex = band;
      this._rollWeather(band);
    }
    var w = this.weather;
    w.wind = U.damp(w.wind, this.target.wind, 0.7, dt);
    w.rain = U.damp(w.rain, this.target.rain, 0.5, dt);
    w.fog = U.damp(w.fog, this.target.fog, 0.4, dt);

    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (p.type === "blimp") p.x += p.vx * dt;
      else if (p.type === "balloon") {
        p.y = p.baseY - p.len + Math.sin(p.phase + this.time * 0.6) * 8;
        p.drift = Math.sin(this.time * 0.5 + p.phase) * p.sway;
      }
      else if (p.type === "crane" && p.load) {
        // Pendulum load: θ'' = -(g / L) sin θ, nudged by the wind.
        var g = C.GRAVITY;
        var acc = (-g / p.load.len) * Math.sin(p.load.angle);
        acc += w.wind * C.WIND_MAX * 0.0016 * Math.cos(p.load.angle);
        p.load.vel += acc * dt;
        p.load.vel *= Math.exp(-0.25 * dt);
        p.load.angle += p.load.vel * dt;
      }
    }

    this._updateEnemies(dt, playerX, arguments.length > 2 ? arguments[2] : 0);
    this._updateShots(dt);
  };

  var HUNT_RANGE = 560;
  var FIRE_RANGE = 780;

  World.prototype._updateEnemies = function (dt, px, py) {
    for (var h = this.hazards.length - 1; h >= 0; h--) {
      var z = this.hazards[h];
      z.phase += dt;

      if (z.state === "webbed") {
        // Wrapped: it drops and is gone on impact.
        z.fall += C.GRAVITY * 0.55 * dt;
        z.y += z.fall * dt;
        z.x += z.vx * 0.3 * dt;
        if (z.y > C.GROUND_Y - 6 || this.collide(z.x, z.y, z.r * 0.6)) {
          z.removed = true;
          this.hazards.splice(h, 1);
        }
        continue;
      }

      var dx = px - z.x;
      var dy = py - z.y;
      var dist = Math.hypot(dx, dy);
      var sees = dist < FIRE_RANGE;

      if (z.type === "sentry") {
        // Stands its ground on a roof and throws.
        if (sees && py < C.GROUND_Y - 20) {
          z.alert = Math.min(1, z.alert + dt * 2);
          z.angle = Math.atan2(dy, dx);
          z.face = dx >= 0 ? 1 : -1;
          z.fireCd -= dt;
          if (z.fireCd <= 0) {
            z.fireCd = 1.7;
            this._fire(z, px, py, 430);
          }
        } else {
          z.alert = Math.max(0, z.alert - dt);
          z.angle = U.damp(z.angle, -1.2, 2, dt);
        }
        continue;
      }

      // --- everyone else runs on the rooftops --------------------------------
      var chasing = z.hostile && dist < HUNT_RANGE * 1.4;
      z.alert = U.clamp(z.alert + (chasing || sees ? dt * 2 : -dt), 0, 1);

      var speed = (z.type === "hunter" ? 150 : 190) * C.PACE;
      var want = 0;
      if (z.stole) {
        // Carrying someone else's parcel: run for it.
        z.face = dx >= 0 ? -1 : 1;
        want = z.face * speed * 1.35;
        z.alert = 1;
      } else if (chasing) {
        z.face = dx >= 0 ? 1 : -1;
        // Throwers back off when the courier gets too close.
        var keep = z.type === "netter" ? 300 : 60;
        want = Math.abs(dx) > keep ? z.face * speed : -z.face * speed * 0.5;
      } else if (z.onGround) {
        want = z.face * speed * 0.45;
      }
      if (z.throwFreeze > 0) {
        z.throwFreeze -= dt;
        want = 0;
      }

      if (z.onGround) z.vx = U.damp(z.vx, want, 8, dt);
      else z.vx = U.damp(z.vx, want, 1.2, dt);

      z.vy += C.GRAVITY * dt;
      z.x += z.vx * dt;
      z.y += z.vy * dt;
      z.onGround = false;

      if (z.y + z.r >= C.GROUND_Y) {
        z.y = C.GROUND_Y - z.r;
        z.vy = 0;
        z.onGround = true;
      }

      var solid = this.collide(z.x, z.y, z.r);
      if (solid) {
        z.x += solid.nx * solid.depth;
        z.y += solid.ny * solid.depth;
        if (solid.ny < -0.6) {
          z.vy = 0;
          z.onGround = true;
        } else if (Math.abs(solid.nx) > 0.6) {
          // Ran into a wall: climb it if the courier is above, else turn back.
          if (chasing && dy < -40) z.vy = -C.ENEMY_JUMP;
          else z.face = -z.face;
          z.vx = 0;
        } else if (solid.ny > 0.6) {
          z.vy = Math.max(z.vy, 0);
        }
      }

      // Edge of the roof: leap the gap when hunting, turn around otherwise.
      if (z.onGround) {
        z.jumpCd -= dt;
        var aheadX = z.x + z.face * (z.r + 10);
        var ahead =
          this.collide(aheadX, z.y + z.r + 8, 4) ||
          z.y + z.r + 8 >= C.GROUND_Y;
        if (!ahead) {
          if (chasing && z.jumpCd <= 0 && Math.abs(dx) > 40) {
            z.vy = -C.ENEMY_JUMP;
            z.vx = z.face * speed * 1.25;
            z.jumpCd = 0.6;
            z.onGround = false;
          } else {
            z.face = -z.face;
            z.vx = 0;
          }
        } else if (chasing && dy < -140 && z.jumpCd <= 0 && Math.abs(dx) < 260) {
          // Courier is swinging overhead: hop for a better throwing line.
          z.vy = -C.ENEMY_JUMP * 0.85;
          z.jumpCd = 1.4;
          z.onGround = false;
        }
      }

      // --- throwing ----------------------------------------------------------
      if (z.hostile && sees) {
        z.fireCd -= dt;
        if (z.fireCd <= 0) {
          if (z.type === "netter") {
            z.fireCd = 3.1;
            this._fire(z, px, py, C.NET_SPEED / C.PACE, true);
          } else {
            z.fireCd = z.type === "hunter" ? 1.9 : 2.4;
            this._fire(z, px, py, 430);
          }
          z.throwFreeze = 0.35;
        }
      }
    }
  };

  /** Enemy shot, aimed slightly ahead of where the player is now. */
  World.prototype._fire = function (z, px, py, speed, isNet) {
    var sp = speed * C.PACE;
    var dx = px - z.x;
    var dy = py - z.y;
    var d = Math.hypot(dx, dy) || 1;
    // Leave the thrower's own body, otherwise the bolt dies inside whatever
    // he is standing on.
    var muzzle = z.r + 10;
    this.shots.push({
      hostile: true,
      net: !!isNet,
      src: z,
      x: z.x + (dx / d) * muzzle,
      y: z.y + (dy / d) * muzzle,
      vx: (dx / d) * sp,
      vy: (dy / d) * sp,
      r: isNet ? 17 : 8,
      life: isNet ? 4 : 3.2,
      spin: 0,
    });
  };

  World.prototype._updateShots = function (dt) {
    for (var i = this.shots.length - 1; i >= 0; i--) {
      var s = this.shots[i];
      s.life -= dt;
      s.spin += dt * 6;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.net) s.vy += C.GRAVITY * 0.25 * dt;
      if (
        s.life <= 0 ||
        s.y > C.GROUND_Y ||
        this.collide(s.x, s.y, s.r * 0.5)
      ) {
        this.shots.splice(i, 1);
      }
    }
  };

  /** Nearest live enemy to a point, used by the aiming reticle. */
  World.prototype.enemyNear = function (x, y, radius) {
    var best = null;
    var bestD = radius;
    for (var i = 0; i < this.hazards.length; i++) {
      var z = this.hazards[i];
      if (z.state !== "alive") continue;
      var d = Math.hypot(x - z.x, y - z.y) - z.r;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  };

  World.prototype.enemyAt = function (x, y, r) {
    for (var i = 0; i < this.hazards.length; i++) {
      var z = this.hazards[i];
      if (z.state !== "alive") continue;
      var rr = z.r + r;
      var dx = x - z.x;
      var dy = y - z.y;
      if (dx * dx + dy * dy < rr * rr) return z;
    }
    return null;
  };

  /** A web hit: strong enemies need a second one. Returns true when downed. */
  World.prototype.webEnemy = function (z) {
    z.hp -= 1;
    if (z.hp > 0) {
      z.alert = 0;
      z.fireCd = Math.max(z.fireCd, 1.2);
      return false;
    }
    z.state = "webbed";
    z.fall = 0;
    return true;
  };

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------

  World.prototype._box = function (x, y, w, h, hard, prop) {
    var box = { x: x, y: y, w: w, h: h, hard: !!hard, prop: prop || null };
    this.boxes.push(box);
    return box;
  };

  /**
   * `roofKind` is the single structure this block is allowed to carry. Two
   * vertical things on one roof — a chimney beside a crane tower, say — build a
   * fence the courier cannot swing through, so only one is ever placed.
   */
  World.prototype._push = function (w, h, isStart, forceMast, roofKind) {
    var rng = this.rng;
    var level = LEVELS[this.levelIndex];
    var kind = roofKind || "mast";
    var b = {
      id: this.id++,
      x: this.nextX,
      w: w,
      h: h,
      top: -h,
      antennaH: 0,
      ax: 0,
    };
    var mastChance = (level.props.mast || 0.6) * (h > 560 ? 1.4 : 1);
    if (forceMast || (kind === "mast" && rng.chance(mastChance))) {
      b.antennaH = h > 560 ? rng.range(140, 280) : rng.range(90, 210);
      if (forceMast) b.antennaH = Math.max(b.antennaH, HIGH_ANCHOR - h + 40);
    }
    b.ax = b.x + b.w * rng.range(0.25, 0.75);
    b.sprite = buildSprite(b, rng, level);
    b.setbacks = [];
    // Stepped tops give extra ledges, but not under a crane or a chimney.
    var stepsAllowed = kind === "mast" || kind === "sign";
    if (stepsAllowed && level.setback && h > 380 && rng.chance(level.setback)) {
      var steps = rng.int(1, 2);
      var sw = w;
      var sy = b.top;
      for (var st = 0; st < steps; st++) {
        sw = sw * rng.range(0.5, 0.72);
        var sh = rng.range(60, 150);
        var sx = b.x + (w - sw) * rng.range(0.15, 0.85);
        sy -= sh;
        b.setbacks.push({ x: sx, y: sy, w: sw, h: sh });
        this._box(sx, sy, sw, sh, true);
      }
    }
    this.buildings.push(b);
    this._box(b.x, b.top, b.w, h, true);
    if (b.antennaH > 0) {
      this._box(b.ax - 7, b.top - b.antennaH, 14, b.antennaH, false);
    }
    if (isStart) this.startX = b.x + b.w * 0.5;
    return b;
  };

  /** Solid things whose top edge rises above `topY` inside the span [x0, x1]. */
  World.prototype._blockersAbove = function (x0, x1, topY) {
    var out = [];
    for (var i = 0; i < this.boxes.length; i++) {
      var box = this.boxes[i];
      if (!box.hard) continue;
      if (box.y >= topY) continue;
      if (box.x + box.w < x0 || box.x > x1) continue;
      out.push(box);
    }
    return out;
  };

  World.prototype._crane = function (b) {
    var rng = this.rng;
    var mastH = rng.range(170, 320);
    var jibY = b.top - mastH;
    var reach = rng.range(190, 330);
    var back = rng.range(50, 90);
    var x = b.x + b.w * rng.range(0.3, 0.8);

    // A jib that runs into a neighbour's chimney or billboard walls the gap
    // off, so it is trimmed short of anything solid — or dropped entirely.
    var blockers = this._blockersAbove(x - back, x + reach, b.top - 30);
    for (var i = 0; i < blockers.length; i++) {
      var box = blockers[i];
      if (box.x > x) reach = Math.min(reach, box.x - x - 24);
      else back = Math.min(back, x - (box.x + box.w) - 24);
    }

    // A jib that hangs just over a neighbouring roof turns the gap into a
    // tunnel, so it stops short of any roof it does not clear by 130 px.
    for (var n = 0; n < this.buildings.length; n++) {
      var nb = this.buildings[n];
      if (nb === b) continue;
      if (nb.x + nb.w < x - back || nb.x > x + reach) continue;
      if (jibY > nb.top - 130) {
        if (nb.x > x) reach = Math.min(reach, nb.x - x - 20);
        else back = Math.min(back, x - (nb.x + nb.w) - 20);
      }
    }

    if (reach < 110 || back < 20) return null;
    var crane = {
      type: "crane",
      x: x,
      baseY: b.top,
      jibY: jibY,
      x0: x - back,
      x1: x + reach,
      hookX: x + reach * rng.range(0.45, 0.85),
      hookLen: rng.range(70, 190),
    };
    // Half of the cranes carry a swinging load worth dodging.
    if (rng.chance(0.5)) {
      crane.load = {
        len: crane.hookLen,
        angle: rng.range(-0.5, 0.5),
        vel: rng.range(-0.6, 0.6),
        r: rng.range(20, 30),
      };
    }
    this.props.push(crane);
    this._box(x - 8, jibY, 16, mastH, false, crane);
    this._box(crane.x0, jibY - 5, crane.x1 - crane.x0, 11, true, crane);
    return crane;
  };

  World.prototype._sign = function (b) {
    var rng = this.rng;
    var w = rng.range(70, 150);
    var h = rng.range(34, 62);
    var legs = rng.range(26, 70);
    var x = b.x + rng.range(4, Math.max(6, b.w - w - 4));
    var y = b.top - legs - h;
    var sign = {
      type: "sign",
      x: x,
      y: y,
      w: w,
      h: h,
      legs: legs,
      hue: rng.pick(SIGN_HUES),
      seed: rng.int(0, 9999),
    };
    this.props.push(sign);
    this._box(x, y, w, h, true, sign);
    return sign;
  };

  World.prototype._wire = function (a, b) {
    var rng = this.rng;
    var y0 = a.top + rng.range(18, 90);
    var y1 = b.top + rng.range(18, 90);
    var wire = {
      type: "wire",
      x0: a.x + a.w - 6,
      y0: y0,
      x1: b.x + 6,
      y1: y1,
      cy: (y0 + y1) / 2 + rng.range(40, 110),
      lamps: rng.int(2, 4),
    };
    this.props.push(wire);
    return wire;
  };

  /** Factory chimney: a thin tower to swing around, and a perch on top. */
  World.prototype._chimney = function (b) {
    var rng = this.rng;
    var w = rng.range(20, 30);
    var h = rng.range(140, 300);
    var x = b.x + rng.range(10, Math.max(12, b.w - w - 10));
    var y = b.top - h;
    // Never raise one inside a crane's working area.
    if (this._blockersAbove(x - 30, x + w + 30, b.top - 30).length) return null;
    var prop = { type: "chimney", x: x, y: y, w: w, h: h, seed: rng.int(0, 999) };
    this.props.push(prop);
    this._box(x, y, w, h, true, prop);
    return prop;
  };

  /** Church spire: anchor only, so nobody gets impaled on it mid-swing. */
  World.prototype._spire = function (b) {
    var rng = this.rng;
    var h = rng.range(70, 190);
    var x = b.x + b.w * rng.range(0.3, 0.7);
    var prop = { type: "spire", x: x, y: b.top - h, h: h, base: rng.range(14, 26) };
    this.props.push(prop);
    this._box(x - 5, b.top - h, 10, h, false, prop);
    return prop;
  };

  /** Scaffolding down a facade: a web sticks anywhere along it. */
  World.prototype._scaffold = function (b) {
    var rng = this.rng;
    var h = Math.min(b.h - 40, rng.range(180, 420));
    var side = rng.chance(0.5) ? -1 : 1;
    var w = 26;
    var x = side < 0 ? b.x - w + 4 : b.x + b.w - 4;
    var y = b.top + rng.range(0, 60);
    var prop = { type: "scaffold", x: x, y: y, w: w, h: h, seed: rng.int(0, 999) };
    this.props.push(prop);
    this._box(x, y, w, h, false, prop);
    return prop;
  };

  /** Tethered balloon: the envelope and its whole cable catch a web. */
  World.prototype._balloon = function (b) {
    var rng = this.rng;
    var x = b.x + b.w * rng.range(0.3, 0.7);
    var len = rng.range(220, 460);
    this.props.push({
      type: "balloon",
      x: x,
      baseY: b.top,
      len: len,
      y: b.top - len,
      rx: rng.range(34, 52),
      ry: rng.range(42, 64),
      phase: rng.range(0, U.TAU),
      sway: rng.range(10, 26),
    });
  };

  /** Sky bridge: solid enough to run across and to swing under. */
  World.prototype._bridge = function (a, b) {
    var rng = this.rng;
    var top = Math.max(a.top, b.top) + rng.range(50, 190);
    var x0 = a.x + a.w - 6;
    var x1 = b.x + 6;
    var prop = {
      type: "bridge",
      x: x0,
      y: top,
      w: x1 - x0,
      h: 16,
      seed: rng.int(0, 999),
    };
    this.props.push(prop);
    this._box(x0, top, prop.w, prop.h, true, prop);
    return prop;
  };

  /** Neon lettering on a facade: pure decoration, but it lights the street. */
  World.prototype._neonSign = function (b) {
    var rng = this.rng;
    var level = LEVELS[this.levelIndex];
    var vertical = rng.chance(0.55) && b.h > 300;
    var word = rng.pick(level.words);
    var hue = rng.pick(level.neon);
    var size = rng.range(15, 23);
    var pad = 10;
    var w = vertical ? size + pad : word.length * size * 0.62 + pad;
    var h = vertical ? word.length * size * 0.95 + pad : size + pad;
    var side = rng.chance(0.5) ? 0 : 1;
    var x = side ? b.x + b.w - w - rng.range(4, 14) : b.x + rng.range(4, 14);
    var y = b.top + rng.range(30, Math.max(40, b.h * 0.55));
    this.props.push({
      type: "neon",
      x: x,
      y: y,
      w: w,
      h: h,
      word: word,
      hue: hue,
      size: size,
      vertical: vertical,
      phase: rng.range(0, U.TAU),
      broken: rng.chance(0.18),
    });
  };

  World.prototype._blimp = function (x) {
    var rng = this.rng;
    this.props.push({
      type: "blimp",
      x: x,
      y: -rng.range(1180, 1750),
      rx: rng.range(95, 150),
      ry: rng.range(34, 52),
      vx: -rng.range(18, 46) * C.PACE,
      phase: rng.range(0, U.TAU),
    });
  };

  function baseEnemy(e) {
    e.state = "alive";
    e.hp = e.hp || 1;
    e.fireCd = 0;
    e.alert = 0;
    e.fall = 0;
    e.vy = 0;
    e.onGround = false;
    e.face = e.vx > 0 ? 1 : -1;
    e.jumpCd = 0;
    e.throwFreeze = 0;
    return e;
  }

  /** Rivals stand on the roof of the block they belong to, never in mid-air. */
  World.prototype._hazard = function (b, crane) {
    var rng = this.rng;
    var clear = this.freeRoofSpot(b, 20);
    var roofX = clear ? clear.x : b.x + b.w * 0.5;
    var roofY = b.top;

    // A crane jib is a fine place to wait for a courier.
    if (crane && rng.chance(0.4)) {
      var jibX = U.lerp(crane.x0 + 20, crane.x1 - 20, rng.next());
      if (!this.collide(jibX, crane.jibY - 26, 17)) {
        roofX = jibX;
        roofY = crane.jibY - 5;
      } else if (!clear) {
        return;
      }
    } else if (!clear) {
      return; // nowhere to stand on this block
    }

    if (rng.chance(0.34)) {
      this.hazards.push(
        baseEnemy({
          type: "hunter",
          color: "red",
          x: roofX,
          y: roofY - 18,
          r: 18,
          vx: -rng.range(40, 90) * C.PACE,
          phase: rng.range(0, U.TAU),
          hostile: true,
          hp: 2,
          contact: true,
        })
      );
    } else if (rng.chance(0.4)) {
      this.hazards.push(
        baseEnemy({
          type: "netter",
          color: "green",
          x: roofX,
          y: roofY - 16,
          r: 16,
          vx: -rng.range(30, 70) * C.PACE,
          phase: rng.range(0, U.TAU),
          hostile: true,
          contact: false,
        })
      );
    } else {
      var n = rng.int(1, 2);
      for (var i = 0; i < n; i++) {
        this.hazards.push(
          baseEnemy({
            type: "runner",
            color: "red",
            x: roofX + i * rng.range(50, 120),
            y: roofY - 16,
            r: 16,
            phase: rng.range(0, U.TAU),
            vx: -rng.range(50, 110) * C.PACE,
            hostile: rng.chance(0.8),
            contact: true,
          })
        );
      }
    }
  };

  World.prototype._turret = function (b) {
    var spot = this.freeRoofSpot(b, 20);
    // Standing inside a chimney would swallow every bolt it fires.
    if (!spot) return;
    var x = spot.x;
    this.hazards.push(
      baseEnemy({
        type: "sentry",
        color: "green",
        x: x,
        y: b.top - 18,
        baseY: b.top - 18,
        r: 16,
        vx: 0,
        phase: 0,
        hostile: true,
        contact: false,
        angle: -1.2,
      })
    );
  };

  World.prototype._spawnPizzas = function (b, gap) {
    var rng = this.rng;

    // A slice waiting on the roof: fuel for anyone flying above the arcs.
    if (rng.chance(0.38)) {
      var spot = this.freeRoofSpot(b, 20);
      if (spot) {
        this.pizzas.push({
          x: spot.x,
          y: spot.y - 22,
          taken: false,
          phase: rng.range(0, U.TAU),
          spin: rng.range(-0.6, 0.6),
        });
      }
    }

    if (gap < 120 || !rng.chance(0.88)) return;
    var n = rng.int(3, 6);
    var x0 = b.x + b.w + 26;
    var x1 = b.x + b.w + gap - 26;
    var base = -(Math.max(b.h, 240) + rng.range(50, 240));
    var amp = rng.range(20, 100);
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      this.pizzas.push({
        x: U.lerp(x0, x1, t),
        y: base - Math.sin(t * Math.PI) * amp,
        taken: false,
        phase: rng.range(0, U.TAU),
        spin: rng.range(-0.6, 0.6),
      });
    }
  };

  World.prototype.ensureUpTo = function (x) {
    var rng = this.rng;
    while (this.nextX < x) {
      var level = LEVELS[this.levelIndex];
      var props = level.props;
      var w = rng.range(level.w[0], level.w[1]);
      var h;
      var forceHigh = this.nextX - this.lastHighX > 700;
      if (forceHigh || rng.chance(level.towerChance)) {
        h = rng.range(level.tower[0], level.tower[1]);
      } else {
        h = rng.range(level.h[0], level.h[1]);
      }

      // One structure per roof, drawn from the level's weights so a common
      // crane never crowds out the rarer chimneys and spires.
      var roofKind = "mast";
      // The first stretch after the launch pad stays free of overhangs.
      var openingZone = this.nextX < this.startX + 950;
      if (!forceHigh && !openingZone) {
        var options = [["crane", props.crane || 0]];
        if (level.chimney) options.push(["chimney", level.chimney]);
        if (level.spire) options.push(["spire", level.spire]);
        options.push(["sign", props.sign || 0]);
        var total = 0;
        var oi;
        for (oi = 0; oi < options.length; oi++) total += options[oi][1];
        var roll = rng.next() * Math.max(1, total);
        for (oi = 0; oi < options.length; oi++) {
          roll -= options[oi][1];
          if (roll <= 0) {
            roofKind = options[oi][0];
            break;
          }
        }
      }

      var b = this._push(w, h, false, forceHigh, roofKind);
      if (b.h + b.antennaH >= HIGH_ANCHOR) this.lastHighX = b.x + b.w * 0.5;

      var crane = null;
      if (roofKind === "crane") crane = this._crane(b);
      else if (roofKind === "chimney") this._chimney(b);
      else if (roofKind === "spire") this._spire(b);
      else if (roofKind === "sign") this._sign(b);

      if (b.h > 220 && rng.chance(0.55)) this._neonSign(b);

      // Facade scaffolding and a tethered balloon do not crowd the roof line.
      if (level.scaffold && rng.chance(level.scaffold)) this._scaffold(b);
      if (level.balloon && roofKind !== "crane" && rng.chance(level.balloon)) {
        this._balloon(b);
      }

      if (this.prev) {
        var span = b.x - (this.prev.x + this.prev.w);
        if (level.bridge && span > 120 && span < 520 && rng.chance(level.bridge)) {
          this._bridge(this.prev, b);
        } else if (span > 150 && rng.chance(props.wire)) {
          this._wire(this.prev, b);
        }
      }
      this.prev = b;

      if (b.x > this.nextBlimpX) {
        this._blimp(b.x + rng.range(400, 1200));
        this.nextBlimpX = b.x + rng.range(2800, 4800) * (props.blimp || 1);
      }
      // Rivals arrive in waves: a quiet stretch, then several blocks in a row.
      if (this.hazardsOn && this.waveLeft > 0) {
        this._hazard(b, crane);
        this.waveLeft--;
      } else if (this.hazardsOn && b.x > this.nextHazardX) {
        this.waveLeft = rng.int(2, 4);
        this.nextHazardX = b.x + rng.range(3400, 5400);
      }
      if (this.hazardsOn && h > 300 && rng.chance(0.12)) this._turret(b);

      var gap = rng.range(level.gap[0], level.gap[1]);
      this._spawnPizzas(b, gap);
      this.nextX += w + gap;
    }
    this.boxes.sort(function (p, q) {
      return p.x - q.x;
    });
  };

  World.prototype.prune = function (x) {
    while (this.buildings.length && this.buildings[0].x + this.buildings[0].w < x) {
      this.buildings.shift();
    }
    while (this.boxes.length && this.boxes[0].x + this.boxes[0].w < x) {
      this.boxes.shift();
    }
    while (this.pizzas.length && this.pizzas[0].x < x) this.pizzas.shift();
    var i;
    for (i = this.props.length - 1; i >= 0; i--) {
      var p = this.props[i];
      var right =
        p.type === "wire"
          ? p.x1
          : p.type === "blimp" || p.type === "balloon"
          ? p.x + p.rx
          : p.type === "spire"
          ? p.x + 40
          : p.x1 || p.x + p.w;
      if (right < x) this.props.splice(i, 1);
    }
    for (i = this.hazards.length - 1; i >= 0; i--) {
      if (this.hazards[i].x + 200 < x) {
        this.hazards[i].removed = true;
        this.hazards.splice(i, 1);
      }
    }
    for (i = this.shots.length - 1; i >= 0; i--) {
      if (this.shots[i].x + 200 < x) this.shots.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  World.prototype.near = function (x0, x1, out) {
    out.length = 0;
    for (var i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i];
      if (b.x + b.w < x0) continue;
      if (b.x > x1) break;
      out.push(b);
    }
    return out;
  };

  function wireY(w, x) {
    var t = (x - w.x0) / (w.x1 - w.x0);
    var it = 1 - t;
    return it * it * w.y0 + 2 * it * t * w.cy + t * t * w.y1;
  }

  World.prototype.softAt = function (x, y) {
    // A cocooned enemy still hangs in the air for a moment: web it and swing.
    for (var k = 0; k < this.hazards.length; k++) {
      var z = this.hazards[k];
      if (z.state !== "webbed") continue;
      var zdx = x - z.x;
      var zdy = y - z.y;
      var zr = z.r + 8;
      if (zdx * zdx + zdy * zdy <= zr * zr) return z;
    }
    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (p.type === "wire") {
        if (x < p.x0 || x > p.x1) continue;
        if (Math.abs(y - wireY(p, x)) <= 7) return p;
      } else if (p.type === "blimp") {
        var dx = (x - p.x) / p.rx;
        var dy = (y - p.y) / p.ry;
        if (dx * dx + dy * dy <= 1) return p;
      } else if (p.type === "balloon") {
        var topX = p.x + (p.drift || 0);
        var bdx = (x - topX) / p.rx;
        var bdy = (y - p.y) / p.ry;
        if (bdx * bdx + bdy * bdy <= 1) return p;
        // The cable counts along its whole length.
        if (y > p.y && y < p.baseY) {
          var t = (y - p.y) / Math.max(1, p.baseY - p.y);
          var cx = U.lerp(topX, p.x, t);
          if (Math.abs(x - cx) <= 7) return p;
        }
      }
    }
    return null;
  };

  World.prototype.solidAt = function (x, y, list) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  };

  var _scratch = [];

  World.prototype.raycast = function (ox, oy, dx, dy, maxDist) {
    var x0 = Math.min(ox, ox + dx * maxDist) - 8;
    var x1 = Math.max(ox, ox + dx * maxDist) + 8;
    var list = this.near(x0, x1, _scratch);
    var step = 4;
    var px = ox;
    var py = oy;
    for (var travelled = step; travelled <= maxDist; travelled += step) {
      var x = ox + dx * travelled;
      var y = oy + dy * travelled;
      if (y > C.GROUND_Y) return null; // the street is not web-friendly

      var soft = this.softAt(x, y);
      if (soft) {
        return {
          x: x,
          y: soft.type === "wire" ? wireY(soft, x) : y,
          dist: travelled,
          obj: soft.state === "webbed" || soft.type === "blimp" ? soft : null,
        };
      }

      var b = this.solidAt(x, y, list);
      if (b) {
        var ax = px;
        var ay = py;
        if (b.hard && !b.prop && py > b.y + 1) {
          var ry = b.y - 4;
          var rx = px < b.x + b.w * 0.5 ? b.x - 7 : b.x + b.w + 7;
          if (Math.hypot(rx - ox, ry - oy) <= maxDist) {
            ax = rx;
            ay = ry;
          }
        }
        return { x: ax, y: ay, dist: Math.hypot(ax - ox, ay - oy), obj: null };
      }
      px = x;
      py = y;
    }
    return null;
  };

  World.prototype.collide = function (x, y, r) {
    var list = this.near(x - r - 4, x + r + 4, _scratch);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b.hard) continue;
      var top = b.y;
      var bottom = b.y + b.h;
      var cx = U.clamp(x, b.x, b.x + b.w);
      var cy = U.clamp(y, top, bottom);
      var dx = x - cx;
      var dy = y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;

      var d = Math.sqrt(d2);
      if (d > 0.0001) {
        return { box: b, nx: dx / d, ny: dy / d, depth: r - d };
      }

      var toLeft = x - b.x;
      var toRight = b.x + b.w - x;
      var toTop = y - top;
      var toBottom = bottom - y;
      var m = Math.min(toLeft, toRight, toTop, toBottom);
      if (m === toTop) return { box: b, nx: 0, ny: -1, depth: toTop + r };
      if (m === toBottom) return { box: b, nx: 0, ny: 1, depth: toBottom + r };
      if (m === toLeft) return { box: b, nx: -1, ny: 0, depth: toLeft + r };
      return { box: b, nx: 1, ny: 0, depth: toRight + r };
    }
    return null;
  };

  /** Distance to the closest hard surface, capped at `max`. */
  World.prototype.clearance = function (x, y, max) {
    var list = this.near(x - max, x + max, _scratch);
    var best = max;
    var bestBox = null;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b.hard) continue;
      var cx = U.clamp(x, b.x, b.x + b.w);
      var cy = U.clamp(y, b.y, b.y + b.h);
      var d = Math.hypot(x - cx, y - cy);
      if (d < best) {
        best = d;
        bestBox = b;
      }
    }
    return { dist: best, box: bestBox };
  };

  /** Clear air straight below a point, capped at `max`. */
  World.prototype.clearBelow = function (x, y, max) {
    var list = this.near(x - 2, x + 2, _scratch);
    var step = 8;
    for (var d = step; d <= max; d += step) {
      var yy = y + d;
      if (yy >= C.GROUND_Y) return d;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b.hard) continue;
        if (x >= b.x && x <= b.x + b.w && yy >= b.y && yy <= b.y + b.h) return d;
      }
    }
    return max;
  };

  /**
   * A spot on this roof that is clear of everything standing on it. Cargo, a
   * slice of pizza or a rival dropped blindly on the centre ends up buried
   * inside a setback or a chimney, which reads as a blocked passage.
   */
  World.prototype.freeRoofSpot = function (b, pad) {
    var r = pad || 24;
    var margin = Math.min(b.w * 0.2, 40) + r;
    if (b.w < r * 2 + 10) return null;
    for (var i = 0; i < 7; i++) {
      var t = i / 6;
      var x = U.lerp(b.x + margin, b.x + b.w - margin, t);
      if (!this.collide(x, b.top - r - 2, r)) return { x: x, y: b.top };
    }
    return null;
  };

  World.prototype.roofUnder = function (x, y, r) {
    var list = this.near(x - r, x + r, _scratch);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b.hard) continue;
      if (x < b.x - r * 0.4 || x > b.x + b.w + r * 0.4) continue;
      if (Math.abs(y + r - b.y) <= 4) return b;
    }
    return null;
  };

  /** Moving obstacles: helicopters, drones and swinging crane loads. */
  World.prototype.shotAt = function (x, y, r) {
    for (var i = this.shots.length - 1; i >= 0; i--) {
      var s = this.shots[i];
      var rr = s.r + r;
      var dx = x - s.x;
      var dy = y - s.y;
      if (dx * dx + dy * dy < rr * rr) {
        this.shots.splice(i, 1);
        return s;
      }
    }
    return null;
  };

  World.prototype.hazardAt = function (x, y, r) {
    var i;
    for (i = 0; i < this.hazards.length; i++) {
      var z = this.hazards[i];
      if (z.state !== "alive" || z.contact === false) continue;
      var rr = z.r + r;
      var dx = x - z.x;
      var dy = y - z.y;
      if (dx * dx + dy * dy < rr * rr) return z;
    }
    for (i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (p.type !== "crane" || !p.load) continue;
      var lx = p.hookX + Math.sin(p.load.angle) * p.load.len;
      var ly = p.jibY + Math.cos(p.load.angle) * p.load.len;
      var lr = p.load.r + r;
      var ldx = x - lx;
      var ldy = y - ly;
      if (ldx * ldx + ldy * ldy < lr * lr) {
        return { type: "load", x: lx, y: ly, r: p.load.r };
      }
    }
    return null;
  };

  World.LEVELS = LEVELS;
  World.DISTRICTS = LEVELS;
  World.DISTRICT_LEN = WEATHER_LEN;
  World.wireY = wireY;
  SW.World = World;
})(window);
