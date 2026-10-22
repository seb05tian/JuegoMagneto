import Phaser from 'phaser';
import type { CosmeticId } from '../config/gameConfig';

type CanvasDraw = (context: CanvasRenderingContext2D) => void;
export type MagnetMood = 'idle' | 'attract' | 'repel' | 'hurt' | 'celebrate';
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
  const red = isGold ? ['#fff09e', '#ffad54', '#cc5c3b'] as const : METAL.red;
  const blue = isGold ? ['#fff4b0', '#f5d45c', '#af762c'] as const : isElectric ? ['#e5ffff', '#72fbff', '#3a8fe5'] as const : METAL.blue;
  const glowColor = mood === 'repel' ? 'rgba(255,117,90,.43)' : isGold ? 'rgba(255,194,86,.38)' : 'rgba(79,229,255,.38)';

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
}

function drawCoin(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 9, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255,223,135,.5)'); glow.addColorStop(1, 'rgba(255,163,39,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.save(); context.shadowColor = 'rgba(255,175,42,.78)'; context.shadowBlur = 9;
  context.beginPath(); context.arc(32, 32, 23, 0, Math.PI * 2);
  context.fillStyle = fillLinear(context, 10, 10, 54, 54, ['#fff8cb', '#e9a735', '#9c541c']); context.fill();
  context.restore();
  context.lineWidth = 2.3; context.strokeStyle = '#fff0a8'; context.stroke();
  context.beginPath(); context.arc(32, 32, 18.5, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(255,244,184,.94)'; context.lineWidth = 1.3; context.stroke();
  context.beginPath(); context.arc(32, 32, 15.4, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(117,64,25,.64)'; context.lineWidth = 1.1; context.stroke();
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI / 6;
    context.beginPath(); context.moveTo(32 + Math.cos(angle) * 20, 32 + Math.sin(angle) * 20);
    context.lineTo(32 + Math.cos(angle) * 22, 32 + Math.sin(angle) * 22);
    context.strokeStyle = 'rgba(255,255,220,.72)'; context.lineWidth = 1; context.stroke();
  }
  context.save(); context.translate(32, 32); context.rotate(-0.12);
  context.fillStyle = '#a85d20'; context.strokeStyle = 'rgba(255,241,168,.72)'; context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, -10); context.lineTo(2.7, -3.1); context.lineTo(10, -2.7); context.lineTo(4.5, 1.5);
  context.lineTo(6.4, 9); context.lineTo(0, 5); context.lineTo(-6.4, 9); context.lineTo(-4.5, 1.5);
  context.lineTo(-10, -2.7); context.lineTo(-2.7, -3.1); context.closePath(); context.fill(); context.stroke();
  context.restore();
  context.fillStyle = 'rgba(255,255,255,.86)'; context.beginPath(); context.ellipse(22, 17, 5, 2.3, -0.65, 0, Math.PI * 2); context.fill();
}

