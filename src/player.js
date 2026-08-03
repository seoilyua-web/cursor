(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  function Player() {
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.anchor = { x: 0, y: 0 };
    this.anchorObj = null;
    this.anchorOff = { x: 0, y: 0 };
    this.web = "none"; // none | flying | attached | miss
    this.webT = 0;
    this.webDur = 0.06;
    this.ropeLen = 0;
    this.ropeTarget = 0;
    this.onRoof = false;
    this.onWall = false;
    this.wallNx = 0;
    this.wallTimer = 0;
    this.kickTimer = 0;
    this.kickCd = 0;
    this.dashCd = 0;
    this.dashFx = 0;
    this.stun = 0;
    this.dead = false;
    this.facing = 1;
    this.runPhase = 0;
    this.limbPhase = 0;
    this.swingTime = 0;
    this.airTime = 0;
  }

  Player.prototype.reset = function (x, y) {
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = C.LAUNCH_VX;
    this.vel.y = C.LAUNCH_VY;
    this.web = "none";
    this.webT = 0;
    this.anchorObj = null;
    this.onRoof = false;
    this.onWall = false;
    this.wallTimer = 0;
    this.kickTimer = 0;
    this.kickCd = 0;
    this.dashCd = 0;
    this.dashFx = 0;
    this.stun = 0;
    this.dead = false;
    this.facing = 1;
    this.swingTime = 0;
    this.airTime = 0;
  };

  Player.prototype.attached = function () {
    return this.web === "attached";
  };

  Player.prototype.speed = function () {
    return Math.hypot(this.vel.x, this.vel.y);
  };

  Player.prototype.altitude = function () {
    return C.GROUND_Y - this.pos.y;
  };

  // ---------------------------------------------------------------------------
  // Webs
  // ---------------------------------------------------------------------------

  /**
   * How far below the head a web may still stick. Normally it may not: a rope
   * to something lower does nothing. While falling it is the opposite — a web
   * to a ledge level with you or just under it is the only thing that arrests
   * the drop, so the limit opens up with vertical speed.
   */
  Player.prototype.anchorRise = function () {
    var fall = U.clamp(
      (this.vel.y - 200 * C.PACE) / (700 * C.PACE),
      0,
      1
    );
    return U.lerp(C.MIN_ANCHOR_RISE, -C.FALL_ANCHOR_DROP, fall);
  };

  Player.prototype.probeDir = function (dx, dy, world) {
    var hit = world.raycast(this.pos.x, this.pos.y, dx, dy, C.WEB_RANGE);
    if (!hit || hit.y > this.pos.y - this.anchorRise()) return null;
    return hit;
  };

  Player.prototype.probe = function (tx, ty, world) {
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return null;
    return this.probeDir(dx / d, dy / d, world);
  };

  /**
   * Longest rope this anchor may pay out. The bottom of the arc sits directly
   * below the anchor, so limiting the rope to the clear air under it is what
   * keeps a swing from ending inside the building the web is stuck to.
   */
  Player.prototype.ropeLimit = function (ax, ay, world) {
    var lim = Math.min(C.MAX_ROPE, Math.max(C.MIN_ROPE, -ay - 150));
    if (world && world.clearBelow) {
      var air = world.clearBelow(ax, ay, C.MAX_ROPE + 80) - C.ANCHOR_CLEARANCE;
      lim = Math.min(lim, Math.max(C.MIN_ROPE, air));
    }
    return lim;
  };

  var _arc = [];

  /** How good a swing this anchor buys: longer arcs and reaching the bottom win. */
  Player.prototype.arcScore = function (hit, world) {
    this.predict(hit.x, hit.y, world, _arc, 60);
    var s = _arc.length * 4;
    if (_arc.release) s += 130;
    if (_arc.stop === "ground") s -= 220;
    if (_arc.stop === "land") s += 20;
    return s;
  };

  /**
   * Anchor magnetism. The player aims roughly; the game picks the best anchor
   * within a narrow cone, judged by simulating each candidate swing. Staying
   * close to the original aim is worth points, so intent still wins.
   */
  Player.prototype.aimAssist = function (tx, ty, world) {
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    if (Math.hypot(dx, dy) < 1) return null;
    var base = Math.atan2(dy, dx);
    var span = C.AIM_ASSIST_ARC;
    var best = null;
    var bestScore = -Infinity;
    for (var i = -3; i <= 3; i++) {
      var off = (span / 3) * i;
      var a = base + off;
      var hit = this.probeDir(Math.cos(a), Math.sin(a), world);
      if (!hit) continue;
      var score = this.arcScore(hit, world) - Math.abs(off) * 190;
      if (score > bestScore) {
        bestScore = score;
        best = hit;
      }
    }
    return best;
  };

  Player.prototype.shoot = function (tx, ty, world) {
    if (this.dead || this.stun > 0) return false;
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return false;
    var hit = this.aimAssist(tx, ty, world);
    if (!hit) {
      this.web = "miss";
      this.webT = 0;
      this.missDir = { x: dx / d, y: dy / d };
      return false;
    }
    this.anchor.x = hit.x;
    this.anchor.y = hit.y;
    this.anchorObj = hit.obj || null;
    if (this.anchorObj) {
      this.anchorOff = {
        x: hit.x - this.anchorObj.x,
        y: hit.y - this.anchorObj.y,
      };
    }
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
      var score = (hit.x - this.pos.x) * dir * 0.6 + (this.pos.y - hit.y) * 1.1;
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
      this.anchorObj = null;
    }
  };

  /**
   * Forward-simulate the swing an anchor would produce. Not shown to the player;
   * it is how anchor magnetism compares candidates before the web is fired.
   */
  Player.prototype.predict = function (ax, ay, world, out, maxSteps) {
    out.length = 0;
    var px = this.pos.x;
    var py = this.pos.y;
    var vx = this.vel.x;
    var vy = this.vel.y;
    var rope = U.clamp(
      Math.hypot(this.pos.x - ax, this.pos.y - ay),
      C.MIN_ROPE,
      C.MAX_ROPE
    );
    var ropeTarget = this.ropeLimit(ax, ay, world);
    var dt = 1 / 60;
    var wind = world.weather ? world.weather.wind * C.WIND_MAX : 0;
    var drag = Math.exp(-C.DRAG_ATTACHED * dt);
    out.stop = "time";
    out.release = null;
    var prevVy = vy;
    var releaseAt = -1;
    var steps = maxSteps || 54;
    for (var i = 0; i < steps; i++) {
      if (rope > ropeTarget) rope = Math.max(ropeTarget, rope - C.PULL_SPEED * dt);
      else rope = Math.max(C.MIN_ROPE, rope - C.AUTO_REEL * dt);
      vy += C.GRAVITY * dt;
      vx += wind * dt;
      vx *= drag;
      vy *= drag;
      px += vx * dt;
      py += vy * dt;

      var dx = px - ax;
      var dy = py - ay;
      var d = Math.hypot(dx, dy) || 1e-6;
      if (d > rope) {
        var nx = dx / d;
        var ny = dy / d;
        px = ax + nx * rope;
        py = ay + ny * rope;
        var vn = vx * nx + vy * ny;
        if (vn > 0) {
          vx -= nx * vn;
          vy -= ny * vn;
        }
      }
      // Bottom of the arc: the moment worth letting go, marked for the player.
      if (!out.release && i > 4 && prevVy > 0 && vy <= 0) {
        out.release = { x: px, y: py };
        releaseAt = i;
      }
      prevVy = vy;
      if (i % 2 === 0) out.push({ x: px, y: py });
      // Past the bottom of the arc there is nothing left to judge: the player
      // is meant to have let go by then.
      if (releaseAt >= 0 && i > releaseAt + 8) break;
      if (py > C.GROUND_Y - C.PLAYER_R) {
        out.stop = "ground";
        break;
      }
      // The first frames are skipped: standing on a roof or hugging a wall
      // counts as a contact and would end the simulation instantly.
      if (i > 8) {
        var c = world.collide(px, py, C.PLAYER_R);
        if (c) {
          // Landing on a roof is a fine way to end a swing; a facade is not.
          out.stop = c.ny < -0.6 ? "land" : "wall";
          break;
        }
      }
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Wall work and the rescue dash
  // ---------------------------------------------------------------------------

  Player.prototype.canKick = function () {
    return (
      !this.dead && !this.onRoof && this.kickTimer > 0 && this.kickCd <= 0
    );
  };

  Player.prototype.canDash = function () {
    return !this.dead && this.stun <= 0 && this.dashCd <= 0;
  };

  Player.prototype._launch = function (ux, uy, power, game) {
    var d = Math.hypot(ux, uy) || 1;
    this.vel.x = (ux / d) * power;
    this.vel.y = (uy / d) * power;
    this.release();
    this.onWall = false;
    this.wallTimer = 0;
    this.kickTimer = 0;
    this.kickCd = C.KICK_COOLDOWN;
    if (game) {
      game.onKick(
        this.pos.x - this.wallNx * C.PLAYER_R,
        this.pos.y,
        this.wallNx,
        power
      );
    }
  };

  Player.prototype.wallKick = function (input, game) {
    var nx = this.wallNx;
    var ux = nx;
    var uy = -1;
    if (input.moveX * nx > 0) {
      ux = nx * 1.35;
      uy = -0.66;
    } else if (input.moveX * nx < 0) {
      ux = nx * 0.34;
      uy = -1.3;
    }
    var carry = this.vel.y < 0 ? -this.vel.y * 0.3 : 0;
    this._launch(ux, uy, C.KICK_POWER + carry, game);
    input.jump = false;
  };

  Player.prototype.kickToward = function (tx, ty, game) {
    var ux = tx - this.pos.x;
    var uy = ty - this.pos.y;
    var d = Math.hypot(ux, uy) || 1;
    ux /= d;
    uy /= d;
    if (ux * this.wallNx < 0) ux = -ux;
    if (uy > 0.3) uy = 0.3;
    if (Math.abs(ux) < 0.25) ux = this.wallNx * 0.25;
    this._launch(ux, uy, C.KICK_POWER, game);
  };

  /** One-shot burst of speed towards the aim; the way out of a doomed fall. */
  Player.prototype.dash = function (tx, ty, game) {
    if (!this.canDash()) return false;
    var ux = tx - this.pos.x;
    var uy = ty - this.pos.y;
    var d = Math.hypot(ux, uy);
    if (d < 1) {
      ux = this.facing;
      uy = -0.5;
      d = Math.hypot(ux, uy);
    }
    var power = Math.max(C.DASH_POWER, this.speed());
    this.vel.x = (ux / d) * power;
    this.vel.y = (uy / d) * power;
    this.release();
    this.onWall = false;
    this.onRoof = false;
    this.dashCd = C.DASH_COOLDOWN;
    this.dashFx = 0.32;
    if (game) game.onDash(this.pos.x, this.pos.y, ux / d, uy / d);
    return true;
  };

  /** Knocked out of the air by a helicopter, drone or swinging load. */
  Player.prototype.hit = function (hz, game) {
    if (this.stun > 0 || this.dead) return false;
    var dx = this.pos.x - hz.x;
    var dy = this.pos.y - hz.y;
    var d = Math.hypot(dx, dy) || 1;
    this.release();
    this.onWall = false;
    this.onRoof = false;
    this.vel.x = (dx / d) * C.HIT_KNOCKBACK * 0.7;
    this.vel.y = Math.max((dy / d) * C.HIT_KNOCKBACK, 120 * C.PACE);
    this.stun = C.STUN_TIME;
    if (game) game.onHazardHit(hz);
    return true;
  };

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

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

    this.dashCd -= dt;
    this.dashFx = Math.max(0, this.dashFx - dt);
    this.stun -= dt;
    var stunned = this.stun > 0;

    if (this.anchorObj) {
      this.anchor.x = this.anchorObj.x + this.anchorOff.x;
      this.anchor.y = this.anchorObj.y + this.anchorOff.y;
    }

    if (this.web === "flying") {
      this.webT += dt / this.webDur;
      if (this.webT >= 1) {
        this.web = "attached";
        this.webT = 1;
        this.ropeLen = U.clamp(
          Math.hypot(this.pos.x - this.anchor.x, this.pos.y - this.anchor.y),
          C.MIN_ROPE,
          C.MAX_ROPE
        );
        this.ropeTarget = this.ropeLimit(this.anchor.x, this.anchor.y, world);
        this.swingTime = 0;
        if (game) game.onAttach();
      }
    } else if (this.web === "miss") {
      this.webT += dt / 0.18;
      if (this.webT >= 1) this.web = "none";
    }

    var attached = this.web === "attached";

    if (this.onRoof && !world.roofUnder(this.pos.x, this.pos.y, C.PLAYER_R)) {
      this.onRoof = false;
    }
    this.wallTimer -= dt;
    this.kickTimer -= dt;
    this.kickCd -= dt;
    this.onWall = this.wallTimer > 0 && !attached && !this.onRoof;

    if (input.jump && !stunned && this.canKick()) {
      this.wallKick(input, game);
      attached = false;
    }

    var moveX = stunned ? 0 : input.moveX;
    var reel = stunned ? 0 : input.reel;

    this.vel.y += C.GRAVITY * dt;

    var weather = world.weather || { wind: 0, rain: 0 };
    if (!this.onRoof && !this.onWall) {
      this.vel.x += weather.wind * C.WIND_MAX * dt;
    }

    if (this.onRoof) {
      if (moveX !== 0) {
        this.vel.x += moveX * C.RUN_ACCEL * dt;
        this.vel.x = U.clamp(this.vel.x, -C.RUN_MAX * 2, C.RUN_MAX * 2);
      } else {
        this.vel.x = U.damp(this.vel.x, 0, 3.2, dt);
      }
      if (this.vel.y > 0) this.vel.y = 0;
      if (input.jump && !stunned) {
        this.vel.y = -C.JUMP_VELOCITY;
        this.onRoof = false;
        input.jump = false;
        if (game) game.onJump();
      }
      this.runPhase += Math.abs(this.vel.x) * dt * 0.045;
      this.airTime = 0;
    } else if (attached) {
      this.swingTime += dt;
      this.airTime += dt;
      var rx = this.pos.x - this.anchor.x;
      var ry = this.pos.y - this.anchor.y;
      var rl = Math.hypot(rx, ry) || 1e-6;
      var nx = rx / rl;
      var ny = ry / rl;
      var tx = -ny;
      var ty = nx;
      if (moveX !== 0) {
        var proj = moveX * C.SWING_ACCEL * tx;
        this.vel.x += tx * proj * dt;
        this.vel.y += ty * proj * dt;
      }
      // Excess line is pulled in fast rather than snapped away, then the web
      // keeps reeling gently so the arc rises over the roofline.
      if (this.ropeLen > this.ropeTarget) {
        this.ropeLen = Math.max(
          this.ropeTarget,
          this.ropeLen - C.PULL_SPEED * dt
        );
      } else {
        this.ropeLen = Math.max(C.MIN_ROPE, this.ropeLen - C.AUTO_REEL * dt);
      }
      if (reel !== 0) {
        this.ropeLen = U.clamp(
          this.ropeLen - reel * C.REEL_SPEED * dt,
          C.MIN_ROPE,
          C.MAX_ROPE
        );
      }
    } else if (this.onWall) {
      // Spider grip: keep leaning into the facade, otherwise zeroing the
      // horizontal speed would break contact and drop the hero next frame.
      this.vel.x = -this.wallNx * 25;
      var slide = C.WALL_SLIDE * (1 + weather.rain * 1.6);
      if (reel > 0) this.vel.y = -C.WALL_CLIMB;
      else if (reel < 0) this.vel.y = C.WALL_CLIMB;
      else this.vel.y = Math.min(this.vel.y, slide);
      this.airTime = 0;
    } else {
      this.vel.x += moveX * C.AIR_ACCEL * dt;
      this.airTime += dt;
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

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

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

    if (Math.abs(this.vel.x) > 40 * C.PACE) this.facing = this.vel.x > 0 ? 1 : -1;
    this.limbPhase += dt * 6;

    if (this.pos.y + C.PLAYER_R >= C.GROUND_Y) {
      this.pos.y = C.GROUND_Y - C.PLAYER_R;
      if (game) game.kill("ground");
      return;
    }

    var hit = world.collide(this.pos.x, this.pos.y, C.PLAYER_R);
    if (hit) {
      this.pos.x += hit.nx * hit.depth;
      this.pos.y += hit.ny * hit.depth;
      var hvn = this.vel.x * hit.nx + this.vel.y * hit.ny;
      var impact = -hvn;
      var onRoofFace = hit.ny < -0.6;

      if (hvn < 0) {
        this.vel.x -= hit.nx * hvn;
        this.vel.y -= hit.ny * hvn;
      }

      if (onRoofFace) {
        var wasFlying = !this.onRoof;
        this.vel.y = 0;
        this.onRoof = true;
        this.release();
        if (wasFlying && game) game.onLand(impact);
      } else {
        var bleed = impact > C.FATAL_IMPACT ? 0.55 : 0.9;
        this.vel.x *= bleed;
        this.vel.y *= bleed;
        this.onWall = true;
        this.wallNx = hit.nx;
        this.wallTimer = C.WALL_GRIP;
        this.kickTimer = C.KICK_COYOTE;
        if (game && impact > 120 * C.PACE) {
          game.onScrape(this.pos.x, this.pos.y, impact);
        }
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
      ang = U.clamp(this.vel.x / (1600 * C.PACE), -0.6, 0.6);
    }
    if (this.stun > 0) ang += Math.sin(this.stun * 40) * 0.5;

    var face = this.onWall ? -this.wallNx || 1 : this.facing;

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(ang);
    ctx.scale(face, 1);

    var swing = Math.sin(this.limbPhase);
    var run = this.onRoof ? Math.sin(this.runPhase) : 0;
    var free = !this.onRoof && !this.onWall && this.web !== "attached";
    var tuck = free ? U.clamp(this.vel.y / (900 * C.PACE), -1, 1) : 0;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

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

    ctx.strokeStyle = SUIT;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();

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
