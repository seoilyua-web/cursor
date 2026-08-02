(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});
  var U = SW.util;
  var C = SW.CONST;

  var Render = {};

  var SKY_TOP = "#080a1c";
  var SKY_MID = "#2a1b48";
  var SKY_LOW = "#6b2f52";
  var SKY_HORIZON = "#c2603f";

  Render.sky = function (ctx, cam, w, h) {
    var horizon = (0 - cam.y) * cam.zoom + h * 0.5;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    var t = U.clamp(horizon / h, 0.15, 1.15);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(Math.max(0.01, t * 0.45), SKY_MID);
    g.addColorStop(Math.max(0.02, t * 0.82), SKY_LOW);
    g.addColorStop(Math.min(1, Math.max(0.03, t)), SKY_HORIZON);
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

  Render.parallax = function (ctx, cam, w, h) {
    skylineLayer(ctx, cam, w, h, 0.16, 2.7, 190, 140, 420, "rgba(24,26,58,0.85)");
    skylineLayer(ctx, cam, w, h, 0.34, 5.3, 240, 200, 620, "rgba(15,17,42,0.92)");
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
    ctx.shadowColor = "rgba(160,220,255,0.7)";
    ctx.shadowBlur = 8;
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

  Render.aim = function (ctx, player, world, aim) {
    if (player.dead || player.web === "attached") return;
    var dx = aim.x - player.pos.x;
    var dy = aim.y - player.pos.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return;
    var hit = player.probe(aim.x, aim.y, world);
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
