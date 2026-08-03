(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  var Render = {};
  Render.quality = 1; // 1 = full, 0 = cheap effects for weak devices
  Render.calm = false; // no shake, no speed lines
  Render.shapes = false; // tell markers apart by shape, not only colour

  Render.palette = function (d) {
    var a = d.def.sky;
    var b = d.next.sky;
    var t = d.blend;
    return [
      U.mixHex(a[0], b[0], t),
      U.mixHex(a[1], b[1], t),
      U.mixHex(a[2], b[2], t),
      U.mixHex(a[3], b[3], t),
    ];
  };

  Render.sky = function (ctx, cam, w, h, sky) {
    var horizon = (0 - cam.y) * cam.zoom + h * 0.5;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    var t = U.clamp(horizon / h, 0.15, 1.15);
    g.addColorStop(0, sky[0]);
    g.addColorStop(Math.max(0.01, t * 0.45), sky[1]);
    g.addColorStop(Math.max(0.02, t * 0.82), sky[2]);
    g.addColorStop(Math.min(1, Math.max(0.03, t)), sky[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  Render.stars = function (ctx, cam, w, h) {
    var p = 0.05;
    var ox = -cam.x * p;
    var oy = -cam.y * p;
    ctx.save();
    for (var i = 0; i < 150; i++) {
      var sx = (U.hash01(i * 3.1) * 2600 + ox) % 2600;
      if (sx < 0) sx += 2600;
      var sy = U.hash01(i * 7.7) * 620 + oy - 520;
      if (sx > w + 4 || sy > h || sy < -4) continue;
      var tw = 0.4 + 0.6 * U.hash01(i * 1.7);
      ctx.globalAlpha = tw * 0.9;
      ctx.fillStyle = i % 9 === 0 ? "#9fd8ff" : "#ffffff";
      var r = U.hash01(i * 5.3) * 1.3 + 0.4;
      ctx.fillRect(sx, sy, r, r);
    }
    ctx.globalAlpha = 1;

    // Moon.
    var mx = w * 0.78 - cam.x * 0.02;
    var my = h * 0.16 - cam.y * 0.02 - 120;
    if (mx > -80 && mx < w + 80 && my > -80 && my < h) {
      var mg = ctx.createRadialGradient(mx, my, 6, mx, my, 90);
      mg.addColorStop(0, "rgba(255,240,225,0.95)");
      mg.addColorStop(0.28, "rgba(255,210,180,0.25)");
      mg.addColorStop(1, "rgba(255,180,150,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, 90, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  function skylineLayer(ctx, cam, w, h, p, seed, spacing, minH, maxH, color) {
    var zoom = cam.zoom;
    var halfW = w / 2;
    var toScreenX = function (wx) {
      return (wx - cam.x * p) * zoom + halfW;
    };
    var groundY = (0 - cam.y * p) * zoom + h * 0.5;
    if (groundY < -50) return;
    var left = cam.x * p - halfW / zoom;
    var right = cam.x * p + halfW / zoom;
    var i0 = Math.floor(left / spacing) - 1;
    var i1 = Math.ceil(right / spacing) + 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = i0; i <= i1; i++) {
      var hh = U.lerp(minH, maxH, U.hash01(i * seed));
      var bw = spacing * (0.62 + U.hash01(i * seed + 11) * 0.3);
      var x = toScreenX(i * spacing);
      ctx.rect(x, groundY - hh * zoom, bw * zoom, hh * zoom + 40);
    }
    ctx.fill();
  }

  Render.parallax = function (ctx, cam, w, h, d) {
    skylineLayer(ctx, cam, w, h, 0.16, 2.7, 190, 140, 420, d.def.far);
    skylineLayer(ctx, cam, w, h, 0.34, 5.3, 240, 200, 620, d.def.mid);
    if (d.blend > 0.01) {
      ctx.save();
      ctx.globalAlpha = d.blend;
      skylineLayer(ctx, cam, w, h, 0.16, 2.7, 190, 140, 420, d.next.far);
      skylineLayer(ctx, cam, w, h, 0.34, 5.3, 240, 200, 620, d.next.mid);
      ctx.restore();
    }
  };

  Render.ground = function (ctx, cam, w, h) {
    var y = (0 - cam.y) * cam.zoom + h * 0.5;
    if (y > h) return;
    var g = ctx.createLinearGradient(0, y - 60 * cam.zoom, 0, h);
    g.addColorStop(0, "rgba(30,20,45,0.0)");
    g.addColorStop(0.25, "#120c1e");
    g.addColorStop(1, "#07060f");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 60 * cam.zoom, w, h - y + 60 * cam.zoom);

    ctx.fillStyle = "rgba(255,120,90,0.5)";
    ctx.fillRect(0, y, w, Math.max(1, 2 * cam.zoom));

    // Lane dashes and street lamps give a sense of ground speed.
    var spacing = 120;
    var left = cam.x - w / (2 * cam.zoom);
    var i0 = Math.floor(left / spacing) - 1;
    var i1 = i0 + Math.ceil(w / (spacing * cam.zoom)) + 3;
    for (var i = i0; i <= i1; i++) {
      var sx = (i * spacing - cam.x) * cam.zoom + w / 2;
      ctx.fillStyle = "rgba(255,200,150,0.16)";
      ctx.fillRect(sx, y + 42 * cam.zoom, 46 * cam.zoom, 3 * cam.zoom);
      if (i % 3 === 0) {
        var lg = ctx.createRadialGradient(
          sx,
          y + 8 * cam.zoom,
          2,
          sx,
          y + 8 * cam.zoom,
          70 * cam.zoom
        );
        lg.addColorStop(0, "rgba(255,190,120,0.35)");
        lg.addColorStop(1, "rgba(255,190,120,0)");
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(sx, y + 8 * cam.zoom, 70 * cam.zoom, 0, U.TAU);
        ctx.fill();
      }
    }
  };

  Render.buildings = function (ctx, world, cam, w) {
    var half = w / (2 * cam.zoom) + 60;
    for (var i = 0; i < world.buildings.length; i++) {
      var b = world.buildings[i];
      if (b.x + b.w < cam.x - half) continue;
      if (b.x > cam.x + half) break;
      ctx.drawImage(b.sprite, b.x, b.top - b.antennaH);
    }
  };

  function drawCrane(ctx, p, time) {
    var mastTop = p.jibY;
    ctx.strokeStyle = "#d9a12b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.baseY);
    ctx.lineTo(p.x, mastTop);
    ctx.stroke();

    // Lattice on the mast.
    ctx.strokeStyle = "rgba(217,161,43,0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var y = p.baseY; y > mastTop; y -= 26) {
      ctx.moveTo(p.x - 8, y);
      ctx.lineTo(p.x + 8, y - 13);
      ctx.moveTo(p.x + 8, y);
      ctx.lineTo(p.x - 8, y - 13);
      ctx.moveTo(p.x - 8, y);
      ctx.lineTo(p.x - 8, y - 26);
      ctx.moveTo(p.x + 8, y);
      ctx.lineTo(p.x + 8, y - 26);
    }
    ctx.stroke();

    // Jib and counter-jib.
    ctx.strokeStyle = "#e8b23c";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x0, mastTop);
    ctx.lineTo(p.x1, mastTop);
    ctx.stroke();

    ctx.strokeStyle = "rgba(232,178,60,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x, mastTop - 34);
    ctx.lineTo(p.x1 - 12, mastTop - 4);
    ctx.moveTo(p.x, mastTop - 34);
    ctx.lineTo(p.x0 + 6, mastTop - 4);
    ctx.moveTo(p.x, mastTop);
    ctx.lineTo(p.x, mastTop - 34);
    ctx.stroke();

    // Empty hook on a swinging cable; loaded cranes draw their own.
    if (!p.load) {
      var sway = Math.sin(time * 0.7 + p.x * 0.01) * 6;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.hookX, mastTop);
      ctx.lineTo(p.hookX + sway, mastTop + p.hookLen);
      ctx.stroke();
      ctx.fillStyle = "#e8b23c";
      ctx.fillRect(p.hookX + sway - 4, mastTop + p.hookLen, 8, 9);
    }

    ctx.fillStyle = "rgba(255,90,120,0.9)";
    ctx.beginPath();
    ctx.arc(p.x, mastTop - 38, 3, 0, U.TAU);
    ctx.fill();
  }

  function drawSign(ctx, p, time) {
    ctx.strokeStyle = "#101426";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x + 12, p.y + p.h);
    ctx.lineTo(p.x + 12, p.y + p.h + p.legs);
    ctx.moveTo(p.x + p.w - 12, p.y + p.h);
    ctx.lineTo(p.x + p.w - 12, p.y + p.h + p.legs);
    ctx.stroke();

    var flicker = 0.75 + Math.sin(time * 9 + p.seed) * 0.06;
    ctx.fillStyle = "#0b0f1f";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = flicker;
    ctx.strokeStyle = p.hue;
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8);

    ctx.fillStyle = p.hue;
    var rows = Math.max(1, Math.floor((p.h - 20) / 12));
    for (var r = 0; r < rows; r++) {
      var wid = (p.w - 26) * (0.45 + U.hash01(p.seed + r * 3.3) * 0.5);
      ctx.fillRect(p.x + 13, p.y + 13 + r * 12, wid, 4);
    }
    ctx.globalAlpha = 1;

    var glow = ctx.createRadialGradient(
      p.x + p.w / 2,
      p.y + p.h / 2,
      4,
      p.x + p.w / 2,
      p.y + p.h / 2,
      p.w
    );
    glow.addColorStop(0, p.hue);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.13 * flicker;
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - p.w, p.y - p.h, p.w * 3, p.h * 3);
    ctx.globalAlpha = 1;
  }

  function drawWire(ctx, p) {
    var midX = (p.x0 + p.x1) / 2;
    ctx.strokeStyle = "rgba(180,200,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x0, p.y0);
    ctx.quadraticCurveTo(midX, p.cy, p.x1, p.y1);
    ctx.stroke();

    for (var i = 1; i <= p.lamps; i++) {
      var t = i / (p.lamps + 1);
      var x = U.lerp(p.x0, p.x1, t);
      var it = 1 - t;
      var y = it * it * p.y0 + 2 * it * t * p.cy + t * t * p.y1;
      var g = ctx.createRadialGradient(x, y + 7, 1, x, y + 7, 22);
      g.addColorStop(0, "rgba(255,220,160,0.9)");
      g.addColorStop(1, "rgba(255,190,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y + 7, 22, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,200,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
  }

  function drawBlimp(ctx, p, time) {
    var bob = Math.sin(time * 0.6 + p.phase) * 6;
    ctx.save();
    ctx.translate(p.x, p.y + bob);

    ctx.fillStyle = "#e7e2d6";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, U.TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(255,59,107,0.85)";
    ctx.beginPath();
    ctx.ellipse(-p.rx * 0.28, 0, p.rx * 0.16, p.ry * 0.93, 0, 0, U.TAU);
    ctx.fill();

    ctx.fillStyle = "#c9c2b2";
    ctx.beginPath();
    ctx.moveTo(p.rx * 0.86, 0);
    ctx.lineTo(p.rx * 1.16, -p.ry * 0.85);
    ctx.lineTo(p.rx * 0.9, -p.ry * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.rx * 0.86, 0);
    ctx.lineTo(p.rx * 1.16, p.ry * 0.85);
    ctx.lineTo(p.rx * 0.9, p.ry * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2a3050";
    ctx.fillRect(-p.rx * 0.22, p.ry * 0.75, p.rx * 0.44, p.ry * 0.42);
    ctx.fillStyle = "rgba(255,220,160,0.9)";
    ctx.fillRect(-p.rx * 0.14, p.ry * 0.85, p.rx * 0.1, p.ry * 0.16);
    ctx.fillRect(p.rx * 0.02, p.ry * 0.85, p.rx * 0.1, p.ry * 0.16);

    ctx.restore();
  }

  function drawCraneLoad(ctx, p) {
    var lx = p.hookX + Math.sin(p.load.angle) * p.load.len;
    var ly = p.jibY + Math.cos(p.load.angle) * p.load.len;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.hookX, p.jibY);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    var r = p.load.r;
    ctx.fillStyle = "#3a3f52";
    ctx.fillRect(lx - r, ly - r * 0.75, r * 2, r * 1.5);
    ctx.strokeStyle = "#ffb03a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx - r, ly - r * 0.75);
    ctx.lineTo(lx + r, ly + r * 0.75);
    ctx.moveTo(lx + r, ly - r * 0.75);
    ctx.lineTo(lx - r, ly + r * 0.75);
    ctx.stroke();
  }

  function drawHeli(ctx, z, time) {
    var blade = time * 28 + z.phase;
    // Search beam sweeping the street below.
    var sweep = Math.sin(time * 0.9 + z.phase) * 0.42;
    ctx.save();
    ctx.translate(z.x, z.y);
    var grad = ctx.createLinearGradient(0, 0, 0, z.beam);
    grad.addColorStop(0, "rgba(255,240,190,0.24)");
    grad.addColorStop(1, "rgba(255,240,190,0)");
    ctx.save();
    ctx.rotate(sweep);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-8, 8);
    ctx.lineTo(8, 8);
    ctx.lineTo(z.beam * 0.42, z.beam);
    ctx.lineTo(-z.beam * 0.42, z.beam);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#20263c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 15, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillRect(20, -4, 34, 6);
    ctx.fillStyle = "#0d1120";
    ctx.fillRect(48, -14, 5, 18);
    ctx.fillStyle = "rgba(120,200,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(-13, -2, 9, 7, 0, 0, U.TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(200,215,255,0.65)";
    ctx.lineWidth = 2.5;
    var span = 40 * Math.cos(blade);
    ctx.beginPath();
    ctx.moveTo(-span, -17);
    ctx.lineTo(span, -17);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, -8);
    ctx.stroke();

    ctx.fillStyle = Math.sin(time * 6) > 0 ? "#ff3b6b" : "rgba(255,59,107,0.25)";
    ctx.beginPath();
    ctx.arc(0, 13, 3.5, 0, U.TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawDrone(ctx, z, time) {
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(Math.sin(time * 2 + z.phase) * 0.12);
    ctx.strokeStyle = "#39405e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(14, 6);
    ctx.moveTo(14, -6);
    ctx.lineTo(-14, 6);
    ctx.stroke();
    ctx.fillStyle = "#1b2138";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,80,110,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, U.TAU);
    ctx.fill();
    var spin = time * 30 + z.phase;
    ctx.strokeStyle = "rgba(190,210,255,0.5)";
    ctx.lineWidth = 1.5;
    for (var i = 0; i < 4; i++) {
      var sx = i < 2 ? -14 : 14;
      var sy = i % 2 === 0 ? -6 : 6;
      var r = 7 * Math.abs(Math.cos(spin + i));
      ctx.beginPath();
      ctx.moveTo(sx - r, sy);
      ctx.lineTo(sx + r, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTurret(ctx, z) {
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.fillStyle = "#242a40";
    ctx.beginPath();
    ctx.arc(0, 4, 13, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-14, 4, 28, 10);
    ctx.save();
    ctx.rotate(z.angle);
    ctx.fillStyle = "#39405e";
    ctx.fillRect(0, -4, 30, 8);
    ctx.fillStyle = "#11162a";
    ctx.fillRect(24, -3, 8, 6);
    ctx.restore();
    var lit = z.alert > 0.15;
    ctx.fillStyle = lit ? "#ff4a6b" : "rgba(255,120,140,0.35)";
    ctx.beginPath();
    ctx.arc(0, -3, 3.6, 0, U.TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawWebbed(ctx, z, time) {
    var r = z.r + 5;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(Math.sin(time * 6 + z.phase) * 0.25);
    ctx.fillStyle = "rgba(238,244,255,0.92)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.15, 0, 0, U.TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,175,210,0.9)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = -2; i <= 2; i++) {
      ctx.moveTo(-r, i * r * 0.42);
      ctx.lineTo(r, i * r * 0.42 + r * 0.2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawAlert(ctx, z, time) {
    if (!z.hostile || z.alert < 0.12) return;
    var pulse = 0.5 + Math.sin(time * 8) * 0.5;
    var g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r * 3.4);
    g.addColorStop(0, "rgba(255,70,100," + (0.28 * z.alert * (0.5 + pulse * 0.5)).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,70,100,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * 3.4, 0, U.TAU);
    ctx.fill();
  }

  Render.hazards = function (ctx, world, cam, w, time) {
    var half = w / (2 * cam.zoom) + 300;
    ctx.save();
    for (var i = 0; i < world.hazards.length; i++) {
      var z = world.hazards[i];
      if (z.x < cam.x - half || z.x > cam.x + half) continue;
      if (z.state === "webbed") {
        drawWebbed(ctx, z, time);
        continue;
      }
      drawAlert(ctx, z, time);
      if (z.type === "heli") drawHeli(ctx, z, time);
      else if (z.type === "turret") drawTurret(ctx, z);
      else drawDrone(ctx, z, time);
    }
    ctx.restore();
  };

  /** Web glob in flight, with the thread trailing back to the hand. */
  Render.webShots = function (ctx, shots) {
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(s.ox, s.oy);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5.5, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,220,255,0.8)";
      ctx.lineWidth = 1.2;
      for (var k = 0; k < 4; k++) {
        var a = (k / 4) * U.TAU + s.life * 6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  Render.enemyShots = function (ctx, shots) {
    ctx.save();
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 22);
      g.addColorStop(0, "rgba(255,150,90,0.95)");
      g.addColorStop(1, "rgba(255,90,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = "#ffe0b0";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,150,90,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Brackets around the enemy the next web shot will hit. */
  Render.target = function (ctx, z, time) {
    var r = z.r + 12 + Math.sin(time * 5) * 2;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.9;
    for (var i = 0; i < 4; i++) {
      var a = Math.PI / 4 + (i * Math.PI) / 2;
      var cx = z.x + Math.cos(a) * r;
      var cy = z.y + Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(z.x, z.y, r, 0, U.TAU);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * Ghost arc of the swing the aimed anchor would produce. A short red arc is
   * the useful case: it means this anchor throws you into a wall or the street.
   */
  Render.weather = function (ctx, cam, w, h, weather, time) {
    if (weather.rain > 0.02) {
      var n = Math.floor(weather.rain * (Render.quality > 0 ? 160 : 70));
      var slant = weather.wind * 0.55;
      ctx.save();
      ctx.strokeStyle = "rgba(180,210,255,0.35)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var seedX = U.hash01(i * 3.7);
        var seedY = U.hash01(i * 9.1);
        var speed = 900 + seedY * 700;
        var x = ((seedX * w + cam.x * -0.35 + slant * time * 260) % w + w) % w;
        var y = ((seedY * h + time * speed) % (h + 60)) - 30;
        var len = 12 + seedY * 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x + slant * len, y + len);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (weather.fog > 0.02) {
      var horizon = (0 - cam.y) * cam.zoom + h * 0.5;
      var g = ctx.createLinearGradient(0, horizon - 420 * cam.zoom, 0, horizon);
      g.addColorStop(0, "rgba(150,165,200,0)");
      g.addColorStop(1, "rgba(150,165,200," + (weather.fog * 0.42).toFixed(3) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, Math.max(0, horizon));
      ctx.fillStyle = "rgba(150,165,200," + (weather.fog * 0.1).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
    }
  };

  Render.props = function (ctx, world, cam, w, time) {
    var half = w / (2 * cam.zoom) + 400;
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < world.props.length; i++) {
      var p = world.props[i];
      var px = p.type === "wire" ? p.x0 : p.x;
      if (px < cam.x - half || px > cam.x + half) continue;
      if (p.type === "crane") {
        drawCrane(ctx, p, time);
        if (p.load) drawCraneLoad(ctx, p);
      }
      else if (p.type === "sign") drawSign(ctx, p, time);
      else if (p.type === "wire") drawWire(ctx, p);
      else if (p.type === "blimp") drawBlimp(ctx, p, time);
    }
    ctx.restore();
  };

  Render.orbs = function (ctx, world, cam, w, time) {
    var half = w / (2 * cam.zoom) + 60;
    ctx.save();
    for (var i = 0; i < world.orbs.length; i++) {
      var o = world.orbs[i];
      if (o.taken) continue;
      if (o.x < cam.x - half) continue;
      if (o.x > cam.x + half) break;
      var pulse = 0.75 + Math.sin(time * 3 + o.phase) * 0.25;
      var r = 9 + pulse * 2;
      var g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, r * 2.6);
      g.addColorStop(0, "rgba(190,255,255,0.95)");
      g.addColorStop(0.35, "rgba(67,229,255,0.55)");
      g.addColorStop(1, "rgba(67,229,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 2.6, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(235,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 0.42, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /** Cargo waiting on a roof and the pad it has to reach. */
  Render.contract = function (ctx, contract, time) {
    if (!contract) return;
    ctx.save();
    if (contract.state === "offer" && contract.pickup) {
      var p = contract.pickup;
      var bob = Math.sin(time * 2.4) * 5;
      var g = ctx.createRadialGradient(p.x, p.y + bob, 3, p.x, p.y + bob, 70);
      g.addColorStop(0, "rgba(255,196,107,0.5)");
      g.addColorStop(1, "rgba(255,196,107,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 70, 0, U.TAU);
      ctx.fill();

      ctx.fillStyle = "#c98b2e";
      ctx.fillRect(p.x - 15, p.y - 15 + bob, 30, 26);
      ctx.strokeStyle = "#ffdc9a";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(p.x - 15, p.y - 15 + bob, 30, 26);
      ctx.beginPath();
      ctx.moveTo(p.x - 15, p.y - 2 + bob);
      ctx.lineTo(p.x + 15, p.y - 2 + bob);
      ctx.stroke();
    }

    if (contract.state === "carry" && contract.drop) {
      var d = contract.drop;
      var pulse = 0.5 + Math.sin(time * 3.4) * 0.5;
      var beam = ctx.createLinearGradient(d.x, d.y - 260, d.x, d.y);
      beam.addColorStop(0, "rgba(120,240,255,0)");
      beam.addColorStop(1, "rgba(120,240,255," + (0.16 + pulse * 0.14).toFixed(3) + ")");
      ctx.fillStyle = beam;
      ctx.fillRect(d.x - 42, d.y - 260, 84, 260);

      ctx.strokeStyle = "rgba(143,240,255,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - 4, 46, 13, 0, 0, U.TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.4 + pulse * 0.4;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - 4, 46 - pulse * 24, 13 - pulse * 7, 0, 0, U.TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Off-screen pointer towards the delivery pad, drawn in screen space. */
  Render.marker = function (ctx, w, h, sx, sy, color, label) {
    var pad = 46;
    var inside = sx > pad && sx < w - pad && sy > pad && sy < h - pad;
    if (inside) return;
    var cx = U.clamp(sx, pad, w - pad);
    var cy = U.clamp(sy, pad, h - pad);
    var a = Math.atan2(sy - h / 2, sx - w / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy + 30);
      ctx.restore();
    }
  };

  /** Yesterday's best run, replayed as a translucent silhouette. */
  Render.ghost = function (ctx, x, y) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "#7fd0ff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x - 6, y + 15);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 6, y + 15);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x - 9, y - 9);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 9, y - 9);
    ctx.stroke();
    ctx.fillStyle = "#7fd0ff";
    ctx.beginPath();
    ctx.arc(x, y - 12, 6.5, 0, U.TAU);
    ctx.fill();
    ctx.restore();
  };

  Render.trail = function (ctx, trail) {
    if (trail.length < 3) return;
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1];
      var b = trail[i];
      var t = i / trail.length;
      ctx.globalAlpha = t * 0.34;
      ctx.lineWidth = 1 + t * 7;
      ctx.strokeStyle = "rgba(255,120,150,1)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  Render.web = function (ctx, player) {
    var hand = player.handPos({ x: 0, y: 0 });
    ctx.save();
    ctx.lineCap = "round";

    if (player.web === "miss" && player.missDir) {
      var len = Math.sin(player.webT * Math.PI) * 240;
      ctx.globalAlpha = 0.5 * (1 - player.webT);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(hand.x + player.missDir.x * len, hand.y + player.missDir.y * len);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (player.web !== "attached" && player.web !== "flying") {
      ctx.restore();
      return;
    }

    var ex = player.anchor.x;
    var ey = player.anchor.y;
    if (player.web === "flying") {
      ex = U.lerp(hand.x, player.anchor.x, player.webT);
      ey = U.lerp(hand.y, player.anchor.y, player.webT);
    }

    var dx = ex - hand.x;
    var dy = ey - hand.y;
    var dist = Math.hypot(dx, dy);
    var slack =
      player.web === "attached" ? Math.max(0, player.ropeLen - dist) : 0;
    var mx = (hand.x + ex) / 2;
    var my = (hand.y + ey) / 2 + Math.min(slack * 0.45, 60);

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2.2;
    if (Render.quality > 0) {
      ctx.shadowColor = "rgba(160,220,255,0.7)";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(hand.x, hand.y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (player.web === "attached") {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.4;
      var r = 7;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * U.TAU;
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  Render.particles = function (ctx, particles) {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t) * (p.alpha || 1);
      ctx.fillStyle = p.color;
      if (p.ring) {
        ctx.globalAlpha *= 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - t), 0, U.TAU);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, U.TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  Render.speedLines = function (ctx, w, h, intensity) {
    if (intensity <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = intensity * 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    var cx = w / 2;
    var cy = h / 2;
    for (var i = 0; i < 26; i++) {
      var a = U.hash01(i * 12.9) * U.TAU;
      var r0 = 200 + U.hash01(i * 4.4) * 260;
      var len = 60 + intensity * 190;
      var ca = Math.cos(a);
      var sa = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0 * 0.7);
      ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len) * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  };

  Render.vignette = function (ctx, w, h, intensity) {
    var g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.32,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.78
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(4,2,12," + (0.55 + intensity * 0.3).toFixed(2) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  Render.aim = function (ctx, player, world, aim, precomputed) {
    if (player.dead || player.web === "attached") return;
    var dx = aim.x - player.pos.x;
    var dy = aim.y - player.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return;
    var hit = precomputed || player.aimAssist(aim.x, aim.y, world);
    ctx.save();
    if (hit) {
      ctx.strokeStyle = "rgba(120,240,255,0.55)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(player.pos.x, player.pos.y);
      ctx.lineTo(hit.x, hit.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(150,250,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, 10, 0, U.TAU);
      ctx.stroke();
    } else if (player.canKick()) {
      // No anchor there, but a wall is within reach: show the push-off vector.
      var ux = dx / d;
      var uy = dy / d;
      if (ux * player.wallNx < 0) ux = -ux;
      if (uy > 0.3) uy = 0.3;
      var n = Math.hypot(ux, uy) || 1;
      ux /= n;
      uy /= n;
      var len = 92;
      var ex = player.pos.x + ux * len;
      var ey = player.pos.y + uy * len;
      ctx.strokeStyle = "rgba(255,190,120,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.pos.x + ux * 16, player.pos.y + uy * 16);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      var a = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a - 0.45) * 15, ey - Math.sin(a - 0.45) * 15);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a + 0.45) * 15, ey - Math.sin(a + 0.45) * 15);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.moveTo(player.pos.x, player.pos.y);
      ctx.lineTo(
        player.pos.x + (dx / d) * C.WEB_RANGE,
        player.pos.y + (dy / d) * C.WEB_RANGE
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  SW.Render = Render;
})(window);