function drawCrystal(context: CanvasRenderingContext2D): void {
  const glow = context.createRadialGradient(32, 32, 5, 32, 32, 31);
  glow.addColorStop(0, 'rgba(124,244,255,.52)'); glow.addColorStop(1, 'rgba(50,122,255,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.save(); context.shadowColor = 'rgba(65,221,255,.8)'; context.shadowBlur = 10;
  context.beginPath(); context.moveTo(32, 6); context.lineTo(50, 22); context.lineTo(44, 46); context.lineTo(32, 57); context.lineTo(20, 46); context.lineTo(14, 22); context.closePath();
  context.fillStyle = fillLinear(context, 14, 8, 51, 53, ['#f4ffff', '#66e7ff', '#2577d9']); context.fill();
  context.lineWidth = 2; context.strokeStyle = '#e1ffff'; context.stroke(); context.restore();
  context.beginPath(); context.moveTo(32, 8); context.lineTo(33, 51); context.lineTo(18, 23); context.closePath();
  context.fillStyle = 'rgba(255,255,255,.58)'; context.fill();
  context.beginPath(); context.moveTo(33, 20); context.lineTo(48, 24); context.lineTo(42, 45); context.closePath();
  context.fillStyle = 'rgba(23,76,189,.34)'; context.fill();
  context.beginPath(); context.moveTo(22, 46); context.lineTo(32, 34); context.lineTo(42, 46); context.lineTo(32, 56); context.closePath();
  context.fillStyle = 'rgba(135,250,255,.42)'; context.fill();
  context.strokeStyle = 'rgba(255,255,255,.85)'; context.lineWidth = 1.8;
  context.beginPath(); context.moveTo(25, 18); context.lineTo(21, 25); context.stroke();
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

function drawTarget(context: CanvasRenderingContext2D, golden = false): void {
  const glowStart = golden ? 'rgba(255,215,107,.52)' : 'rgba(255,132,105,.44)';
  const glowEnd = golden ? 'rgba(255,190,61,0)' : 'rgba(255,70,94,0)';
  const glow = context.createRadialGradient(48, 48, 8, 48, 48, 47);
  glow.addColorStop(0, glowStart); glow.addColorStop(1, glowEnd);
  context.fillStyle = glow; context.fillRect(0, 0, 96, 96);
  context.save(); context.shadowColor = golden ? 'rgba(255,201,78,.82)' : 'rgba(255,86,101,.62)'; context.shadowBlur = golden ? 15 : 10;
  context.beginPath(); context.arc(48, 49, 38, 0, Math.PI * 2);
  context.fillStyle = '#182943'; context.fill(); context.lineWidth = 3; context.strokeStyle = golden ? '#ffe193' : '#94b0cd'; context.stroke(); context.restore();
  context.beginPath(); context.arc(48, 48, 33, 0, Math.PI * 2); context.fillStyle = '#dcecf4'; context.fill();
  context.beginPath(); context.arc(48, 48, 27, 0, Math.PI * 2); context.fillStyle = golden ? '#f5ad37' : '#ee5c70'; context.fill();
  context.beginPath(); context.arc(48, 48, 19, 0, Math.PI * 2); context.fillStyle = golden ? '#fff0bd' : '#f3e1d4'; context.fill();
  context.beginPath(); context.arc(48, 48, 11, 0, Math.PI * 2); context.fillStyle = golden ? '#f7b942' : '#ed6574'; context.fill();
  context.beginPath(); context.arc(48, 48, 5.5, 0, Math.PI * 2); context.fillStyle = '#ffda7d'; context.fill();
  context.strokeStyle = golden ? 'rgba(255,242,200,.85)' : 'rgba(255,255,255,.64)'; context.lineWidth = 1.2;
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    context.beginPath(); context.moveTo(48 + Math.cos(angle) * 39, 48 + Math.sin(angle) * 39);
    context.lineTo(48 + Math.cos(angle) * 45, 48 + Math.sin(angle) * 45); context.stroke();
  }
  roundedRect(context, 34, 81, 28, 13, 5);
  context.fillStyle = '#142943'; context.fill();
  context.strokeStyle = golden ? 'rgba(255,244,190,.96)' : 'rgba(255,222,172,.9)'; context.lineWidth = 1; context.stroke();
  context.fillStyle = golden ? '#ffe58b' : '#ffe0a0'; context.font = 'bold 9px system-ui, sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(golden ? '100' : '50', 48, 87.5);
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

  // Wide, low-contrast orbit lanes replace the former full-field graph paper.
  context.save();
  context.strokeStyle = 'rgba(121,185,220,.055)'; context.lineWidth = 1;
  for (let index = 0; index < 4; index += 1) {
    context.beginPath(); context.ellipse(480, 268, 208 + index * 91, 106 + index * 59, -0.14, 0.18 + index * 0.14, Math.PI * 1.88); context.stroke();
  }
  context.restore();

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
  context.strokeStyle = 'rgba(121,185,220,.052)'; context.lineWidth = 1;
  for (let index = 0; index < 5; index += 1) {
    context.beginPath(); context.ellipse(270, 590, 174 + index * 62, 240 + index * 138, -0.12, 0.18 + index * 0.12, Math.PI * 1.88); context.stroke();
  }
  context.restore();
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
  const moods: readonly MagnetMood[] = ['idle', 'attract', 'repel', 'hurt', 'celebrate'];
  for (const skin of skins) for (const mood of moods) {
    addCanvasTexture(manager, magnetTextureKey(skin, mood), 128, 128, (context) => drawMagnet(context, skin, mood));
  }
  addCanvasTexture(manager, 'item-coin', 64, 64, drawCoin);
  addCanvasTexture(manager, 'item-crystal', 64, 64, drawCrystal);
  addCanvasTexture(manager, 'item-battery', 64, 64, drawBattery);
  addCanvasTexture(manager, 'item-shield', 64, 64, drawShield);
  addCanvasTexture(manager, 'item-bomb', 64, 64, drawBomb);
  addCanvasTexture(manager, 'item-training', 64, 64, (context) => {
    drawBomb(context);
    context.beginPath(); context.arc(32, 38, 23, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(87,246,255,.98)'; context.lineWidth = 3; context.setLineDash([4, 4]); context.stroke(); context.setLineDash([]);
    context.fillStyle = '#a8ffff'; context.font = 'bold 12px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('i', 32, 39);
  });
  addCanvasTexture(manager, 'target', 96, 96, drawTarget);
  addCanvasTexture(manager, 'target-gold', 96, 96, (context) => drawTarget(context, true));
  addCanvasTexture(manager, 'spark', 32, 32, drawSpark);
}
