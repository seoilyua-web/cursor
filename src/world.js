(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  var HIGH_ANCHOR = 760; // height above the street that always stays reachable

  var FACADES = [
    ["#1b2540", "#0d1428"],
    ["#232041", "#100e26"],
    ["#182c3c", "#0b1722"],
    ["#2a1f36", "#140e1e"],
  ];

  var SIGN_HUES = ["#ff3b6b", "#43e5ff", "#ffb03a", "#8b5cff", "#3ee08f"];

  function buildSprite(b, rng) {
    var totalH = b.h + b.antennaH;
    var cv = document.createElement("canvas");
    cv.width = Math.ceil(b.w);
    cv.height = Math.ceil(totalH);
    var g = cv.getContext("2d");
    var top = b.antennaH; // roof line inside the sprite

    var pal = rng.pick(FACADES);
    var grad = g.createLinearGradient(0, top, b.w, totalH);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(1, pal[1]);
    g.fillStyle = grad;
    g.fillRect(0, top, b.w, b.h);

    // Lit edge to separate silhouettes against the sky.
    g.fillStyle = "rgba(140,180,255,0.16)";
    g.fillRect(0, top, b.w, 2);
    g.fillRect(0, top, 2, b.h);

    // Windows.
    var cw = 11;
    var ch = 15;
    var padX = 8;
    var cols = Math.max(1, Math.floor((b.w - padX * 2) / (cw + 6)));
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

    // Rooftop clutter.
    if (b.w > 90 && rng.chance(0.7)) {
      var tw = rng.range(18, 34);
      var th = rng.range(12, 26);
      var tx = rng.range(6, b.w - tw - 6);
      g.fillStyle = "#0a0f1e";
      g.fillRect(tx, top - th, tw, th);
      g.fillStyle = "rgba(140,180,255,0.14)";
      g.fillRect(tx, top - th, tw, 2);
    }

    // Antenna mast with a blinking-light base.
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
    this.boxes = [];
    this.orbs = [];
    this.startX = 0;
    this.nextX = 0;
    this.id = 0;
    this.lastHighX = 0;
    this.prev = null;
    this.nextBlimpX = 0;
  }

  World.prototype.reset = function (seed) {
    this.rng = new U.Rng(seed);
    this.buildings.length = 0;
    this.props.length = 0;
    this.boxes.length = 0;
    this.orbs.length = 0;
    this.nextX = -400;
    this.startX = 0;
    this.id = 0;
    this.lastHighX = -400;
    this.prev = null;
    this.nextBlimpX = 1800;
    // A guaranteed tall launch pad so every run starts in the air.
    var pad = this._push(300, 620, true);
    this.nextX = pad.x + pad.w + 240;
    this.ensureUpTo(3000);
  };

  // ---------------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------------

  /** Solid rectangle. `hard` boxes stop the player, soft ones only catch webs. */
  World.prototype._box = function (x, y, w, h, hard, prop) {
    var box = { x: x, y: y, w: w, h: h, hard: !!hard, prop: prop || null };
    this.boxes.push(box);
    return box;
  };

  World.prototype._push = function (w, h, isStart, forceMast) {
    var rng = this.rng;
    var b = {
      id: this.id++,
      x: this.nextX,
      w: w,
      h: h,
      top: -h,
      antennaH: 0,
      ax: 0,
    };
    // Masts double as guaranteed high anchor points.
    if (forceMast || (h > 560 ? rng.chance(0.9) : rng.chance(0.6))) {
      b.antennaH = h > 560 ? rng.range(140, 280) : rng.range(90, 210);
      if (forceMast) b.antennaH = Math.max(b.antennaH, HIGH_ANCHOR - h + 40);
    }
    b.ax = b.x + b.w * rng.range(0.25, 0.75);
    b.sprite = buildSprite(b, rng);
    this.buildings.push(b);
    this._box(b.x, b.top, b.w, h, true);
    if (b.antennaH > 0) {
      this._box(b.ax - 7, b.top - b.antennaH, 14, b.antennaH, false);
    }
    if (isStart) this.startX = b.x + b.w * 0.5;
    return b;
  };

  // ---------------------------------------------------------------------------
  // Props: the things worth shooting a web at
  // ---------------------------------------------------------------------------

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
      hookLen: rng.range(60, 170),
    };
    this.props.push(crane);
    this._box(x - 8, jibY, 16, mastH, false, crane); // mast
    this._box(crane.x0, jibY - 5, crane.x1 - crane.x0, 11, true, crane); // jib
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
      // Control point sits at the horizontal midpoint, which keeps x linear in t.
      cy: (y0 + y1) / 2 + rng.range(40, 110),
      lamps: rng.int(2, 4),
    };
    this.props.push(wire);
    return wire;
  };

  World.prototype._blimp = function (x) {
    var rng = this.rng;
    var blimp = {
      type: "blimp",
      x: x,
      y: -rng.range(1180, 1750),
      rx: rng.range(95, 150),
      ry: rng.range(34, 52),
      vx: -rng.range(18, 46) * C.PACE,
      phase: rng.range(0, U.TAU),
    };
    this.props.push(blimp);
    return blimp;
  };

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

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
      var d = U.clamp((this.nextX - this.startX) / 30000, 0, 1);
      var w = rng.range(110, 215);
      var h;
      // Never let the skyline drop for so long that there is nothing to grab.
      var forceHigh = this.nextX - this.lastHighX > 700;
      if (forceHigh || rng.chance(0.2)) h = rng.range(600, 900);
      else h = rng.range(260, 560) - d * 50;

      var b = this._push(w, h, false, forceHigh);
      if (b.h + b.antennaH >= HIGH_ANCHOR) this.lastHighX = b.x + b.w * 0.5;

      // Rooftop rigging.
      if (rng.chance(0.28)) this._crane(b);
      else if (rng.chance(0.3)) this._sign(b);

      // Cables strung across the previous gap give anchors over the void.
      if (this.prev && b.x - (this.prev.x + this.prev.w) > 150 && rng.chance(0.55)) {
        this._wire(this.prev, b);
      }
      this.prev = b;

      if (b.x > this.nextBlimpX) {
        this._blimp(b.x + rng.range(400, 1200));
        this.nextBlimpX = b.x + rng.range(2800, 4800);
      }

      var gap = rng.range(U.lerp(190, 260, d), U.lerp(320, 500, d));
      this._spawnOrbs(b, gap);
      this.nextX += w + gap;
    }
    this.boxes.sort(function (p, q) {
      return p.x - q.x;
    });
  };

  World.prototype.update = function (dt) {
    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (p.type === "blimp") p.x += p.vx * dt;
    }
  };

  World.prototype.prune = function (x) {
    while (this.buildings.length && this.buildings[0].x + this.buildings[0].w < x) {
      this.buildings.shift();
    }
    while (this.boxes.length && this.boxes[0].x + this.boxes[0].w < x) {
      this.boxes.shift();
    }
    while (this.orbs.length && this.orbs[0].x < x) this.orbs.shift();
    for (var i = this.props.length - 1; i >= 0; i--) {
      var p = this.props[i];
      var right =
        p.type === "wire" ? p.x1 : p.type === "blimp" ? p.x + p.rx : p.x1 || p.x + p.w;
      if (right < x) this.props.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Boxes whose horizontal span intersects [x0, x1]. */
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

  /** Anchor-only shapes: cables and airships. Returns the prop or null. */
  World.prototype.softAt = function (x, y) {
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

  /**
   * March a ray until it meets a facade, roof, mast, crane, sign or cable.
   * Returns the anchor point or null when the shot flies into the void.
   */
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
          obj: soft.type === "blimp" ? soft : null,
        };
      }

      var b = this.solidAt(x, y, list);
      if (b) {
        var ax = px;
        var ay = py;
        // A web that lands on a facade slides up to the roof edge and hangs
        // just off the corner, so the swing arc stays outside the wall.
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

  /**
   * Circle versus city. Returns the contact normal and penetration depth so the
   * player can decide between a scrape, a landing and a fatal impact.
   */
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

      // Centre is inside the box: escape through the closest face.
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

  /** Surface directly under the given point, used to keep a runner grounded. */
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

  World.wireY = wireY;
  SW.World = World;
})(window);
