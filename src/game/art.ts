import Phaser from 'phaser';
import type { CosmeticId } from '../config/gameConfig';

type CanvasDraw = (context: CanvasRenderingContext2D) => void;
export type MagnetMood = 'idle' | 'attract' | 'repel' | 'hurt' | 'celebrate' | 'worried' | 'serious';
export type MagnetSkin = Extract<CosmeticId, 'classic' | 'electric' | 'gold'>;

const METAL = {
  outline: '#111d36',
  shadow: '#090f20',
  silver: ['#f4ffff', '#b9d7e9', '#647e9b', '#263d5e'],
  red: ['#ff9a86', '#ff526f', '#bc285a'],
  blue: ['#a4ffff', '#42d9fa', '#216caf'],
} as const;

function addCanvasTexture(
  manager: Phaser.Textures.TextureManager,
  key: string,
  width: number,
  height: number,
  draw: CanvasDraw,
  pixelScale = 2,
): void {
  if (manager.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelScale;
  canvas.height = height * pixelScale;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(pixelScale, pixelScale);
  draw(context);
  const texture = manager.addCanvas(key, canvas);
  texture?.refresh();
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fillLinear(
  context: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colors: readonly [string, string, string],
): CanvasGradient {
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.52, colors[1]);
  gradient.addColorStop(1, colors[2]);
  return gradient;
}

function drawEye(context: CanvasRenderingContext2D, x: number, y: number, pupilX: number, squint = 0): void {
  context.fillStyle = '#f5ffff';
  context.beginPath();
  context.ellipse(x, y, 6.8, 8 - squint, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#102744';
  context.beginPath();
  context.ellipse(x + pupilX, y + 1.5, 3.1, 4.2 - squint * 0.5, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x + pupilX - 1.1, y, 1.2, 0, Math.PI * 2);
  context.fill();
}

function drawMagnet(context: CanvasRenderingContext2D, skin: MagnetSkin, mood: MagnetMood): void {
  const isGold = skin === 'gold';
  const isElectric = skin === 'electric';
  const red = isGold ? ['#fff09e', '#ffad54', '#cc5c3b'] as const
    : isElectric ? ['#f4d4ff', '#bd71ff', '#6839b5'] as const : METAL.red;
  const blue = isGold ? ['#fff4b0', '#f5d45c', '#af762c'] as const : isElectric ? ['#e5ffff', '#72fbff', '#3a8fe5'] as const : METAL.blue;
  const glowColor = mood === 'repel' ? 'rgba(255,117,90,.43)'
    : mood === 'serious' ? 'rgba(255,91,104,.32)'
      : mood === 'worried' ? 'rgba(255,194,86,.3)'
        : isGold ? 'rgba(255,194,86,.38)' : isElectric ? 'rgba(107,234,255,.5)' : 'rgba(79,229,255,.38)';

  // A slightly wider, shorter silhouette keeps the magnet from reading as tall and narrow.
  context.save();
  context.translate(64, 64);
  context.scale(1, 0.92);
  context.translate(-64, -64);

  const halo = context.createRadialGradient(64, 64, 14, 64, 64, 63);
  halo.addColorStop(0, glowColor);
  halo.addColorStop(0.55, 'rgba(63,149,239,.12)');
  halo.addColorStop(1, 'rgba(24,49,91,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, 128, 128);

  context.save();
  context.shadowColor = 'rgba(1,7,18,.55)';
  context.shadowBlur = 9;
  context.shadowOffsetY = 7;
  context.fillStyle = '#172d4c';
  context.beginPath();
  context.ellipse(64, 104, 37, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const shell = fillLinear(context, 29, 31, 100, 101, isGold
    ? ['#fff5c6', '#e9bc59', '#80522b']
    : ['#f7ffff', '#bad7eb', '#4e7095']);
  context.save();
  context.shadowColor = 'rgba(71,216,255,.42)';
  context.shadowBlur = mood === 'repel' ? 22 : 15;
  context.beginPath();
  context.moveTo(31, 31);
  context.lineTo(31, 63);
  context.bezierCurveTo(31, 87, 45, 103, 64, 103);
  context.bezierCurveTo(83, 103, 97, 87, 97, 63);
  context.lineTo(97, 31);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = METAL.outline;
  context.lineWidth = 47;
  context.stroke();
  context.strokeStyle = shell;
  context.lineWidth = 37;
  context.stroke();
  context.restore();

  // Soft inner bevel follows the curve and gives the body a cast-metal edge.
  context.beginPath();
  context.moveTo(48, 55);
  context.lineTo(48, 63);
  context.bezierCurveTo(48, 76, 55, 85, 64, 85);
  context.bezierCurveTo(73, 85, 80, 76, 80, 63);
  context.strokeStyle = 'rgba(255,255,255,.52)';
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  context.stroke();

  const drawPole = (x: number, colors: readonly [string, string, string], polarity: 'N' | 'S'): void => {
    context.save();
    context.shadowColor = polarity === 'N' ? 'rgba(255,83,114,.48)' : 'rgba(63,223,255,.5)';
    context.shadowBlur = 11;
    roundedRect(context, x - 19, 18, 38, 52, 13);
    context.fillStyle = METAL.outline;
    context.fill();
    roundedRect(context, x - 15, 20, 30, 46, 10);
    context.fillStyle = fillLinear(context, x - 16, 20, x + 16, 67, colors);
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(255,255,255,.76)';
    context.stroke();
    roundedRect(context, x - 10, 24, 20, 5, 2.5);
    context.fillStyle = 'rgba(255,255,255,.62)';
    context.fill();
    context.fillStyle = 'rgba(15,33,57,.72)';
    context.font = 'bold 8px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(polarity, x, 59);
    context.restore();
  };
  drawPole(31, red, 'N');
  drawPole(97, blue, 'S');

  // The face is large enough to read at gameplay size and changes with the action.
  const look = mood === 'attract' ? 1.6 : mood === 'repel' ? -1.2 : 0;
  if (mood === 'hurt') {
    drawEye(context, 55, 70, 0, 5);
    drawEye(context, 73, 70, 0, 5);
    context.strokeStyle = '#19324f';
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.beginPath();
    context.arc(64, 84, 5, Math.PI * 1.08, Math.PI * 1.92);
    context.stroke();
    context.strokeStyle = '#a94453';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(49, 60); context.lineTo(59, 62);
    context.moveTo(69, 62); context.lineTo(79, 60);
    context.stroke();
  } else if (mood === 'serious') {
    drawEye(context, 55, 70, -0.2, 2.4);
    drawEye(context, 73, 70, 0.2, 2.4);
    context.strokeStyle = '#102541';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(47, 59); context.lineTo(60, 64);
    context.moveTo(68, 64); context.lineTo(81, 59);
    context.moveTo(56, 87); context.quadraticCurveTo(64, 82, 72, 87);
    context.stroke();
  } else if (mood === 'worried') {
    drawEye(context, 55, 69, 0, -0.6);
    drawEye(context, 73, 69, 0, -0.6);
    context.strokeStyle = '#163353';
    context.lineWidth = 2.6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(48, 61); context.quadraticCurveTo(54, 54, 61, 60);
    context.moveTo(67, 60); context.quadraticCurveTo(74, 54, 80, 61);
    context.moveTo(57, 87); context.quadraticCurveTo(64, 82, 71, 87);
    context.stroke();
  } else if (mood === 'repel') {
    drawEye(context, 55, 69, -0.5);
    drawEye(context, 73, 69, -0.5);
    context.strokeStyle = '#102541';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(50, 59); context.lineTo(60, 63);
    context.moveTo(68, 63); context.lineTo(78, 59);
    context.stroke();
    context.fillStyle = '#102541';
    context.beginPath(); context.ellipse(64, 84, 4.2, 5.5, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath(); context.arc(64, 82.5, 1.5, 0, Math.PI * 2); context.fill();
  } else if (mood === 'celebrate') {
    drawEye(context, 55, 69, 0);
    drawEye(context, 73, 69, 0);
    context.strokeStyle = '#143353';
    context.lineWidth = 3;
    context.beginPath(); context.arc(64, 78, 7, 0.15, Math.PI - 0.15); context.stroke();
    for (const [x, y, rotation] of [[16, 78, 0], [112, 77, Math.PI / 4], [64, 6, Math.PI / 8]] as const) {
      context.save(); context.translate(x, y); context.rotate(rotation);
      context.fillStyle = '#ffe18a'; context.beginPath(); context.moveTo(0, -6); context.lineTo(2, -1); context.lineTo(7, 0); context.lineTo(2, 2); context.lineTo(0, 7); context.lineTo(-2, 2); context.lineTo(-7, 0); context.lineTo(-2, -1); context.closePath(); context.fill();
      context.restore();
    }
  } else {
    drawEye(context, 55, 69, look);
    drawEye(context, 73, 69, look);
    context.strokeStyle = '#163353';
    context.lineWidth = 2.8;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(56, 80);
    context.quadraticCurveTo(64, mood === 'attract' ? 90 : 87, 72, 80);
    context.stroke();
    context.fillStyle = mood === 'attract' ? 'rgba(255,133,139,.72)' : 'rgba(255,147,152,.38)';
    context.beginPath(); context.ellipse(47, 78, 4, 2.3, -0.15, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(81, 78, 4, 2.3, 0.15, 0, Math.PI * 2); context.fill();
  }

  if (isElectric) {
    context.strokeStyle = '#aaffff';
    context.lineWidth = 2.2;
    context.lineJoin = 'round';
    context.shadowColor = '#64edff';
    context.shadowBlur = 5;
    context.beginPath();
    context.moveTo(18, 54); context.lineTo(24, 48); context.lineTo(22, 58); context.lineTo(29, 54);
    context.moveTo(110, 55); context.lineTo(104, 49); context.lineTo(106, 59); context.lineTo(99, 55);
    context.stroke();
    context.shadowBlur = 0;
  }
  context.restore();
}

function drawCoin(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 12, 32, 32, 34);
  glow.addColorStop(0, 'rgba(255,225,121,.3)'); glow.addColorStop(0.58, 'rgba(255,181,45,.13)'); glow.addColorStop(1, 'rgba(255,163,39,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  const disc = (x: number, y: number, radius: number): void => {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  };
  // Offset lower disc gives the coin a metallic sidewall without an inked contour.
  context.fillStyle = fillLinear(context, 12, 12, 52, 57, ['#ffd65c', '#d78718', '#87400e']);
  disc(32, 33.8, 22.8);
  context.fillStyle = fillLinear(context, 12, 8, 50, 53, ['#fff7b0', '#ffc52f', '#d87810']);
  disc(32, 31.5, 21.8);
  context.save();
  context.beginPath(); context.arc(32, 31.5, 21.8, 0, Math.PI * 2); context.clip();
  const lowerShade = context.createLinearGradient(0, 29, 0, 54);
  lowerShade.addColorStop(0, 'rgba(130,62,9,0)'); lowerShade.addColorStop(1, 'rgba(130,62,9,.26)');
  context.fillStyle = lowerShade; context.fillRect(9, 29, 46, 25);
  context.restore();

  // Embossed center star stays crisp and readable without an inked outline.
  context.save(); context.translate(32, 32); context.rotate(-0.12);
  const star = (radius: number): void => {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const pointRadius = index % 2 === 0 ? radius : radius * 0.46;
      const x = Math.cos(angle) * pointRadius;
      const y = Math.sin(angle) * pointRadius;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
  };
  context.translate(0, 0.9); star(12.2); context.fillStyle = '#a95c10'; context.fill();
  context.translate(0, -1.2); star(12.2); context.fillStyle = '#fff1a0'; context.fill();
  context.restore();
  context.fillStyle = 'rgba(255,255,255,.92)'; context.beginPath(); context.ellipse(21, 15, 5.2, 2.1, -0.65, 0, Math.PI * 2); context.fill();
}

function drawCrystal(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 8, 32, 32, 34);
  glow.addColorStop(0, 'rgba(167,255,255,.46)'); glow.addColorStop(0.52, 'rgba(69,220,255,.24)'); glow.addColorStop(1, 'rgba(50,122,255,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  const traceStar = (outerRadius: number, innerRadius: number): void => {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
  };
  context.save(); context.translate(32, 32); context.translate(0, 1.2);
  traceStar(27, 13);
  context.fillStyle = '#1269bd'; context.fill();
  context.restore();
  context.save();
  context.translate(32, 32);
  context.rotate(0.08);
  traceStar(27, 12);
  context.fillStyle = fillLinear(context, -19, -25, 20, 25, ['#ffffff', '#6ff5ff', '#2588ee']);
  context.fill();
  context.save();
  traceStar(27, 12);
  context.clip();
  context.beginPath();
  context.moveTo(0, -26); context.lineTo(4, -5); context.lineTo(0, 0); context.lineTo(-5, -7); context.closePath();
  context.fillStyle = 'rgba(255,255,255,.52)';
  context.fill();
  context.beginPath();
  context.moveTo(0, 0); context.lineTo(25, 8); context.lineTo(11, 10); context.lineTo(4, 25); context.closePath();
  context.fillStyle = 'rgba(7,91,190,.28)';
  context.fill();
  context.restore();
  context.restore();
  context.fillStyle = 'rgba(255,255,255,.94)';
  context.beginPath(); context.ellipse(23, 15, 4.5, 2, -0.65, 0, Math.PI * 2); context.fill();
}

function drawBattery(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 5, 32, 32, 31);
  glow.addColorStop(0, 'rgba(111,255,193,.44)'); glow.addColorStop(1, 'rgba(46,186,154,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.save(); context.shadowColor = 'rgba(91,255,195,.76)'; context.shadowBlur = 9;
  roundedRect(context, 11, 15, 42, 36, 9); context.fillStyle = '#102c3e'; context.fill();
  roundedRect(context, 13, 16, 37, 31, 7); context.fillStyle = fillLinear(context, 13, 17, 49, 49, ['#e8fff1', '#78efb7', '#18897d']); context.fill();
  context.lineWidth = 1.6; context.strokeStyle = '#caffdf'; context.stroke(); context.restore();
  roundedRect(context, 49, 25, 7, 14, 3); context.fillStyle = '#b8ffe2'; context.fill();
  roundedRect(context, 18, 21, 5, 20, 2); context.fillStyle = 'rgba(255,255,255,.46)'; context.fill();
  context.beginPath(); context.moveTo(36, 18); context.lineTo(27, 33); context.lineTo(34, 33); context.lineTo(29, 45); context.lineTo(41, 29); context.lineTo(35, 29); context.closePath();
  context.fillStyle = '#117669'; context.fill();
}

function drawShield(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 33, 5, 32, 33, 31);
  glow.addColorStop(0, 'rgba(99,255,215,.4)'); glow.addColorStop(1, 'rgba(42,189,183,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.save(); context.shadowColor = 'rgba(102,255,220,.76)'; context.shadowBlur = 10;
  context.beginPath(); context.moveTo(32, 7); context.lineTo(52, 16); context.lineTo(49, 36); context.quadraticCurveTo(46, 50, 32, 58); context.quadraticCurveTo(18, 50, 15, 36); context.lineTo(12, 16); context.closePath();
  context.fillStyle = fillLinear(context, 18, 10, 48, 55, ['#eafff8', '#6de7ce', '#167894']); context.fill();
  context.lineWidth = 2; context.strokeStyle = '#d1fff4'; context.stroke(); context.restore();
  context.beginPath(); context.moveTo(32, 14); context.lineTo(45, 20); context.lineTo(43, 35); context.quadraticCurveTo(41, 44, 32, 50); context.quadraticCurveTo(23, 44, 21, 35); context.lineTo(19, 20); context.closePath();
  context.fillStyle = 'rgba(17,83,112,.25)'; context.fill();
  context.fillStyle = '#f4fffc';
  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    const radius = index % 2 === 0 ? 10 : 4.5;
    const x = 32 + Math.cos(angle) * radius;
    const y = 30 + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.fill();
}

function drawGift(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 5, 32, 32, 35);
  glow.addColorStop(0, 'rgba(255,224,138,.7)');
  glow.addColorStop(0.52, 'rgba(186,120,255,.34)');
  glow.addColorStop(1, 'rgba(142,74,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);

  context.save();
  context.shadowColor = 'rgba(209,153,255,.9)';
  context.shadowBlur = 12;
  roundedRect(context, 12, 27, 40, 28, 7);
  context.fillStyle = fillLinear(context, 12, 27, 52, 55, ['#edceff', '#a765e9', '#5631a8']);
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = '#f5ddff';
  context.stroke();
  context.restore();

  roundedRect(context, 9, 20, 46, 13, 5);
  context.fillStyle = fillLinear(context, 10, 20, 54, 33, ['#fff1b0', '#ffbf57', '#dc7642']);
  context.fill();
  context.lineWidth = 1.8;
  context.strokeStyle = '#fff0c4';
  context.stroke();

  roundedRect(context, 28, 21, 8, 33, 3);
  context.fillStyle = '#6af2ed';
  context.fill();
  roundedRect(context, 13, 36, 38, 6, 2.5);
  context.fill();

  context.save();
  context.translate(32, 19);
  context.strokeStyle = '#8cf7f1';
  context.fillStyle = '#bbfff4';
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(-6, -5, 7, 4, -0.55, 0, Math.PI * 2);
  context.ellipse(6, -5, 7, 4, 0.55, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.fillStyle = '#fff5c5';
  context.beginPath();
  context.arc(20, 47, 2, 0, Math.PI * 2);
  context.arc(44, 47, 2, 0, Math.PI * 2);
  context.fill();
}

function drawBomb(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 35, 7, 32, 35, 32);
  glow.addColorStop(0, 'rgba(255,93,111,.54)'); glow.addColorStop(1, 'rgba(255,50,77,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.save(); context.shadowColor = 'rgba(255,70,92,.76)'; context.shadowBlur = 10;
  context.beginPath(); context.arc(31, 39, 21, 0, Math.PI * 2);
  context.fillStyle = fillLinear(context, 15, 17, 49, 57, ['#8c9db4', '#394c68', '#131e34']); context.fill();
  context.lineWidth = 2.4; context.strokeStyle = '#ff7382'; context.stroke(); context.restore();
  context.beginPath(); context.arc(31, 39, 15.5, 0.15, Math.PI - 0.15); context.strokeStyle = 'rgba(255,104,122,.76)'; context.lineWidth = 2.4; context.stroke();
  context.beginPath(); context.arc(31, 39, 15.5, Math.PI + 0.15, Math.PI * 2 - 0.15); context.strokeStyle = 'rgba(220,230,242,.72)'; context.lineWidth = 2.4; context.stroke();
  // Fuse is oversized and warm so the hazard reads by shape and value, not color alone.
  context.beginPath(); context.moveTo(29, 19); context.quadraticCurveTo(31, 12, 38, 12); context.lineTo(42, 9);
  context.strokeStyle = '#e8edf4'; context.lineWidth = 4; context.lineCap = 'round'; context.stroke();
  context.beginPath(); context.arc(45, 7, 5, 0, Math.PI * 2); context.fillStyle = '#ffb858'; context.fill();
  context.beginPath(); context.moveTo(49, 2); context.lineTo(54, -1); context.moveTo(51, 8); context.lineTo(58, 8); context.moveTo(46, 0); context.lineTo(47, -5);
  context.strokeStyle = '#fff3a5'; context.lineWidth = 2; context.stroke();
  context.beginPath(); context.ellipse(22, 29, 5, 3, -0.6, 0, Math.PI * 2); context.fillStyle = 'rgba(255,255,255,.48)'; context.fill();
  context.fillStyle = '#ffd4dc'; context.font = 'bold 12px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('!', 31, 40);
}

function drawSpark(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(16, 16, 1, 16, 16, 16);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.18, '#d8ffff'); glow.addColorStop(0.48, 'rgba(80,217,255,.74)'); glow.addColorStop(1, 'rgba(56,132,255,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 32, 32);
  context.fillStyle = 'rgba(255,255,255,.92)';
  context.beginPath(); context.moveTo(16, 4); context.lineTo(18, 14); context.lineTo(28, 16); context.lineTo(18, 18); context.lineTo(16, 28); context.lineTo(14, 18); context.lineTo(4, 16); context.lineTo(14, 14); context.closePath(); context.fill();
}

function drawArenaBackground(context: CanvasRenderingContext2D): void {
  const base = context.createLinearGradient(0, 0, 930, 540);
  base.addColorStop(0, '#0b1833'); base.addColorStop(0.5, '#101e3b'); base.addColorStop(1, '#10142c');
  context.fillStyle = base; context.fillRect(0, 0, 960, 540);

  const core = context.createRadialGradient(470, 264, 28, 480, 270, 440);
  core.addColorStop(0, 'rgba(58,119,160,.23)'); core.addColorStop(0.52, 'rgba(33,61,117,.10)'); core.addColorStop(1, 'rgba(4,8,21,.7)');
  context.fillStyle = core; context.fillRect(0, 0, 960, 540);

  // Fine circuit etching stays along the rim, leaving the center quiet for play.
  context.save();
  context.lineWidth = 1.2; context.strokeStyle = 'rgba(91,178,206,.13)';
  const traces: ReadonlyArray<readonly [number, number, number, number]> = [
    [28, 118, 86, 118], [86, 118, 112, 144], [934, 118, 876, 118], [876, 118, 850, 144],
    [28, 420, 90, 420], [90, 420, 115, 395], [934, 420, 872, 420], [872, 420, 847, 395],
  ];
  for (const [x1, y1, x2, y2] of traces) { context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); }
  for (const [x, y] of [[86, 118], [876, 118], [90, 420], [872, 420]] as const) {
    context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fillStyle = 'rgba(95,228,239,.24)'; context.fill();
  }
  context.restore();

  // Sparse light motes and tiny stars add depth without turning into noise.
  for (let index = 0; index < 54; index += 1) {
    const x = (index * 197 + 31) % 960;
    const y = (index * 113 + 47) % 540;
    const radius = index % 11 === 0 ? 1.25 : 0.62;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = index % 4 === 0 ? 'rgba(121,235,238,.46)' : 'rgba(192,220,255,.24)'; context.fill();
  }
  const vignette = context.createRadialGradient(480, 270, 185, 480, 270, 585);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(1,5,17,.46)');
  context.fillStyle = vignette; context.fillRect(0, 0, 960, 540);
}

function drawPortraitArenaBackground(context: CanvasRenderingContext2D): void {
  const base = context.createLinearGradient(0, 0, 0, 1200);
  base.addColorStop(0, '#0c1935'); base.addColorStop(0.48, '#101e3b'); base.addColorStop(1, '#10142c');
  context.fillStyle = base; context.fillRect(0, 0, 540, 1200);
  const core = context.createRadialGradient(270, 580, 35, 270, 580, 650);
  core.addColorStop(0, 'rgba(58,119,160,.22)'); core.addColorStop(0.6, 'rgba(33,61,117,.09)'); core.addColorStop(1, 'rgba(4,8,21,.66)');
  context.fillStyle = core; context.fillRect(0, 0, 540, 1200);
  context.save();
  context.strokeStyle = 'rgba(91,178,206,.14)'; context.lineWidth = 1.2;
  for (const y of [170, 346, 820, 1002]) {
    context.beginPath(); context.moveTo(18, y); context.lineTo(58, y); context.lineTo(80, y + 24); context.stroke();
    context.beginPath(); context.moveTo(522, y); context.lineTo(482, y); context.lineTo(460, y + 24); context.stroke();
    context.beginPath(); context.arc(59, y, 3, 0, Math.PI * 2); context.arc(481, y, 3, 0, Math.PI * 2);
    context.fillStyle = 'rgba(95,228,239,.22)'; context.fill();
  }
  context.restore();
  for (let index = 0; index < 88; index += 1) {
    const x = (index * 197 + 31) % 540;
    const y = (index * 113 + 47) % 1200;
    const radius = index % 13 === 0 ? 1.3 : 0.62;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = index % 4 === 0 ? 'rgba(121,235,238,.43)' : 'rgba(192,220,255,.22)'; context.fill();
  }
  const vignette = context.createRadialGradient(270, 600, 330, 270, 600, 870);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(1,5,17,.48)');
  context.fillStyle = vignette; context.fillRect(0, 0, 540, 1200);
}

export function magnetTextureKey(skin: MagnetSkin, mood: MagnetMood = 'idle'): string {
  return mood === 'idle' ? `magnet-${skin}` : `magnet-${skin}-${mood}`;
}

export function createGameArt(manager: Phaser.Textures.TextureManager): void {
  addCanvasTexture(manager, 'arena-background', 960, 540, drawArenaBackground);
  addCanvasTexture(manager, 'arena-background-portrait', 540, 1200, drawPortraitArenaBackground, 1.5);
  const skins: readonly MagnetSkin[] = ['classic', 'electric', 'gold'];
  const moods: readonly MagnetMood[] = ['idle', 'attract', 'repel', 'hurt', 'celebrate', 'worried', 'serious'];
  for (const skin of skins) for (const mood of moods) {
    addCanvasTexture(manager, magnetTextureKey(skin, mood), 128, 128, (context) => drawMagnet(context, skin, mood));
  }
  addCanvasTexture(manager, 'item-coin', 64, 64, drawCoin, 4);
  addCanvasTexture(manager, 'item-crystal', 64, 64, drawCrystal, 4);
  addCanvasTexture(manager, 'item-battery', 64, 64, drawBattery);
  addCanvasTexture(manager, 'item-shield', 64, 64, drawShield);
  addCanvasTexture(manager, 'item-gift', 64, 64, drawGift);
  addCanvasTexture(manager, 'item-bomb', 64, 64, drawBomb);
  addCanvasTexture(manager, 'item-training', 64, 64, (context) => {
    drawBomb(context);
    context.beginPath(); context.arc(32, 38, 23, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(87,246,255,.98)'; context.lineWidth = 3; context.setLineDash([4, 4]); context.stroke(); context.setLineDash([]);
    context.fillStyle = '#a8ffff'; context.font = 'bold 12px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('i', 32, 39);
  });
  // Keep transparent textures for target collision sprites; targets are no longer drawn.
  addCanvasTexture(manager, 'target', 96, 96, () => {});
  addCanvasTexture(manager, 'target-gold', 96, 96, () => {});
  addCanvasTexture(manager, 'spark', 32, 32, drawSpark);
}
