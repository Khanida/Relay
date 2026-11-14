import * as THREE from 'three';

export function createConcreteFloorTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#23272e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concrete aggregate noise
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 28 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Expansion joint grid lines (subtle)
  ctx.strokeStyle = 'rgba(12, 15, 20, 0.7)';
  ctx.lineWidth = 2;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  // Fracture cracks
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.85)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 6; c++) {
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (Math.random() - 0.5) * 60;
      cy += (Math.random() - 0.5) * 60;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 6);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createIndustrialWallTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#363c46';
  ctx.fillRect(0, 0, 256, 256);

  // Panel ribbing
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(20, 23, 28, 0.45)';
    ctx.fillRect(x, 0, 6, 256);
    ctx.fillStyle = 'rgba(95, 105, 120, 0.25)';
    ctx.fillRect(x + 6, 0, 3, 256);
  }

  // Dust grime near bottom
  const grad = ctx.createLinearGradient(0, 128, 0, 256);
  grad.addColorStop(0, 'rgba(18, 20, 24, 0)');
  grad.addColorStop(1, 'rgba(18, 20, 24, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 128, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createHazardStripeTexture(
  primary = '#f59e0b',
  secondary = '#15181e',
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = primary;
  for (let i = -256; i < 512; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i + 24 + 256, 256);
    ctx.lineTo(i + 256, 256);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRobotOledTexture(): {
  texture: THREE.CanvasTexture;
  update: (batteryPct: number, mode: string) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const update = (batteryPct: number, mode: string) => {
    ctx.fillStyle = '#070b10';
    ctx.fillRect(0, 0, 256, 128);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 120);

    ctx.fillStyle = '#9ba3b0';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('RELAY-01', 16, 32);

    ctx.fillStyle = batteryPct > 25 ? '#10b981' : '#ef4444';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${Math.round(batteryPct)}%`, 166, 36);

    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(mode.toUpperCase().slice(0, 14), 16, 78);

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(16, 94, 224, 14);
    ctx.fillStyle = batteryPct > 25 ? '#f97316' : '#ef4444';
    ctx.fillRect(16, 94, Math.max(0, Math.min(224, (224 * batteryPct) / 100)), 14);

    texture.needsUpdate = true;
  };

  update(100, 'STANDBY');
  return { texture, update };
}
