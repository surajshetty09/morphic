// Grid resolution
export const GRID = 120;

// Height color zones (elevation 0-1)
export const BIOMES = [
  { max: 0.18, deep:   [8,  28,  60],  shallow: [12, 45, 90]  },  // Deep ocean
  { max: 0.28, deep:   [15, 55, 100], shallow: [20, 70, 120]  },  // Shallow water
  { max: 0.32, deep:   [194,178,128], shallow: [210,195,148]  },  // Beach/sand
  { max: 0.42, deep:   [80, 140, 60], shallow: [100,160, 75]  },  // Lowland grass
  { max: 0.58, deep:   [60, 120, 45], shallow: [75, 140, 60]  },  // Forest
  { max: 0.72, deep:   [100,90,  70], shallow: [130,115, 90]  },  // Highland
  { max: 0.84, deep:   [140,130,120], shallow: [170,160,150]  },  // Rocky
  { max: 1.00, deep:   [230,235,245], shallow: [255,255,255]  },  // Snow
];

export function heightToColor(h, slope = 0) {
  for (const b of BIOMES) {
    if (h <= b.max) {
      const t = slope * 0.6; // darker on steep slopes
      const r = b.deep[0] + (b.shallow[0] - b.deep[0]) * (1 - t);
      const g = b.deep[1] + (b.shallow[1] - b.deep[1]) * (1 - t);
      const bb = b.deep[2] + (b.shallow[2] - b.deep[2]) * (1 - t);
      return [Math.round(r), Math.round(g), Math.round(bb)];
    }
  }
  return [255, 255, 255];
}

// Smooth noise for initial terrain
function hash(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    hash(ix,   iy)   * (1-ux) * (1-uy) +
    hash(ix+1, iy)   * ux     * (1-uy) +
    hash(ix,   iy+1) * (1-ux) * uy     +
    hash(ix+1, iy+1) * ux     * uy
  );
}
function fbm(x, y, oct = 5) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * smoothNoise(x * f, y * f);
    a *= 0.5; f *= 2.1;
  }
  return v;
}

export function generateTerrain(seed = 0) {
  const h = new Float32Array(GRID * GRID);
  const sx = seed * 3.7, sy = seed * 2.1;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const nx = x / GRID * 4 + sx;
      const ny = y / GRID * 4 + sy;
      // Radial falloff so edges are ocean
      const cx = (x / GRID - 0.5) * 2;
      const cy = (y / GRID - 0.5) * 2;
      const falloff = 1 - Math.min(1, (cx*cx + cy*cy) * 0.7);
      h[y * GRID + x] = Math.max(0, Math.min(1, fbm(nx, ny) * falloff));
    }
  }
  return h;
}

export function flatTerrain() {
  const h = new Float32Array(GRID * GRID);
  h.fill(0.1); // All shallow ocean
  return h;
}

// Apply brush to heightmap
export function applyBrush(heights, cx, cy, radius, strength, mode) {
  const r2 = radius * radius;
  const ixMin = Math.max(0, Math.floor(cx - radius));
  const ixMax = Math.min(GRID - 1, Math.ceil(cx + radius));
  const iyMin = Math.max(0, Math.floor(cy - radius));
  const iyMax = Math.min(GRID - 1, Math.ceil(cy + radius));

  for (let y = iyMin; y <= iyMax; y++) {
    for (let x = ixMin; x <= ixMax; x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      const smooth = falloff * falloff * (3 - 2 * falloff); // smoothstep
      const delta = smooth * strength;
      const idx = y * GRID + x;
      if (mode === 'raise')   heights[idx] = Math.min(1, heights[idx] + delta);
      if (mode === 'lower')   heights[idx] = Math.max(0, heights[idx] - delta);
      if (mode === 'flatten') heights[idx] += (0.3 - heights[idx]) * smooth * strength * 5;
      if (mode === 'smooth') {
        // Average with neighbors
        let sum = 0, count = 0;
        for (let ny = Math.max(0,y-1); ny <= Math.min(GRID-1,y+1); ny++) {
          for (let nx = Math.max(0,x-1); nx <= Math.min(GRID-1,x+1); nx++) {
            sum += heights[ny*GRID+nx]; count++;
          }
        }
        heights[idx] += (sum/count - heights[idx]) * smooth * strength * 8;
      }
      if (mode === 'noise') {
        const n = (Math.random() - 0.5) * 2;
        heights[idx] = Math.max(0, Math.min(1, heights[idx] + n * delta));
      }
    }
  }
  return heights;
}

