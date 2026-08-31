import { MAP } from "../data/maps.js";
import { TOWERS, towerStats } from "../data/towers.js";
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.c = canvas.getContext("2d");
    this.game = game;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
  }
  resize() {
    const d = Math.min(devicePixelRatio || 1, 2),
      r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * d);
    this.canvas.height = Math.round(r.height * d);
    this.scale = Math.min(this.canvas.width / 720, this.canvas.height / 1120);
    this.ox = (this.canvas.width - 720 * this.scale) / 2;
    this.oy = (this.canvas.height - 1120 * this.scale) / 2;
  }
  worldPoint(e) {
    const r = this.canvas.getBoundingClientRect(),
      d = this.canvas.width / r.width;
    return {
      x: ((e.clientX - r.left) * d - this.ox) / this.scale,
      y: ((e.clientY - r.top) * d - this.oy) / this.scale,
    };
  }
  draw() {
    const c = this.c,
      g = this.game;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const grd = c.createLinearGradient(0, 0, 0, this.canvas.height);
    grd.addColorStop(0, "#493548");
    grd.addColorStop(1, "#171322");
    c.fillStyle = grd;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      this.ox + g.shakeX,
      this.oy + g.shakeY,
    );
    this.background(c);
    this.path(c);
    this.pads(c);
    this.towers(c);
    this.enemies(c);
    this.projectiles(c);
    g.particles.draw(c);
    this.core(c);
    this.texts(c);
    if (g.state === "playing" && g.waveIndex < 0) {
      c.fillStyle = "#0008";
      c.fillRect(0, 0, 720, 1120);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  background(c) {
    const grd = c.createLinearGradient(0, 0, 720, 1120);
    grd.addColorStop(0, "#dfaa62");
    grd.addColorStop(0.55, "#c98848");
    grd.addColorStop(1, "#a8643d");
    c.fillStyle = grd;
    c.fillRect(0, 0, 720, 1120);
    c.globalAlpha = 0.15;
    for (let i = 0; i < 90; i++) {
      const x = (i * 173) % 720,
        y = (i * 307) % 1120;
      c.fillStyle = i % 3 ? "#5e382a" : "#ffe0a0";
      c.beginPath();
      c.arc(x, y, 2 + (i % 4), 0, 7);
      c.fill();
    }
    c.globalAlpha = 1;
    for (const [x, y] of [
      [40, 450],
      [680, 570],
      [80, 900],
      [650, 180],
      [180, 1040],
    ]) {
      c.fillStyle = "#6b6f45";
      c.beginPath();
      c.moveTo(x, y - 14);
      c.lineTo(x + 10, y + 12);
      c.lineTo(x - 12, y + 8);
      c.fill();
      c.strokeStyle = "#393b2b";
      c.stroke();
    }
  }
  path(c) {
    c.lineCap = "round";
    c.lineJoin = "round";
    const pts = MAP.path;
    c.strokeStyle = "#623e32";
    c.lineWidth = 98;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
    c.stroke();
    c.strokeStyle = "#b47a4f";
    c.lineWidth = 82;
    c.stroke();
    c.strokeStyle = "#d49a62";
    c.lineWidth = 4;
    c.setLineDash([14, 22]);
    c.stroke();
    c.setLineDash([]);
  }
  pads(c) {
    const t = performance.now() / 500;
    for (const p of MAP.pads) {
      const pad = this.game.pads.find((q) => q.x === p[0] && q.y === p[1]),
        sel = this.game.selectedPad === pad;
      c.save();
      c.translate(...p);
      c.fillStyle = pad?.tower ? "#403f46" : "#5d5147";
      c.strokeStyle = sel ? "#fff4a4" : pad?.tower ? "#8d8e94" : "#5ff5d0";
      c.lineWidth = sel ? 5 : 3;
      c.shadowColor = "#0008";
      c.shadowBlur = 8;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        c.lineTo(Math.cos(a) * 31, Math.sin(a) * 31);
      }
      c.closePath();
      c.fill();
      c.stroke();
      if (!pad?.tower) {
        c.globalAlpha = 0.55 + 0.2 * Math.sin(t + p[0]);
        c.strokeStyle = "#fff";
        c.beginPath();
        c.arc(0, 0, 20, 0, 7);
        c.stroke();
        c.fillStyle = "#fff";
        c.fillRect(-3, -11, 6, 22);
        c.fillRect(-11, -3, 22, 6);
      }
      c.restore();
    }
  }
  towers(c) {
    for (const p of this.game.pads) {
      const t = p.tower;
      if (!t) continue;
      const s = towerStats(t.type, t.level, t.branch);
      c.save();
      c.translate(p.x, p.y);
      c.shadowColor = "#0009";
      c.shadowBlur = 8;
      c.shadowOffsetY = 6;
      c.fillStyle = "#36384b";
      c.strokeStyle = "#171827";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, 0, 23 + t.level * 2, 0, 7);
      c.fill();
      c.stroke();
      c.rotate(t.angle || 0);
      c.fillStyle = s.color;
      c.strokeStyle = "#15202b";
      if (t.type === "bolt") {
        for (let i = 0; i < Math.min(3, t.level); i++) {
          c.fillRect(2, -9 + i * 7, 25 + t.level * 3, 5);
        }
      } else if (t.type === "mortar") {
        c.fillRect(-5, -12, 18, 24);
        c.fillRect(5, -7, 34 + t.level * 4, 14);
      } else if (t.type === "frost") {
        c.beginPath();
        c.arc(0, 0, 10 + t.level * 2, 0, 7);
        c.fill();
        for (let i = 0; i < t.level; i++) {
          c.rotate(6.28 / t.level);
          c.fillRect(8, -3, 18, 6);
        }
      } else {
        c.fillRect(-7, -8, 14, 27 + t.level * 5);
        c.beginPath();
        c.arc(0, -15 - t.level * 4, 9 + t.level, 0, 7);
        c.fill();
      }
      c.stroke();
      c.restore();
    }
  }
  enemies(c) {
    const es = [...this.game.enemies]
      .filter((e) => e.active)
      .sort((a, b) => a.y - b.y);
    for (const e of es) {
      c.save();
      c.translate(e.x, e.y);
      const walk = Math.sin(performance.now() * 0.009 + e.distance * 0.18);
      const bodyColor = e.flash > 0 ? "#fff" : e.shield > 0 ? "#7ff2ff" : e.color;
      c.fillStyle = "#0006";
      c.beginPath();
      c.ellipse(0, e.size * 0.72, e.size * 0.9, e.size * 0.38, 0, 0, 7);
      c.fill();
      c.strokeStyle = "#31211d";
      c.lineWidth = Math.max(2, e.size * 0.16);
      if (e.type === "boss") {
        c.fillStyle = bodyColor;
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4,
            r = i % 2 ? e.size * 0.75 : e.size;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = "#d7c58e";
        c.fillRect(-e.size * 0.85, -e.size * 0.2, e.size * 1.7, e.size * 0.35);
        c.fillStyle = "#ffce62";
        c.beginPath();
        c.arc(0, -e.size * 0.35, e.size * 0.23, 0, 7);
        c.fill();
      } else if (e.type === "beast") {
        c.fillStyle = bodyColor;
        c.beginPath();
        c.ellipse(0, 0, e.size * 1.25, e.size * 0.8, 0, 0, 7);
        c.fill();
        c.stroke();
        c.fillStyle = "#f0cf9a";
        c.beginPath();
        c.moveTo(-e.size, -e.size * 0.35);
        c.lineTo(-e.size * 1.45, -e.size * 0.85);
        c.lineTo(-e.size * 0.55, -e.size * 0.55);
        c.moveTo(e.size, -e.size * 0.35);
        c.lineTo(e.size * 1.45, -e.size * 0.85);
        c.lineTo(e.size * 0.55, -e.size * 0.55);
        c.fill();
      } else {
        c.strokeStyle = "#292130";
        c.lineWidth = Math.max(3, e.size * 0.3);
        c.beginPath();
        c.moveTo(-e.size * 0.28, e.size * 0.25);
        c.lineTo(-e.size * 0.38 + walk * 2, e.size * 0.95);
        c.moveTo(e.size * 0.28, e.size * 0.25);
        c.lineTo(e.size * 0.38 - walk * 2, e.size * 0.95);
        c.stroke();
        c.fillStyle = bodyColor;
        c.strokeStyle = "#31211d";
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(-e.size * 0.62, -e.size * 0.35, e.size * 1.24, e.size * 1.05, e.size * 0.3);
        c.fill();
        c.stroke();
        c.fillStyle = "#f1c18d";
        c.beginPath();
        c.arc(0, -e.size * 0.65, e.size * 0.42, 0, 7);
        c.fill();
        c.stroke();
        c.fillStyle = e.type === "runner" ? "#f6df58" : "#443b42";
        c.beginPath();
        c.arc(0, -e.size * 0.76, e.size * 0.44, Math.PI, 0);
        c.fill();
        c.strokeStyle = "#33232a";
        c.lineWidth = Math.max(2, e.size * 0.18);
        c.beginPath();
        c.moveTo(e.size * 0.35, -e.size * 0.05);
        c.lineTo(e.size * 1.05, e.size * 0.3 + walk);
        c.stroke();
        if (e.type === "bulwark") {
          c.fillStyle = "#d7c58e";
          c.fillRect(-e.size * 0.9, -e.size * 0.25, e.size * 0.55, e.size * 1.05);
        } else if (e.type === "disruptor") {
          c.fillStyle = "#f0b7ff";
          c.beginPath();
          c.arc(0, e.size * 0.12, e.size * 0.25, 0, 7);
          c.fill();
        } else if (e.type === "splitter") {
          c.fillStyle = "#d7ff8a";
          c.fillRect(-e.size * 0.12, -e.size * 0.3, e.size * 0.24, e.size * 0.8);
        }
      }
      if (e.slowTime > 0) {
        c.strokeStyle = "#bffaff";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(0, 0, e.size + 4, 0, 7);
        c.stroke();
      }
      c.shadowColor = "transparent";
      c.fillStyle = "#261a20";
      c.fillRect(-e.size, -e.size - 9, e.size * 2, 4);
      c.fillStyle = e.type === "boss" ? "#ffcf4d" : "#7bf07b";
      c.fillRect(
        -e.size,
        -e.size - 9,
        e.size * 2 * Math.max(0, e.hp / e.maxHp),
        4,
      );
      c.restore();
    }
  }
  projectiles(c) {
    for (const p of this.game.projectiles) {
      c.fillStyle = p.color;
      c.shadowColor = p.color;
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, 7);
      c.fill();
    }
    c.shadowBlur = 0;
    for (const a of this.game.arcs) {
      c.strokeStyle = a.color;
      c.lineWidth = 3;
      c.globalAlpha = a.life / 0.12;
      c.beginPath();
      c.moveTo(a.x1, a.y1);
      if (a.color !== "#5cc8ff" && a.color !== "#8ff6ff") {
        c.lineTo(
          (a.x1 + a.x2) / 2 + (Math.random() - 0.5) * 10,
          (a.y1 + a.y2) / 2 + (Math.random() - 0.5) * 10,
        );
      }
      c.lineTo(a.x2, a.y2);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  core(c) {
    const g = this.game,
      x = 665,
      y = 1010;
    c.save();
    c.translate(x, y);
    c.shadowColor = "#000b";
    c.shadowBlur = 14;
    c.fillStyle = g.coreHp < 25 ? "#ef5a52" : "#355d68";
    c.strokeStyle = "#102f3b";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, 48, 0, 7);
    c.fill();
    c.stroke();
    c.fillStyle = "#70f2e4";
    c.beginPath();
    c.arc(0, 0, 22 + Math.sin(performance.now() / 250) * 2, 0, 7);
    c.fill();
    c.restore();
    if (g.boss) {
      c.fillStyle = "#17101ddb";
      c.fillRect(90, 76, 540, 22);
      c.fillStyle = "#ff604f";
      c.fillRect(94, 80, 532 * Math.max(0, g.boss.hp / g.boss.maxHp), 14);
      c.fillStyle = "#fff";
      c.font = "900 12px system-ui";
      c.textAlign = "center";
      c.fillText("DUST COLOSSUS", 360, 70);
    }
  }
  texts(c) {
    c.textAlign = "center";
    c.font = "900 16px system-ui";
    for (const t of this.game.texts) {
      c.globalAlpha = t.life;
      c.fillStyle = t.color;
      c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
}
