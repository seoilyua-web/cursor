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
    this.bottomAt = -1;
    this.releasePerfect = false;
    this.tether = null;
    this.carrying = false;
    this.webAmmo = C.WEB_START;
    this.pose = { arm: 0, leg: 0, lean: 0, reach: 0 };
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
    this.bottomAt = -1;
    this.releasePerfect = false;
    this.tether = null;
    this.carrying = false;
    this.webAmmo = C.WEB_START;
    this.pose = { arm: 0, leg: 0, lean: 0, reach: 0 };
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

  /** Pizza is what the web is spun from, so every line costs a portion. */
  Player.prototype.hasWeb = function (cost) {
    return this.webAmmo >= (cost || 1);
  };

  Player.prototype.spendWeb = function (cost) {
    this.webAmmo = Math.max(0, this.webAmmo - (cost || 1));
  };

  Player.prototype.addWeb = function (amount) {
    var before = this.webAmmo;
    this.webAmmo = Math.min(C.WEB_MAX, this.webAmmo + amount);
    return this.webAmmo - before;
  };

  Player.prototype.shoot = function (tx, ty, world) {
    // A net pins the arms: no webs until it is torn off.
    if (this.dead || this.stun > 0 || this.tether) return false;
    if (!this.hasWeb(C.WEB_COST_SWING)) return false;
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
    this.spendWeb(C.WEB_COST_SWING);
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

  /**
   * Letting go at the bottom of the arc is the whole skill of the game, so the
   * release records how close it was and hands the player back some speed.
   */
  Player.prototype.release = function () {
    this.releasePerfect = false;
    if (this.web === "attached") {
      if (this.bottomAt >= 0) {
        var off = Math.abs(this.swingTime - this.bottomAt);
        if (off < C.PERFECT_WINDOW) {
          this.releasePerfect = true;
          this.vel.x *= C.PERFECT_BOOST;
          this.vel.y *= C.PERFECT_BOOST;
        }
      }
      this.bottomAt = -1;
    }
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
    this.breakTether(game);
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
    var load = this.carrying ? 1 - 0.18 * C.CARGO_MASS * 2 : 1;
    this._launch(ux, uy, (C.KICK_POWER + carry) * load, game);
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

  /** Caught in a net: dragged towards the thrower until the hero breaks free. */
  Player.prototype.snare = function (source, game) {
    if (this.dead) return false;
    this.release();
    this.tether = { x: source.x, y: source.y, obj: source.obj || null, t: C.TETHER_TIME };
    if (game) game.onSnared(this);
    return true;
  };

  Player.prototype.breakTether = function (game) {
    if (!this.tether) return false;
    this.tether = null;
    if (game) game.onTetherBreak(this);
    return true;
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
    var power =
      Math.max(C.DASH_POWER, this.speed()) * (this.carrying ? 0.9 : 1);
    this.vel.x = (ux / d) * power;
    this.vel.y = (uy / d) * power;
    this.release();
    this.breakTether(game);
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
      if (this.anchorObj.removed) this.release();
      else {
        this.anchor.x = this.anchorObj.x + this.anchorOff.x;
        this.anchor.y = this.anchorObj.y + this.anchorOff.y;
      }
    }

    if (this.tether) {
      var tobj = this.tether.obj;
      if (tobj) {
        if (tobj.removed || tobj.state !== "alive") this.breakTether(game);
        else {
          this.tether.x = tobj.x;
          this.tether.y = tobj.y;
        }
      }
      if (this.tether) {
        this.tether.t -= dt;
        if (this.tether.t <= 0) this.breakTether(game);
      }
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

    // Gravity does not care about the load, but the servos do: carrying a
    // parcel costs control authority, not weightlessness.
    var mass = 1 + (this.carrying ? C.CARGO_MASS : 0);
    var authority = 1 / mass;

    this.vel.y += C.GRAVITY * dt;

    var weather = world.weather || { wind: 0, rain: 0 };
    if (!this.onRoof && !this.onWall) {
      this.vel.x += weather.wind * C.WIND_MAX * dt;
    }

    if (this.tether) {
      var tdx = this.tether.x - this.pos.x;
      var tdy = this.tether.y - this.pos.y;
      var td = Math.hypot(tdx, tdy) || 1;
      this.vel.x += (tdx / td) * C.TETHER_PULL * dt;
      this.vel.y += (tdy / td) * C.TETHER_PULL * dt * 0.4 + C.TETHER_PULL * dt * 0.5;
    }

    if (this.onRoof) {
      if (moveX !== 0) {
        this.vel.x += moveX * C.RUN_ACCEL * authority * dt;
        this.vel.x = U.clamp(this.vel.x, -C.RUN_MAX * 2, C.RUN_MAX * 2);
      } else {
        this.vel.x = U.damp(this.vel.x, 0, 3.2, dt);
      }
      if (this.vel.y > 0) this.vel.y = 0;
      if (input.jump && !stunned) {
        this.vel.y = -C.JUMP_VELOCITY * (1 - 0.16 * (mass - 1));
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
        var proj = moveX * C.SWING_ACCEL * authority * tx;
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
      if (input.zip) {
        // Zip: haul yourself up the line instead of waiting for the swing.
        this.ropeLen = Math.max(C.MIN_ROPE, this.ropeLen - C.ZIP_SPEED * dt);
        this.vel.x -= nx * C.ZIP_ACCEL * dt;
        this.vel.y -= ny * C.ZIP_ACCEL * dt;
      } else if (reel !== 0) {
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
      this.vel.x += moveX * C.AIR_ACCEL * authority * dt;
      this.airTime += dt;
    }

    var drag = (attached ? C.DRAG_ATTACHED : C.DRAG_FREE) * (2 - mass);
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

    if (attached) {
      // Bottom of the arc: vertical speed flips sign, and it flips inside the
      // rope constraint above, not from gravity, so it is checked after it.
      if (
        this.bottomAt < 0 &&
        this.swingTime > 0.08 &&
        this._lastVy > 0 &&
        this.vel.y <= 0
      ) {
        this.bottomAt = this.swingTime;
      }
      this._lastVy = this.vel.y;
    } else {
      this._lastVy = 0;
    }

    if (Math.abs(this.vel.x) > 40 * C.PACE) this.facing = this.vel.x > 0 ? 1 : -1;
    this.limbPhase += dt * 6;

    // Servos have inertia: the pose eases towards its target instead of
    // snapping between states.
    var wantReach = this.web === "attached" || this.web === "flying" ? 1 : 0;
    var wantLeg = this.onRoof ? 1 : this.onWall ? 0.4 : 0;
    var wantArm = this.onWall ? 1 : attached ? 0.6 : 0;
    this.pose.reach = U.damp(this.pose.reach, wantReach, 14, dt);
    this.pose.leg = U.damp(this.pose.leg, wantLeg, 12, dt);
    this.pose.arm = U.damp(this.pose.arm, wantArm, 12, dt);
    this.pose.lean = U.damp(
      this.pose.lean,
      U.clamp(this.vel.x / (900 * C.PACE), -1, 1),
      6,
      dt
    );

    if (this.pos.y + C.PLAYER_R >= C.GROUND_Y) {
      this.pos.y = C.GROUND_Y - C.PLAYER_R;
      if (game) game.kill("ground");
      return;
    }

    var hit = world.collidePlayer(this.pos.x, this.pos.y, C.PLAYER_R);
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
        // Only a mostly vertical surface can be clung to. Ceilings — the
        // underside of a sky bridge or a setback — just cost speed, otherwise
        // the push-off would fire straight into them.
        if (Math.abs(hit.nx) > 0.5) {
          this.onWall = true;
          this.wallNx = hit.nx > 0 ? 1 : -1;
          this.wallTimer = C.WALL_GRIP;
          this.kickTimer = C.KICK_COYOTE;
        }
        if (game && impact > 120 * C.PACE) {
          game.onScrape(this.pos.x, this.pos.y, impact);
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  var TUNIC = "#2d5a42";
  var TUNIC_DARK = "#1a3828";
  var LEATHER = "#6b4423";
  var LEATHER_DARK = "#4a2f18";
  var SKIN = "#c9956a";
  var CLOAK = "#1a2438";
  var BOW_WOOD = "#8b5a2b";
  var BOW_STRING = "#d8d0c0";

  function drawBow(ctx, cx, cy, angle, pull) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.strokeStyle = BOW_WOOD;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, 13, -0.85, 0.85);
    ctx.stroke();
    var notch = pull * 7;
    ctx.strokeStyle = BOW_STRING;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(Math.sin(-0.85) * 13, -Math.cos(-0.85) * 13);
    ctx.lineTo(-notch, 0);
    ctx.lineTo(Math.sin(0.85) * 13, -Math.cos(0.85) * 13);
    ctx.stroke();
    if (pull > 0.15) {
      ctx.strokeStyle = "#b8b0a0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-notch - 2, 0);
      ctx.lineTo(-notch - 14, 0);
      ctx.stroke();
      ctx.fillStyle = "#8a9098";
      ctx.beginPath();
      ctx.moveTo(-notch - 14, 0);
      ctx.lineTo(-notch - 19, -2.2);
      ctx.lineTo(-notch - 19, 2.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

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
    out.x = this.pos.x + ux * 14;
    out.y = this.pos.y + uy * 14;
    return out;
  };

  /** Status light: quiver running low, stun, cargo. */
  Player.prototype.statusColor = function () {
    if (this.stun > 0) return "#ff5a5a";
    if (this.webAmmo <= 4) return "#ff8a5a";
    if (this.carrying) return "#8ff0ff";
    return "#7dffcb";
  };

  function limb(ctx, x0, y0, x1, y1, x2, y2, width, color, joint) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = joint;
    ctx.beginPath();
    ctx.arc(x1, y1, width * 0.42, 0, U.TAU);
    ctx.fill();
  }

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
      ang = U.clamp(this.pose.lean * 0.6, -0.6, 0.6);
    }
    if (this.stun > 0) ang += Math.sin(this.stun * 40) * 0.5;

    var face = this.onWall ? -this.wallNx || 1 : this.facing;
    var swing = Math.sin(this.limbPhase);
    var run = this.onRoof ? Math.sin(this.runPhase) : 0;
    var reach = this.pose.reach;
    var status = this.statusColor();
    var lit = this.stun > 0 ? (Math.sin(this.stun * 50) > 0 ? 1 : 0.2) : 1;
    var bowAngle =
      this.web === "attached" || this.web === "flying"
        ? Math.atan2(this.anchor.y - this.pos.y, this.anchor.x - this.pos.x)
        : this.facing > 0
        ? -0.55
        : -2.6;

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(ang);
    ctx.scale(face, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // --- quiver on the back -------------------------------------------------
    ctx.fillStyle = LEATHER_DARK;
    ctx.fillRect(-15, -6, 9, 18);
    ctx.strokeStyle = LEATHER;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-15, -6, 9, 18);
    for (var qi = 0; qi < 3; qi++) {
      ctx.strokeStyle = "#9aa0aa";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-13 + qi * 2.5, -4);
      ctx.lineTo(-11 + qi * 2.5, -16 - qi);
      ctx.stroke();
    }
    ctx.fillStyle = status;
    ctx.globalAlpha = lit * 0.85;
    ctx.beginPath();
    ctx.arc(-10.5, -17, 1.6, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (this.carrying) {
      ctx.fillStyle = "rgba(120,240,255,0.9)";
      ctx.fillRect(-13.5, -10, 7, 5);
    }

    // --- legs / boots -------------------------------------------------------
    var legSpread = U.lerp(6, 9, this.pose.leg);
    if (this.onRoof) {
      limb(ctx, -1, 5, run * 5, 11, run * 9, 17, 4.2, TUNIC_DARK, LEATHER);
      limb(ctx, 1, 5, -run * 5, 11, -run * 9, 17, 4.2, TUNIC_DARK, LEATHER);
    } else if (this.onWall) {
      limb(ctx, -1, 5, -5, 10, -9, 14, 4.2, TUNIC_DARK, LEATHER);
      limb(ctx, 1, 5, -2, 11, -2, 17, 4.2, TUNIC_DARK, LEATHER);
    } else {
      limb(ctx, -1, 5, 4 + swing, 11, legSpread + swing * 2, 16, 4.2, TUNIC_DARK, LEATHER);
      limb(ctx, 1, 5, -4, 11, -legSpread + swing, 15, 4.2, TUNIC_DARK, LEATHER);
    }
    ctx.fillStyle = LEATHER_DARK;
    ctx.fillRect(-6.5, 14, 5.5, 3.5);
    ctx.fillRect(1.5, 14, 5.5, 3.5);

    // --- cloak + tunic ------------------------------------------------------
    ctx.fillStyle = CLOAK;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(8, -5);
    ctx.lineTo(10, 8);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = TUNIC;
    ctx.beginPath();
    ctx.moveTo(-5.5, -6);
    ctx.lineTo(5.5, -6);
    ctx.lineTo(4.5, 6);
    ctx.lineTo(-4.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = LEATHER;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();

    ctx.fillStyle = status;
    ctx.globalAlpha = lit;
    ctx.beginPath();
    ctx.arc(0, -2.5, 1.8, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- arms ---------------------------------------------------------------
    var reachX = U.lerp(10, 3, reach);
    var reachY = U.lerp(0, -16, reach);
    var pull = this.web === "flying" ? 0.35 + this.webT * 0.45 : reach * 0.55;
    limb(ctx, 3, -5, reachX * 0.55 + 1, reachY * 0.45 - 1, reachX, reachY, 3.4, SKIN, LEATHER);
    if (this.onWall) {
      limb(ctx, -3, -5, -8, -8, -12, -11, 3.4, SKIN, LEATHER);
    } else if (this.onRoof) {
      limb(ctx, -3, -5, -run * 5, -1, -run * 9, 4, 3.4, SKIN, LEATHER);
    } else {
      var drawX = -8 - pull * 4;
      var drawY = -4 + swing * 0.5;
      limb(ctx, -3, -5, drawX * 0.6, drawY, drawX, drawY - 2, 3.4, SKIN, LEATHER);
    }

    drawBow(ctx, reachX, reachY, bowAngle, pull);

    // --- head / hood --------------------------------------------------------
    ctx.fillStyle = CLOAK;
    ctx.beginPath();
    ctx.arc(0, -14, 7.5, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(1.5, -13.5, 4.2, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = "#1a1820";
    ctx.beginPath();
    ctx.arc(2.8, -14, 1.1, 0, U.TAU);
    ctx.arc(4.2, -13.6, 0.9, 0, U.TAU);
    ctx.fill();
    if (SW.Render && SW.Render.quality > 0) {
      var vg = ctx.createRadialGradient(2, -13, 1, 2, -13, 14);
      vg.addColorStop(0, status);
      vg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.22 * lit;
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.arc(2, -13, 14, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  };

  SW.Player = Player;
})(window);
