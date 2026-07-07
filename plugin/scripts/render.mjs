// Pure procedural ASCII castle renderer — shared by the plugin CLI and the Cloudflare worker.
// A castle is a pure function of {name, monthTokens, streak, ratio, cacheRate}.

export const TIERS = [
  { min: 0,     name: "Camp",        range: "under 250k" },
  { min: 250e3, name: "Tent",        range: "250k-1M" },
  { min: 1e6,   name: "Watchtower",  range: "1M-3M" },
  { min: 3e6,   name: "Keep",        range: "3M-10M" },
  { min: 1e7,   name: "Walled keep", range: "10M-30M" },
  { min: 3e7,   name: "Castle",      range: "30M-100M" },
  { min: 1e8,   name: "High castle", range: "100M-300M" },
  { min: 3e8,   name: "Citadel",     range: "300M+" },
];

export function tierIndex(tokens) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (tokens >= TIERS[i].min) t = i;
  return t;
}

export function fmtTokens(t) {
  if (t >= 1e9) return (t / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (t >= 1e6) return (t / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (t >= 1e3) return Math.round(t / 1e3) + "k";
  return String(t);
}

// Season metric: raw spend scaled by efficiency (cache rate) and consistency (streak).
// A lean player with a hot cache and a long streak can out-castle a wasteful whale.
export function computeScore({ monthTokens, streak, cacheRate }) {
  return Math.round((monthTokens / 1e6) * (0.5 + cacheRate) * (1 + Math.min(streak, 30) / 30) * 100);
}

/* ---------- 5-row pixel font for the name banner ---------- */
const FONT = {
  A: [".##.", "#..#", "####", "#..#", "#..#"], B: ["###.", "#..#", "###.", "#..#", "###."],
  C: [".###", "#...", "#...", "#...", ".###"], D: ["###.", "#..#", "#..#", "#..#", "###."],
  E: ["####", "#...", "###.", "#...", "####"], F: ["####", "#...", "###.", "#...", "#..."],
  G: [".###", "#...", "#.##", "#..#", ".##."], H: ["#..#", "#..#", "####", "#..#", "#..#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],     J: ["..##", "...#", "...#", "#..#", ".##."],
  K: ["#..#", "#.#.", "##..", "#.#.", "#..#"], L: ["#...", "#...", "#...", "#...", "####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: [".##.", "#..#", "#..#", "#..#", ".##."], P: ["###.", "#..#", "###.", "#...", "#..."],
  Q: [".##.", "#..#", "#..#", "#.#.", ".#.#"], R: ["###.", "#..#", "###.", "#.#.", "#..#"],
  S: [".###", "#...", ".##.", "...#", "###."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  U: ["#..#", "#..#", "#..#", "#..#", ".##."], V: ["#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"], X: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#.."], Z: ["####", "...#", "..#.", ".#..", "####"],
  "0": [".##.", "#..#", "#..#", "#..#", ".##."], "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": [".##.", "#..#", "..#.", ".#..", "####"], "3": ["###.", "...#", ".##.", "...#", "###."],
  "4": ["#..#", "#..#", "####", "...#", "...#"], "5": ["####", "#...", "###.", "...#", "###."],
  "6": [".##.", "#...", "###.", "#..#", ".##."], "7": ["####", "...#", "..#.", ".#..", ".#.."],
  "8": [".##.", "#..#", ".##.", "#..#", ".##."], "9": [".##.", "#..#", ".###", "...#", ".##."],
  " ": ["..", "..", "..", "..", ".."],
};

export function nameArt(name) {
  const rows = ["", "", "", "", ""];
  for (const ch of name) {
    const g = FONT[ch];
    if (!g) continue;
    for (let r = 0; r < 5; r++)
      rows[r] += g[r].replace(/\./g, " ").replace(/#/g, "█") + "  ";
  }
  return rows.map(r => r.replace(/\s+$/, "")).join("\n");
}

/* ---------- seeded rng from name ---------- */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ---------- character grid ---------- */
function makeGrid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(" "));
}
function put(g, x, y, ch) {
  if (y < 0 || y >= g.length || x < 0 || x >= g[0].length) return;
  g[y][x] = ch;
}
function text(g, x, y, s) {
  for (let i = 0; i < s.length; i++) put(g, x + i, y, s[i]);
}
function merlons(w) {
  // crenellated top: solid teeth (█) with gaps, always solid at both ends
  const a = [];
  for (let i = 0; i < w; i++) a.push(i % 2 === 0 ? "█" : " ");
  a[0] = "█"; a[w - 1] = "█";
  return a.join("");
}
function drawBody(g, x0, x1, topY, botY, R, windows) {
  text(g, x0, topY, merlons(x1 - x0 + 1));
  for (let y = topY + 1; y <= botY; y++) {
    // solid stone wall, with occasional darker courses for texture
    for (let x = x0; x <= x1; x++) {
      const t = R();
      put(g, x, y, t < 0.06 ? "▓" : t < 0.12 ? "▒" : "█");
    }
  }
  if (windows) {
    const cx = (x0 + x1) >> 1;
    for (let y = topY + 2; y <= botY - 2; y += 3) {
      put(g, cx, y, "░");
      put(g, cx, y + 1, "░");
    }
  }
}
function drawTower(g, cx, w, h, groundY, R, windows) {
  const x0 = cx - (w >> 1);
  drawBody(g, x0, x0 + w - 1, groundY - h, groundY - 1, R, windows);
}
function drawFlag(g, cx, topY, wide) {
  put(g, cx, topY - 1, "█");
  put(g, cx, topY - 2, "█");
  text(g, cx + 1, topY - 2, wide ? "███" : "██");
}
function drawGate(g, cx, groundY, w5) {
  if (w5) {
    text(g, cx - 2, groundY - 3, "█████");
    text(g, cx - 2, groundY - 2, "█░░░█");
    text(g, cx - 2, groundY - 1, "█░░░█");
  } else {
    text(g, cx - 1, groundY - 2, "███");
    text(g, cx - 1, groundY - 1, "█░█");
  }
}
function drawStreakBanner(g, cx, topY, streak) {
  const n = String(streak).padStart(2, " ");
  text(g, cx - 2, topY + 2, "████");
  text(g, cx - 2, topY + 3, "█" + n + "█");
  text(g, cx - 2, topY + 4, "▀▀▀▀");
}
function drawTent(g, cx, groundY, big) {
  if (big) {
    text(g, cx - 1, groundY - 3, "▟█▙");
    text(g, cx - 2, groundY - 2, "▟███▙");
    text(g, cx - 3, groundY - 1, "▟██░██▙");
  } else {
    text(g, cx - 1, groundY - 2, "▟█▙");
    text(g, cx - 2, groundY - 1, "▟█░█▙");
  }
}
function drawCampfire(g, x, groundY) {
  put(g, x, groundY - 2, "*");
  text(g, x - 1, groundY - 1, "▄▄▄");
}
// scattered trees on the grounds — more greenery as the estate grows
function drawFlora(g, W, groundY, tier, name) {
  const R = rng(hash(name + "|flora"));
  const count = 1 + tier + Math.floor(R() * 3);
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(R() * (W - 4));
    if (g[groundY - 1][x] !== " " || g[groundY - 1][x - 1] !== " " || g[groundY - 1][x + 1] !== " ") continue;
    put(g, x, groundY - 1, "♠");
    if (R() < 0.4 && g[groundY - 2][x] === " ") put(g, x, groundY - 2, "♠");
  }
}
// a few birds riding the wind above the walls
function drawBirds(g, W, name) {
  const R = rng(hash(name + "|birds"));
  const count = 1 + Math.floor(R() * 2);
  for (let i = 0; i < count; i++) {
    const x = 3 + Math.floor(R() * (W - 6));
    const y = 1 + Math.floor(R() * 3);
    if (g[y][x] === " " && g[y][x + 1] === " ") { put(g, x, y, "v"); }
  }
}

/* ---------- scene composition ---------- */
// p: { name, monthTokens, streak, ratio (output/input), cacheRate (0..1) }
export function buildCastle(p) {
  const tier = tierIndex(p.monthTokens);
  const ratio = p.ratio > 0 && isFinite(p.ratio) ? p.ratio : 1;
  const hb = Math.round(Math.min(Math.max(ratio - 1, 0), 2) * 3);        // 0..6 taller
  const wb = Math.round(Math.min(Math.max(1 / ratio - 1, 0), 2) * 3.5);  // 0..7 wider per side
  const towerW = 7, towerH = 7 + hb;
  const keepW = tier >= 7 ? 17 : tier >= 5 ? 15 : 13;
  const keepH = towerH + (tier >= 7 ? 10 : tier === 6 ? 8 : 4);
  // Real Claude Code traffic is cache-dominated (90%+ is typical), so the moat
  // rewards the top of the realistic range: 80% moat, 90% wide moat, 96% shield.
  const cacheTier = p.cacheRate >= 0.96 ? 3 : p.cacheRate >= 0.9 ? 2 : p.cacheRate >= 0.8 ? 1 : 0;

  let W, tallest;
  if (tier === 0) { W = 30; tallest = 5; }
  else if (tier === 1) { W = 34; tallest = 7; }
  else if (tier === 2) { W = 34; tallest = 8 + hb; }
  else if (tier === 3) { W = 40; tallest = keepH; }
  else if (tier === 4) { W = keepW + 2 * (9 + wb) + 14; tallest = keepH; }
  else if (tier === 5) { W = 2 * towerW + (22 + 2 * wb) + 12; tallest = keepH; }
  else if (tier === 6) { W = 2 * towerW + (38 + 2 * wb) + 12; tallest = keepH; }
  else { W = 2 * towerW + (52 + 2 * wb) + 12; tallest = keepH; }

  const groundY = tallest + 4;
  const H = groundY + 3;
  const g = makeGrid(W, H);
  const R = rng(hash(p.name + "|castle"));
  const Rs = rng(hash(p.name + "|sky"));
  const cx = W >> 1;

  for (let y = 0; y < groundY; y++)
    for (let x = 0; x < W; x++)
      if (Rs() < 0.015) put(g, x, y, Rs() < 0.4 ? "*" : ".");

  for (let x = 0; x < W; x++) put(g, x, groundY, "▄");

  const tops = [];
  let keepTopY = null;

  if (tier === 0) {
    drawTent(g, cx - 3, groundY, false);
    drawCampfire(g, cx + 6, groundY);
    tops.push([cx - 3, groundY - 2]);
  } else if (tier === 1) {
    drawTent(g, cx, groundY, true);
    drawCampfire(g, cx + 8, groundY);
    tops.push([cx, groundY - 3]);
  } else if (tier === 2) {
    const h = 8 + hb;
    drawTower(g, cx, 5, h, groundY, R, true);
    put(g, cx, groundY - 1, "░"); // doorway
    tops.push([cx, groundY - h]);
  } else if (tier === 3) {
    drawTower(g, cx, keepW, keepH, groundY, R, true);
    drawGate(g, cx, groundY, false);
    keepTopY = groundY - keepH;
    tops.push([cx, keepTopY]);
  } else if (tier === 4) {
    const wl = 9 + wb, wallH = 3, bastW = 5, bastH = 5;
    const bl = cx - (keepW >> 1) - wl - 2, br = cx + (keepW >> 1) + wl + 2;
    drawBody(g, cx - (keepW >> 1) - wl, cx + (keepW >> 1) + wl, groundY - wallH, groundY - 1, R, false);
    drawTower(g, bl, bastW, bastH, groundY, R, false);
    drawTower(g, br, bastW, bastH, groundY, R, false);
    drawTower(g, cx, keepW, keepH, groundY, R, true);
    drawGate(g, cx, groundY, false);
    keepTopY = groundY - keepH;
    tops.push([cx, keepTopY], [bl, groundY - bastH], [br, groundY - bastH]);
  } else if (tier === 5) {
    const wallLen = 22 + 2 * wb, wallH = 4;
    const S = 2 * towerW + wallLen, x0 = cx - (S >> 1);
    const tl = x0 + (towerW >> 1), tr = x0 + S - 1 - (towerW >> 1);
    drawTower(g, cx, keepW, keepH, groundY, R, true);
    drawBody(g, x0, x0 + S - 1, groundY - wallH, groundY - 1, R, false);
    drawTower(g, tl, towerW, towerH, groundY, R, true);
    drawTower(g, tr, towerW, towerH, groundY, R, true);
    drawGate(g, cx, groundY, true);
    keepTopY = groundY - keepH;
    tops.push([cx, keepTopY], [tl, groundY - towerH], [tr, groundY - towerH]);
  } else if (tier === 6) {
    const wallLen = 38 + 2 * wb, wallH = 4;
    const S = 2 * towerW + wallLen, x0 = cx - (S >> 1);
    const tl = x0 + (towerW >> 1), tr = x0 + S - 1 - (towerW >> 1);
    const off = (keepW >> 1) + 7, il = cx - off, ir = cx + off, ih = towerH + 3;
    drawTower(g, cx, keepW, keepH, groundY, R, true);
    drawTower(g, il, towerW, ih, groundY, R, true);
    drawTower(g, ir, towerW, ih, groundY, R, true);
    drawBody(g, x0, x0 + S - 1, groundY - wallH, groundY - 1, R, false);
    drawTower(g, tl, towerW, towerH, groundY, R, true);
    drawTower(g, tr, towerW, towerH, groundY, R, true);
    drawGate(g, cx, groundY, true);
    keepTopY = groundY - keepH;
    tops.push([cx, keepTopY], [il, groundY - ih], [ir, groundY - ih],
      [tl, groundY - towerH], [tr, groundY - towerH]);
  } else {
    // citadel: keep + inner ring + mid towers + long outer wall
    const wallLen = 52 + 2 * wb, wallH = 5;
    const S = 2 * towerW + wallLen, x0 = cx - (S >> 1);
    const tl = x0 + (towerW >> 1), tr = x0 + S - 1 - (towerW >> 1);
    const off1 = (keepW >> 1) + 6, il = cx - off1, ir = cx + off1, ih = towerH + 5;
    const off2 = (keepW >> 1) + 15, ml = cx - off2, mr = cx + off2, mh = towerH + 2;
    drawTower(g, cx, keepW, keepH, groundY, R, true);
    drawTower(g, il, towerW, ih, groundY, R, true);
    drawTower(g, ir, towerW, ih, groundY, R, true);
    drawTower(g, ml, towerW, mh, groundY, R, true);
    drawTower(g, mr, towerW, mh, groundY, R, true);
    drawBody(g, x0, x0 + S - 1, groundY - wallH, groundY - 1, R, false);
    drawTower(g, tl, towerW, towerH, groundY, R, true);
    drawTower(g, tr, towerW, towerH, groundY, R, true);
    drawGate(g, cx, groundY, true);
    keepTopY = groundY - keepH;
    tops.push([cx, keepTopY], [il, groundY - ih], [ir, groundY - ih],
      [ml, groundY - mh], [mr, groundY - mh],
      [tl, groundY - towerH], [tr, groundY - towerH]);
  }

  const flags = Math.min(1 + Math.floor(p.streak / 5), tops.length);
  for (let i = 0; i < flags; i++) drawFlag(g, tops[i][0], tops[i][1], i === 0);
  if (p.streak >= 25 && keepTopY !== null && tier >= 3)
    drawStreakBanner(g, cx, keepTopY, p.streak);

  if (cacheTier >= 3 && tier >= 2)
    text(g, cx - 1, groundY - (tier >= 5 ? 5 : tier >= 3 ? 4 : 3), "(+)");

  // torches flanking the gate of the great castles
  if (tier >= 5) {
    for (const tx of [cx - 4, cx + 4]) {
      put(g, tx, groundY - 2, "▌");
      put(g, tx, groundY - 3, "'");
    }
  }

  drawFlora(g, W, groundY, tier, p.name);
  drawBirds(g, W, p.name);

  const moatRows = cacheTier >= 2 ? 2 : cacheTier === 1 ? 1 : 0;
  for (let m = 1; m <= moatRows; m++)
    for (let x = 1; x < W - 1; x++)
      put(g, x, groundY + m, R() < 0.35 ? "▒" : "░");
  if (cacheTier >= 2)
    for (let m = 1; m <= moatRows; m++)
      for (let x = cx - 2; x <= cx + 2; x++)
        put(g, x, groundY + m, "▓");

  const lines = g.map(row => row.join("").replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return { lines, tier, flags, cacheTier, hb, wb, width: W };
}

export function chronicle(p, s) {
  const tierPhrase = ["a humble camp", "a lone tent", "a watchtower", "a stone keep",
    "a walled keep", "a castle", "a high castle", "a mighty citadel"][s.tier];
  const bits = [`${s.flags} banner${s.flags === 1 ? "" : "s"} flying`];
  if (s.hb >= 3) bits.push("towers built tall on heavy output");
  if (s.wb >= 3) bits.push("a broad bastion of heavy input");
  if (s.cacheTier === 1) bits.push("ringed by a modest moat");
  else if (s.cacheTier === 2) bits.push("ringed by a wide moat, drawbridge down");
  else if (s.cacheTier === 3) bits.push("ringed by a wide moat and bearing the shield of efficiency");
  else bits.push("its ditch still dry");
  return `Here stands ${tierPhrase} of ${p.name} - ` + bits.join(", ") + ".";
}

// Full plain-text render: name banner + tier subtitle + castle, centered on the widest row.
export function castleText(p) {
  const s = buildCastle(p);
  const banner = nameArt(p.name).split("\n");
  const sub = `- ${TIERS[s.tier].name.toUpperCase()} -`;
  const bannerW = Math.max(...banner.map(l => l.length));
  const width = Math.max(s.width, bannerW, sub.length);
  // shift multi-line blocks by a constant pad so their internal alignment survives
  const pad = w => " ".repeat(Math.max(0, (width - w) >> 1));
  const bp = pad(bannerW), sp = pad(s.width);
  const out = [
    ...banner.map(l => bp + l), "",
    pad(sub.length) + sub, "",
    ...s.lines.map(l => sp + l),
  ];
  return { text: out.map(l => l.replace(/\s+$/, "")).join("\n"), scene: s };
}
