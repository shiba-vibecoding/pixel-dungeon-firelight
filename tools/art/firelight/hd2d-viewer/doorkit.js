function box(out, part, x0, y0, z0, x1, y1, z1, faces) {
  const corners = {
    S: [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    N: [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0],
    E: [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1],
    W: [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0],
    T: [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0]
  };
  const normals = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0], T: [0, 1, 0] };
  for (const f of ["S", "N", "E", "W", "T"]) {
    const d = faces[f];
    if (!d) continue;
    out.push({ pic: d.pic, blend: d.blend ?? "solid", p: corners[f], n: normals[f], flipU: !!d.flipU, flipV: !!d.flipV, part });
  }
}
function turn(qs, from, px, pz, a) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = from; i < qs.length; i++) {
    const q = qs[i];
    for (let k = 0; k < 12; k += 3) {
      const dx = q.p[k] - px, dz = q.p[k + 2] - pz;
      q.p[k] = px + dx * c - dz * s;
      q.p[k + 2] = pz + dx * s + dz * c;
    }
    const [nx, ny, nz] = q.n;
    q.n = [nx * c - nz * s, ny, nx * s + nz * c];
  }
}
function mirrorX(qs, from) {
  for (let i = from; i < qs.length; i++) {
    const q = qs[i];
    const p = q.p.map((v, k) => k % 3 === 0 ? 1 - v : v);
    q.p = [...p.slice(3, 6), ...p.slice(0, 3), ...p.slice(9, 12), ...p.slice(6, 9)];
    q.n = [-q.n[0], q.n[1], q.n[2]];
    q.flipU = !q.flipU;
  }
}
function stand(qs) {
  for (const q of qs) {
    for (let k = 0; k < 12; k += 3) {
      const x = q.p[k], z = q.p[k + 2];
      q.p[k] = z;
      q.p[k + 2] = 1 - x;
    }
    q.n = [q.n[2], q.n[1], -q.n[0]];
  }
}
function doorQuads(kit, o) {
  const qs = [];
  const P = kit.post.w;
  const top = o.cut ? kit.heights.frameTop.cut : kit.heights.frameTop.full;
  const sfx = o.cut ? "cut" : "";
  const L = kit.lintel;
  const post = { S: { pic: `post${sfx}_face` }, N: { pic: `post${sfx}_face` }, T: { pic: "post_top" } };
  box(qs, "frame", 0, 0, 0, P, top, 1, { ...post, E: { pic: `post${sfx}_side` } });
  box(qs, "frame", 1 - P, 0, 0, 1, top, 1, { ...post, W: { pic: `post${sfx}_side` } });
  for (const [z02, z12] of [[0, L.d], [1 - L.d, 1]]) {
    box(qs, "frame", P, top - L.h, z02, 1 - P, top, z12, { S: { pic: "lintel_face" }, N: { pic: "lintel_face" }, T: { pic: "lintel_top" } });
  }
  const T = kit.threshold;
  const lip = (T.l - 1) / 2;
  const sill = o.look === "locked" ? "threshold_locked" : o.look === "vault" ? "threshold_vault" : "threshold_plain";
  box(qs, "threshold", P, 0, -lip, 1 - P, T.h, 1 + lip, { T: { pic: sill }, S: { pic: "threshold_side" }, N: { pic: "threshold_side" }, E: { pic: "threshold_side" }, W: { pic: "threshold_side" } });
  if (o.look === "locked" || o.look === "vault") {
    const pic = o.look === "vault" ? "plaque_vault" : "plaque";
    const PL = kit.plaque, x0 = 0.5 - PL.w / 2, x1 = 0.5 + PL.w / 2, y0 = top - PL.h + PL.rise, y1 = top + PL.rise;
    box(qs, "lock", x0, y0, 1, x1, y1, 1 + PL.d, { S: { pic }, T: { pic: `${pic}_top` } });
    box(qs, "lock", x0, y0, -PL.d, x1, y1, 0, { N: { pic }, T: { pic: `${pic}_top` } });
  }
  const leafStart = qs.length;
  const barricade = o.look === "barricade" || o.look === "charred";
  const t = barricade ? kit.barricade.t : kit.leaf.t;
  const h = o.cut ? kit.leaf.h.cut : kit.leaf.h.full;
  const lift = kit.leaf.lift;
  const face = `${o.cut ? "leafcut" : "leaf"}_${o.look}`;
  const z0 = 0.5 - t / 2, z1 = 0.5 + t / 2;
  box(qs, "leaf", P, lift, z0, 1 - P, lift + h, z1, {
    S: { pic: face },
    N: { pic: face, flipU: true },
    T: { pic: `top_${o.look}` },
    E: { pic: o.cut ? "edgecut" : "edge" },
    W: { pic: o.cut ? "edgecut" : "edge" }
  });
  if (o.look === "locked") {
    const K = kit.padlock, x0 = kit.padlock.x - K.w / 2, x1 = x0 + K.w, y0 = lift + h * K.y, y1 = y0 + K.h;
    box(qs, "lock", x0, y0, z1, x1, y1, z1 + K.d, { S: { pic: "padlock" }, T: { pic: "padlock_top" }, E: { pic: "padlock_side" }, W: { pic: "padlock_side" } });
    box(qs, "lock", x0, y0, z0 - K.d, x1, y1, z0, { N: { pic: "padlock", flipU: true }, T: { pic: "padlock_top" }, E: { pic: "padlock_side" }, W: { pic: "padlock_side" } });
  }
  const shut = o.open <= 0;
  if (shut && o.light && !barricade) {
    const c = o.light;
    const lintelUnder = top - L.h;
    for (const [z, f] of [[z1 + 3e-3, "S"], [z0 - 3e-3, "N"]]) {
      box(qs, "light", P, T.h, f === "S" ? z - 1e-3 : z, 1 - P, lift + 0.03, f === "S" ? z : z + 1e-3, { [f]: { pic: `strip_${c}`, blend: "add" } });
      if (lintelUnder > lift + h + 0.01) box(qs, "light", P, lift + h, f === "S" ? 0.5 - 1e-3 : 0.5, 1 - P, lintelUnder, f === "S" ? 0.5 : 0.5 + 1e-3, { [f]: { pic: `transom_${c}`, blend: "add" } });
    }
    const S = kit.spill.l, y = T.h + 2e-3;
    box(qs, "light", P, y - 1e-3, z1, 1 - P, y, z1 + S, { T: { pic: `spill_${c}`, blend: "add" } });
    box(qs, "light", P, y - 1e-3, z0 - S, 1 - P, y, z0, { T: { pic: `spill_${c}`, blend: "add", flipV: true } });
  }
  if (o.open > 0) {
    const leafParts = qs.slice(leafStart).filter((q) => q.part === "leaf" || q.part === "lock");
    qs.length = leafStart;
    qs.push(...leafParts);
    turn(qs, leafStart, P, 0.5, (o.swingSouth ? 1 : -1) * o.open * Math.PI / 2);
  }
  if (o.hingeEast) mirrorX(qs, leafStart);
  if (!o.across) stand(qs);
  return qs;
}
function grateQuads(kit, open) {
  const qs = [];
  const G = kit.grate;
  box(qs, "grate", 0, G.y, 0, 1, G.y + G.t, 1, { T: { pic: "grate" }, S: { pic: "grate_side" }, E: { pic: "grate_side" }, W: { pic: "grate_side" } });
  const a = open * (100 * Math.PI) / 180;
  if (a > 0) {
    const c = Math.cos(a), s = Math.sin(a);
    for (const q of qs) {
      for (let k = 0; k < 12; k += 3) {
        const y = q.p[k + 1] - G.y, z = q.p[k + 2];
        q.p[k + 1] = G.y + y * c + z * s;
        q.p[k + 2] = -y * s + z * c;
      }
      q.n = [q.n[0], q.n[1] * c + q.n[2] * s, -q.n[1] * s + q.n[2] * c];
    }
  }
  return qs;
}
function crackQuads(kit, stage, across, height) {
  const qs = [];
  box(qs, "crack", 0, height, 0, 1, height + 3e-3, 1, { T: { pic: `crackcap${stage}` } });
  if (across) {
    box(qs, "crack", 0, 0, 1, 1, height, 1.003, { S: { pic: `crack${stage}`, flipV: false } });
  }
  if (!across) stand(qs);
  return qs;
}
function shoulderHeight(kit, height, doorNorthRunsNorthSouth) {
  return doorNorthRunsNorthSouth ? Math.min(height, kit.heights.shoulder) : height;
}
function uvOf(kit, q, w, h, part) {
  const [x, y, pw, ph] = kit.atlas[q.pic];
  let u0 = x / w, u1 = (x + pw) / w;
  let vTop = 1 - y / h, vBottom = 1 - (y + ph) / h;
  if (part) {
    const t = vTop, b = vBottom;
    vTop = b + (t - b) * part.v1;
    vBottom = b + (t - b) * part.v0;
  }
  if (q.flipU) [u0, u1] = [u1, u0];
  if (q.flipV) [vTop, vBottom] = [vBottom, vTop];
  return [u0, vBottom, u1, vTop];
}
export {
  crackQuads,
  doorQuads,
  grateQuads,
  shoulderHeight,
  uvOf
};
