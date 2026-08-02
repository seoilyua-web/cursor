(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  function Player() {
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.anchor = { x: 0, y: 0 };
    this.web = "none"; // none | flying | attached | miss
    this.webT = 0;
    this.webDur = 0.06;
    this.ropeLen = 0;
    this.onRoof = false;
    this.onWall = false;
    this.wallNx = 0;
    this.wallTimer = 0;
    this.dead = false;
    this.facing = 1;
    this.runPhase = 0;
    this.limbPhase = 0;
    this.swingTime = 0;
  }

  Player.prototype.reset = function (x, y) {
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = 620;
    this.vel.y = -320;
    this.web = "none";
    this.webT = 0;
    this.onRoof = false;
    this.onWall = false;
    this.wallTimer = 0;
    this.dead = false;
    this.facing = 1;
    this.swingTime = 0;
  };

  Player.prototype.attached = function () {
    return this.web === "attached";
  };

  Player.prototype.speed = function () {
    return Math.hypot(this.vel.x, this.vel.y);
  };

  /** Anchor the shot would find, or null. Webs only stick above the head. */
  Player.prototype.probeDir = function (dx, dy, world) {
    var hit = world.raycast(this.pos.x, this.pos.y, dx, dy, C.WEB_RANGE);
    if (!hit || hit.y > this.pos.y - C.MIN_ANCHOR_RISE) return null;
    return hit;
  };

  Player.prototype.probe = function (tx, ty, world) {
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return null;
    return this.probeDir(dx / d, dy / d, world);
  };

  /** Fire a web towards a world-space point. Returns true when it sticks. */
  Player.prototype.shoot = function (tx, ty, world) {
    if (this.dead) return false;
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return false;
    var hit = this.probeDir(dx / d, dy / d, world);
    if (!hit) {
      this.web = "miss";
      this.webT = 0;
      this.missDir = { x: dx / d, y: dy / d };
      return false;
    }
    this.anchor.x = hit.x;
    this.anchor.y = hit.y;
    this.web = "flying";
    this.webT = 0;
    this.webDur = Math.max(0.03, hit.dist / C.WEB_SPEED);
    return true;
  };

  /** Sweep forward-and-up for the best anchor; used by the keyboard shortcut. */
  Player.prototype.autoShoot = function (world) {
    var best = null;
    var bestScore = -Infinity;
    var dir = this.vel.x >= 0 ? 1 : -1;
    for (var deg = 12; deg <= 88; deg += 5) {
      var a = (-deg * Math.PI) / 180;
      var dx = Math.cos(a) * dir;
      var dy = Math.sin(a);
      var hit = this.probeDir(dx, dy, world);
      if (!hit) continue;
      var score =
        (hit.x - this.pos.x) * dir * 0.6 + (this.pos.y - hit.y) * 1.1;
      if (score > bestScore) {
        bestScore = score;
        best = hit;
      }
    }
    if (!best) {
      this.web = "miss";
      this.webT = 0;
      this.missDir = { x: dir, y: -0.9 };
      return false;
    }
    return this.shoot(best.x, best.y, world);
  };

  Player.prototype.release = function () {
    if (this.web === "attached" || this.web === "flying") {
      this.web = "none";
      this.webT = 0;
    }
  };

  Player.prototype._wallKick = function (input, game) {
    this.vel.x = this.wallNx * C.WALL_JUMP_X;
    this.vel.y = -C.WALL_JUMP_Y;
    this.onWall = false;
    this.wallTimer = 0;
    input.jump = false;
    if (game) game.onJump();
  };

  Player.prototype.update = function (dt, input, world, game) {
    if (this.dead) {
      this.vel.y += C.GRAVITY * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y > C.GROUND_Y - C.PLAYER_R) {
        this.pos.y = C.GROUND_Y - C.PLAYER_R;
        this.vel.x *= 0.82;
        this.vel.y *= -0.24;
      }
      return;
    }

    // --- web state machine -------------------------------------------------
    if (this.web === "flying") {
      this.webT += dt / this.webDur;
      if (this.webT >= 1) {
        this.web = "attached";
        this.webT = 1;
        // Cap the rope so the bottom of the arc never dips into the street.
        var safeLen = Math.max(C.MIN_ROPE, -this.anchor.y - 150);
        this.ropeLen = U.clamp(
          Math.hypot(this.pos.x - this.anchor.x, this.pos.y - this.anchor.y),
          C.MIN_ROPE,
          Math.min(C.MAX_ROPE, safeLen)
        );
        this.swingTime = 0;
        if (game) game.onAttach();
      }
    } else if (this.web === "miss") {
      this.webT += dt / 0.18;
      if (this.webT >= 1) this.web = "none";
    }

    var attached = this.web === "attached";

    // --- surface contact memory --------------------------------------------
    if (this.onRoof && !world.roofUnder(this.pos.x, this.pos.y, C.PLAYER_R)) {
      this.onRoof = false;
    }
    this.wallTimer -= dt;
    var touchingWall = this.wallTimer > 0;
    // Clinging is the free-fall behaviour; the kick off a wall works always.
    this.onWall = touchingWall && !attached && !this.onRoof;

    // --- forces ------------------------------------------------------------
    this.vel.y += C.GRAVITY * dt;

    if (this.onRoof) {
      if (input.moveX !== 0) {
        this.vel.x += input.moveX * C.RUN_ACCEL * dt;
        this.vel.x = U.clamp(this.vel.x, -C.RUN_MAX * 2, C.RUN_MAX * 2);
      } else {
        this.vel.x = U.damp(this.vel.x, 0, 3.2, dt);
      }
      if (this.vel.y > 0) this.vel.y = 0;
      if (input.jump) {
        this.vel.y = -C.JUMP_VELOCITY;
        this.onRoof = false;
        input.jump = false;
        if (game) game.onJump();
      }
      this.runPhase += Math.abs(this.vel.x) * dt * 0.045;
    } else if (attached) {
      if (input.jump && touchingWall) {
        this.release();
        this._wallKick(input, game);
        attached = false;
      }
      this.swingTime += dt;
      // Pumping: push along the tangent of the pendulum arc.
      var rx = this.pos.x - this.anchor.x;
      var ry = this.pos.y - this.anchor.y;
      var rl = Math.hypot(rx, ry) || 1e-6;
      var nx = rx / rl;
      var ny = ry / rl;
      var tx = -ny;
      var ty = nx;
      if (input.moveX !== 0) {
        var proj = input.moveX * C.SWING_ACCEL * tx;
        this.vel.x += tx * proj * dt;
        this.vel.y += ty * proj * dt;
      }
      if (input.reel !== 0) {
        this.ropeLen = U.clamp(
          this.ropeLen - input.reel * C.REEL_SPEED * dt,
          C.MIN_ROPE,
          C.MAX_ROPE
        );
      }
    } else if (this.onWall) {
      // Spider grip: cling, crawl, and kick off.
      this.vel.x = 0;
      if (input.reel > 0) this.vel.y = -C.WALL_CLIMB;
      else if (input.reel < 0) this.vel.y = C.WALL_CLIMB;
      else this.vel.y = Math.min(this.vel.y, C.WALL_SLIDE);
      if (input.jump) this._wallKick(input, game);
    } else {
      this.vel.x += input.moveX * C.AIR_ACCEL * dt;
    }

    var drag = attached ? C.DRAG_ATTACHED : C.DRAG_FREE;
    var f = Math.exp(-drag * dt);
    this.vel.x *= f;
    this.vel.y *= f;

    var sp = this.speed();
    if (sp > C.MAX_SPEED) {
      var k = C.MAX_SPEED / sp;
      this.vel.x *= k;
      this.vel.y *= k;
    }

    // --- integrate ---------------------------------------------------------
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // --- rope as a maximum-distance constraint -----------------------------
    if (attached) {
      var dx = this.pos.x - this.anchor.x;
      var dy = this.pos.y - this.anchor.y;
      var d = Math.hypot(dx, dy) || 1e-6;
      if (d > this.ropeLen) {
        var ux = dx / d;
        var uy = dy / d;
        this.pos.x = this.anchor.x + ux * this.ropeLen;
        this.pos.y = this.anchor.y + uy * this.ropeLen;
        var vn = this.vel.x * ux + this.vel.y * uy;
        if (vn > 0) {
          this.vel.x -= ux * vn;
          this.vel.y -= uy * vn;
        }
      }
    }

    if (Math.abs(this.vel.x) > 40) this.facing = this.vel.x > 0 ? 1 : -1;
    this.limbPhase += dt * 6;

    // --- collisions --------------------------------------------------------
    if (this.pos.y + C.PLAYER_R >= C.GROUND_Y) {
      this.pos.y = C.GROUND_Y - C.PLAYER_R;
      if (game) game.kill("ground");
      return;
    }

    var hit = world.collide(this.pos.x, this.pos.y, C.PLAYER_R);
    if (hit) {
      this.pos.x += hit.nx * hit.depth;
      this.pos.y += hit.ny * hit.depth;
      var vn = this.vel.x * hit.nx + this.vel.y * hit.ny;
      var impact = -vn;
      var onRoofFace = hit.ny < -0.6;

      if (vn < 0) {
        this.vel.x -= hit.nx * vn;
        this.vel.y -= hit.ny * vn;
      }

      if (onRoofFace) {
        var wasFlying = !this.onRoof;
        this.vel.y = 0;
        this.onRoof = true;
        this.release();
        if (wasFlying && game) game.onLand(impact);
      } else {
        // A facade never kills, it just eats the momentum you worked for.
        var bleed = impact > C.FATAL_IMPACT ? 0.55 : 0.9;
        this.vel.x *= bleed;
        this.vel.y *= bleed;
        this.onWall = true;
        this.wallNx = hit.nx;
        this.wallTimer = 0.12;
        if (game && impact > 120) game.onScrape(this.pos.x, this.pos.y, impact);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  var SUIT = "#d92448";
  var SUIT_DARK = "#8e0f2c";
  var CLOTH = "#1d2a72";
  var EYE = "#eef4ff";

  Player.prototype.handPos = function (out) {
    // Web leaves the hand, not the belly button.
    var ux = 0;
    var uy = -1;
    if (this.web === "attached" || this.web === "flying") {
      var dx = this.anchor.x - this.pos.x;
      var dy = this.anchor.y - this.pos.y;
      var d = Math.hypot(dx, dy) || 1;
      ux = dx / d;
      uy = dy / d;
    } else if (this.missDir) {
      ux = this.missDir.x;
      uy = this.missDir.y;
    }
    out.x = this.pos.x + ux * 10;
    out.y = this.pos.y + uy * 10;
    return out;
  };

  Player.prototype.draw = function (ctx) {
    var ang;
    if (this.web === "attached") {
      ang =
        Math.atan2(this.anchor.y - this.pos.y, this.anchor.x - this.pos.x) +
        Math.PI / 2;
    } else if (this.onRoof) {
      ang = 0;
    } else if (this.onWall) {
      ang = this.wallNx * 0.32;
    } else {
      ang = U.clamp(this.vel.x / 1600, -0.6, 0.6);
    }

    var face = this.onWall ? -this.wallNx || 1 : this.facing;

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(ang);
    ctx.scale(face, 1);

    var swing = Math.sin(this.limbPhase);
    var run = this.onRoof ? Math.sin(this.runPhase) : 0;
    var free = !this.onRoof && !this.onWall && this.web !== "attached";
    var tuck = free ? U.clamp(this.vel.y / 900, -1, 1) : 0;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Legs.
    ctx.strokeStyle = CLOTH;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (this.onRoof) {
      ctx.moveTo(0, 4);
      ctx.lineTo(run * 9, 16);
      ctx.moveTo(0, 4);
      ctx.lineTo(-run * 9, 16);
    } else if (this.web === "attached") {
      ctx.moveTo(0, 4);
      ctx.lineTo(6 + swing * 3, 18);
      ctx.moveTo(0, 4);
      ctx.lineTo(-4 + swing * 4, 17);
    } else if (this.onWall) {
      ctx.moveTo(0, 4);
      ctx.lineTo(-9, 13);
      ctx.moveTo(0, 4);
      ctx.lineTo(-2, 16);
    } else {
      ctx.moveTo(0, 4);
      ctx.lineTo(9 - tuck * 4, 13 + tuck * 3);
      ctx.moveTo(0, 4);
      ctx.lineTo(-7, 15 - tuck * 4);
    }
    ctx.stroke();

    // Torso.
    ctx.strokeStyle = SUIT;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();

    // Arms: the leading one reaches for the anchor (local "up").
    ctx.strokeStyle = SUIT_DARK;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    if (this.web === "attached" || this.web === "flying") {
      ctx.moveTo(0, -4);
      ctx.lineTo(2, -18);
      ctx.moveTo(0, -4);
      ctx.lineTo(-9 - swing * 3, 3 + swing * 2);
    } else if (this.onRoof) {
      ctx.moveTo(0, -4);
      ctx.lineTo(-run * 8, 4);
      ctx.moveTo(0, -4);
      ctx.lineTo(run * 8, 4);
    } else if (this.onWall) {
      ctx.moveTo(0, -4);
      ctx.lineTo(-11, -10);
      ctx.moveTo(0, -4);
      ctx.lineTo(-8, 3);
    } else {
      ctx.moveTo(0, -4);
      ctx.lineTo(12, -6 + tuck * 5);
      ctx.moveTo(0, -4);
      ctx.lineTo(-11, -2 - tuck * 4);
    }
    ctx.stroke();

    // Head.
    ctx.fillStyle = SUIT;
    ctx.beginPath();
    ctx.arc(0, -12, 7, 0, U.TAU);
    ctx.fill();

    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.ellipse(3.4, -13, 3.4, 2.3, -0.25, 0, U.TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2.6, -13.4, 2.4, 1.8, 0.25, 0, U.TAU);
    ctx.fill();

    ctx.restore();
  };

  SW.Player = Player;
})(window);