// Compute slope for shading
export function computeSlopes(heights) {
  const slopes = new Float32Array(GRID * GRID);
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const l = heights[y*GRID+(x-1)], r = heights[y*GRID+(x+1)];
      const u = heights[(y-1)*GRID+x], d = heights[(y+1)*GRID+x];
      slopes[y*GRID+x] = Math.min(1, Math.sqrt((r-l)**2 + (d-u)**2) * 4);
    }
  }
  return slopes;
}

// Render heightmap to ImageData pixels
export function renderTerrain(heights, slopes, imageData, W, H, waterAnim, lightAngle) {
  const data = imageData.data;
  const WATER_LINE = 0.28;

  // Light direction from angle
  const lx = Math.cos(lightAngle), ly = Math.sin(lightAngle);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Map pixel to grid
      const gx = (px / W) * (GRID - 1);
      const gy = (py / H) * (GRID - 1);
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = gx - ix, fy = gy - iy;

      // Bilinear interpolation
      const i00 = iy*GRID+ix, i10 = iy*GRID+Math.min(ix+1,GRID-1);
      const i01 = Math.min(iy+1,GRID-1)*GRID+ix, i11 = Math.min(iy+1,GRID-1)*GRID+Math.min(ix+1,GRID-1);
      const h = heights[i00]*(1-fx)*(1-fy) + heights[i10]*fx*(1-fy) +
                heights[i01]*(1-fx)*fy     + heights[i11]*fx*fy;
      const slope = slopes[i00]*(1-fx)*(1-fy) + slopes[i10]*fx*(1-fy) +
                    slopes[i01]*(1-fx)*fy     + slopes[i11]*fx*fy;

      let [r, g, b] = heightToColor(h, slope);

      // Hillshading
      const nx2 = (heights[iy*GRID+Math.min(ix+1,GRID-1)] - heights[iy*GRID+Math.max(ix-1,0)]) * 4;
      const ny2 = (heights[Math.min(iy+1,GRID-1)*GRID+ix] - heights[Math.max(iy-1,0)*GRID+ix]) * 4;
      const nz = 1.0;
      const len = Math.sqrt(nx2*nx2 + ny2*ny2 + nz*nz);
      const shade = Math.max(0.35, (nx2/len * lx + ny2/len * ly + nz/len * 0.6));
      r = Math.round(r * shade); g = Math.round(g * shade); b = Math.round(b * shade);

      // Water shimmer
      if (h < WATER_LINE) {
        const shimmer = Math.sin(px * 0.15 + waterAnim * 2.1) * Math.cos(py * 0.13 + waterAnim * 1.7);
        const wDepth = 1 - h / WATER_LINE;
        const wAlpha = 0.55 + shimmer * 0.08;
        const wr = 10 + shimmer * 15, wg = 40 + shimmer * 20, wb = 100 + wDepth * 60 + shimmer * 20;
        r = Math.round(r * (1-wAlpha) + wr * wAlpha);
        g = Math.round(g * (1-wAlpha) + wg * wAlpha);
        b = Math.round(b * (1-wAlpha) + wb * wAlpha);
      }

      const pi = (py * W + px) * 4;
      data[pi]   = Math.max(0,Math.min(255,r));
      data[pi+1] = Math.max(0,Math.min(255,g));
      data[pi+2] = Math.max(0,Math.min(255,b));
      data[pi+3] = 255;
    }
  }
}
