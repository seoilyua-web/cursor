(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  var HIGH_ANCHOR = 760; // height above the street that always stays reachable
  var DISTRICT_LEN = 3400;

  var SIGN_HUES = ["#ff3b6b", "#43e5ff", "#ffb03a", "#8b5cff", "#3ee08f"];

  /**
   * Districts change both the skyline geometry and the palette, so the tactics
   * change with them: towers give short arcs, the outskirts force long ones.
   */
  var DISTRICTS = [
    {
      id: "centre",
      name: "Деловой центр",
      w: [130, 235],
      h: [420, 780],
      tower: [820, 1250],
      towerChance: 0.3,
      gap: [210, 400],
      crane: 0.2,
      sign: 0.4,
      wire: 0.4,
      facades: [
        ["#1b2540", "#0d1428"],
        ["#232041", "#100e26"],
      ],
      sky: ["#080a1c", "#2a1b48", "#6b2f52", "#c2603f"],
      far: "rgba(24,26,58,0.85)",
      mid: "rgba(15,17,42,0.92)",
    },
    {
      id: "industrial",
      name: "Промзона",
      w: [170, 320],
      h: [170, 360],
      tower: [520, 760],
      towerChance: 0.14,
      gap: [320, 580],
      crane: 0.6,
      sign: 0.1,
      wire: 0.75,
      facades: [
        ["#1c2b2e", "#0b1417"],
        ["#26261f", "#111109"],
      ],
      sky: ["#050a12", "#123043", "#2f5b5c", "#9e7a3c"],
      far: "rgba(18,34,40,0.85)",
      mid: "rgba(9,20,26,0.92)",
    },
    {
      id: "residential",
      name: "Спальный район",
      w: [120, 210],
      h: [200, 350],
      tower: [430, 600],
      towerChance: 0.12,
      gap: [270, 470],
      crane: 0.14,
      sign: 0.2,
      wire: 0.85,
      facades: [
        ["#1e2440", "#0e1024"],
        ["#242a4a", "#12142c"],
      ],
      sky: ["#060814", "#1c1f4a", "#3f3b78", "#7d5f9c"],
      far: "rgba(26,28,64,0.85)",
      mid: "rgba(14,16,40,0.92)",
    },
    {
      id: "oldtown",
      name: "Старый город",
      w: [95, 170],
      h: [250, 430],
      tower: [520, 800],
      towerChance: 0.22,
      gap: [180, 320],
      crane: 0.1,
      sign: 0.45,
      wire: 0.7,
      facades: [
        ["#2f2333", "#170f1c"],
        ["#33261f", "#180f0c"],
      ],
      sky: ["#0b0714", "#3a1d34", "#7d3b3a", "#d08243"],
      far: "rgba(42,28,46,0.85)",
      mid: "rgba(24,15,28,0.92)",
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
    this.orbs = [];
    this.startX = 0;
    this.nextX = 0;
    this.id = 0;
    this.lastHighX = 0;
    this.prev = null;
    this.nextBlimpX = 0;
    this.nextHazardX = 0;
    this.weather = { wind: 0, rain: 0, fog: 0 };
    this.target = { wind: 0, rain: 0, fog: 0 };
    this.districtIndex = 0;
    this.hazardsOn = true;
    this.weatherOn = true;
  }

  World.prototype.reset = function (seed) {
    this.rng = new U.Rng(seed);
    this.buildings.length = 0;
    this.props.length = 0;
    this.hazards.length = 0;
    this.shots.length = 0;
    this.boxes.length = 0;
    this.orbs.length = 0;
    this.nextX = -400;
    this.startX = 0;
    this.id = 0;
    this.lastHighX = -400;
    this.prev = null;
    this.nextBlimpX = 1800;
    this.nextHazardX = 2600;
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
  World.prototype.districtAt = function (x) {
    var raw = (x - this.startX) / DISTRICT_LEN;
    var i = Math.floor(Math.max(0, raw));
    var frac = Math.max(0, raw) - i;
    return {
      def: DISTRICTS[i % DISTRICTS.length],
      next: DISTRICTS[(i + 1) % DISTRICTS.length],
      blend: U.clamp((frac - 0.82) / 0.18, 0, 1),
      index: i,
    };
  };

  World.prototype._rollWeather = function (index) {
    if (!this.weatherOn) {
      this.target.wind = 0;
      this.target.rain = 0;
      this.target.fog = 0;
      return;
    }
    var rng = new U.Rng((index + 1) * 9176 + this.id);
    var def = DISTRICTS[index % DISTRICTS.length];
    var gusty = def.id === "industrial" || def.id === "residential";
    this.target.wind = rng.chance(gusty ? 0.75 : 0.45)
      ? rng.range(-1, 1) * (gusty ? 1 : 0.6)
      : 0;
    this.target.rain = rng.chance(0.3) ? rng.range(0.35, 1) : 0;
    this.target.fog = rng.chance(0.28) ? rng.range(0.25, 0.8) : 0;
  };

  World.prototype.update = function (dt, playerX) {
    var d = this.districtAt(playerX);
    if (d.index !== this.districtIndex) {
      this.districtIndex = d.index;
      this._rollWeather(d.index);
    }
    var w = this.weather;
    w.wind = U.damp(w.wind, this.target.wind, 0.7, dt);
    w.rain = U.damp(w.rain, this.target.rain, 0.5, dt);
    w.fog = U.damp(w.fog, this.target.fog, 0.4, dt);

    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (p.type === "blimp") p.x += p.vx * dt;
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
        // Wrapped: it drops out of the sky and is gone on impact.
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

      if (z.type === "drone") {
        if (z.hostile && dist < HUNT_RANGE) {
          // Lock on and close the distance, but never faster than a swing.
          z.alert = Math.min(1, z.alert + dt * 2.5);
          var speed = 230 * C.PACE;
          z.vx = U.damp(z.vx, (dx / dist) * speed, 1.6, dt);
          z.y = U.damp(z.y, py, 1.1, dt);
          z.baseY = z.y;
        } else {
          z.alert = Math.max(0, z.alert - dt);
          z.y = z.baseY + Math.sin(z.phase * 1.5) * z.amp;
        }
        z.x += z.vx * dt;
      } else if (z.type === "netter") {
        // Keeps its distance and throws nets instead of ramming.
        z.y = z.baseY + Math.sin(z.phase * 1.2) * z.amp;
        if (dist < 620) {
          z.alert = Math.min(1, z.alert + dt * 2);
          var want = 360;
          var push = dist < want ? -1 : 1;
          z.vx = U.damp(z.vx, (dx / dist) * 150 * C.PACE * push, 1.4, dt);
          z.baseY = U.damp(z.baseY, py - 120, 0.7, dt);
          z.fireCd -= dt;
          if (z.fireCd <= 0) {
            z.fireCd = 3.1;
            this._fire(z, px, py, C.NET_SPEED / C.PACE, true);
          }
        } else {
          z.alert = Math.max(0, z.alert - dt);
        }
        z.x += z.vx * dt;
      } else if (z.type === "heli") {
        z.x += z.vx * dt;
        z.y = z.baseY + Math.sin(z.phase * 0.8) * 26;
        if (z.hostile && dist < FIRE_RANGE) {
          z.alert = Math.min(1, z.alert + dt * 1.6);
          z.fireCd -= dt;
          if (z.fireCd <= 0) {
            z.fireCd = 2.2;
            this._fire(z, px, py, 360);
          }
        } else {
          z.alert = Math.max(0, z.alert - dt * 0.6);
        }
      } else if (z.type === "turret") {
        if (dist < FIRE_RANGE && py < C.GROUND_Y - 20) {
          z.alert = Math.min(1, z.alert + dt * 2);
          z.angle = Math.atan2(dy, dx);
          z.fireCd -= dt;
          if (z.fireCd <= 0) {
            z.fireCd = 1.7;
            this._fire(z, px, py, 420);
          }
        } else {
          z.alert = Math.max(0, z.alert - dt);
          z.angle = U.damp(z.angle, -1.2, 2, dt);
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
    this.shots.push({
      hostile: true,
      net: !!isNet,
      src: z,
      x: z.x,
      y: z.y,
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

  World.prototype._push = function (w, h, isStart, forceMast) {
    var rng = this.rng;
    var district = this.districtAt(this.nextX).def;
    var b = {
      id: this.id++,
      x: this.nextX,
      w: w,
      h: h,
      top: -h,
      antennaH: 0,
      ax: 0,
    };
    if (forceMast || (h > 560 ? rng.chance(0.9) : rng.chance(0.6))) {
      b.antennaH = h > 560 ? rng.range(140, 280) : rng.range(90, 210);
      if (forceMast) b.antennaH = Math.max(b.antennaH, HIGH_ANCHOR - h + 40);
    }
    b.ax = b.x + b.w * rng.range(0.25, 0.75);
    b.sprite = buildSprite(b, rng, district);
    this.buildings.push(b);
    this._box(b.x, b.top, b.w, h, true);
    if (b.antennaH > 0) {
      this._box(b.ax - 7, b.top - b.antennaH, 14, b.antennaH, false);
    }
    if (isStart) this.startX = b.x + b.w * 0.5;
    return b;
  };

  World.prototype._crane = function (b) {
    var rng = this.rng;
    var mastH = rng.range(170, 320);
    var jibY = b.top - mastH;
    var reach = rng.range(190, 330);
    var back = rng.range(50, 90);
    var x = b.x + b.w * rng.range(0.3, 0.8);
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
    return e;
  }

  World.prototype._hazard = function (x) {
    var rng = this.rng;
    if (rng.chance(0.42)) {
      var y = -rng.range(430, 980);
      this.hazards.push(
        baseEnemy({
          type: "heli",
          x: x,
          y: y,
          baseY: y,
          r: 30,
          vx: -rng.range(70, 130) * C.PACE,
          phase: rng.range(0, U.TAU),
          beam: rng.range(240, 420),
          hostile: true,
          hp: 2,
          contact: true,
        })
      );
    } else if (rng.chance(0.3)) {
      var ny = -rng.range(320, 760);
      this.hazards.push(
        baseEnemy({
          type: "netter",
          x: x,
          y: ny,
          baseY: ny,
          amp: 30,
          r: 17,
          vx: -rng.range(20, 50) * C.PACE,
          phase: rng.range(0, U.TAU),
          hostile: true,
          contact: false,
        })
      );
    } else {
      var n = rng.int(1, 3);
      for (var i = 0; i < n; i++) {
        var by = -rng.range(240, 820);
        this.hazards.push(
          baseEnemy({
            type: "drone",
            x: x + i * rng.range(90, 220),
            y: by,
            baseY: by,
            amp: rng.range(24, 70),
            r: 15,
            vx: -rng.range(14, 46) * C.PACE,
            phase: rng.range(0, U.TAU),
            // Two thirds of the swarm actively hunt; the rest just drift.
            hostile: rng.chance(0.65),
            contact: true,
          })
        );
      }
    }
  };

  World.prototype._turret = function (b) {
    var rng = this.rng;
    var x = b.x + b.w * rng.range(0.2, 0.8);
    this.hazards.push(
      baseEnemy({
        type: "turret",
        x: x,
        y: b.top - 14,
        baseY: b.top - 14,
        r: 16,
        vx: 0,
        phase: 0,
        hostile: true,
        contact: false,
        angle: -1.2,
      })
    );
  };

  World.prototype._spawnOrbs = function (b, gap) {
    var rng = this.rng;
    if (gap < 130 || !rng.chance(0.82)) return;
    var n = rng.int(3, 6);
    var x0 = b.x + b.w + 26;
    var x1 = b.x + b.w + gap - 26;
    var base = -(Math.max(b.h, 240) + rng.range(50, 240));
    var amp = rng.range(20, 100);
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      this.orbs.push({
        x: U.lerp(x0, x1, t),
        y: base - Math.sin(t * Math.PI) * amp,
        taken: false,
        phase: rng.range(0, U.TAU),
      });
    }
  };

  World.prototype.ensureUpTo = function (x) {
    var rng = this.rng;
    while (this.nextX < x) {
      var district = this.districtAt(this.nextX).def;
      var w = rng.range(district.w[0], district.w[1]);
      var h;
      var forceHigh = this.nextX - this.lastHighX > 700;
      if (forceHigh || rng.chance(district.towerChance)) {
        h = rng.range(district.tower[0], district.tower[1]);
      } else {
        h = rng.range(district.h[0], district.h[1]);
      }

      var b = this._push(w, h, false, forceHigh);
      if (b.h + b.antennaH >= HIGH_ANCHOR) this.lastHighX = b.x + b.w * 0.5;

      if (rng.chance(district.crane)) this._crane(b);
      else if (rng.chance(district.sign)) this._sign(b);

      if (
        this.prev &&
        b.x - (this.prev.x + this.prev.w) > 150 &&
        rng.chance(district.wire)
      ) {
        this._wire(this.prev, b);
      }
      this.prev = b;

      if (b.x > this.nextBlimpX) {
        this._blimp(b.x + rng.range(400, 1200));
        this.nextBlimpX = b.x + rng.range(2800, 4800);
      }
      if (this.hazardsOn && b.x > this.nextHazardX) {
        this._hazard(b.x + rng.range(300, 900));
        this.nextHazardX = b.x + rng.range(2200, 4200);
      }
      if (this.hazardsOn && h > 300 && rng.chance(0.12)) this._turret(b);

      var gap = rng.range(district.gap[0], district.gap[1]);
      this._spawnOrbs(b, gap);
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
    while (this.orbs.length && this.orbs[0].x < x) this.orbs.shift();
    var i;
    for (i = this.props.length - 1; i >= 0; i--) {
      var p = this.props[i];
      var right =
        p.type === "wire"
          ? p.x1
          : p.type === "blimp"
          ? p.x + p.rx
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

  /** Distance to the closest hard surface, capped at `max`. Used for grazes. */
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

  World.DISTRICTS = DISTRICTS;
  World.DISTRICT_LEN = DISTRICT_LEN;
  World.wireY = wireY;
  SW.World = World;
})(window);
