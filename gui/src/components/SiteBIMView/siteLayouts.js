/**
 * Procedural 3D layout config for each site.
 *
 * buildings: box shells that form the building wireframe
 * zones:     one entry per zone in the site's zone array (same order as API/mock data)
 * camera:    initial camera position for this site
 * orbitTarget: the point OrbitControls rotates around
 *
 * isSlab: true → thin horizontal divider (floor slab), false/absent → wall/shell
 */
export const SITE_LAYOUTS = {
  // ── s1: Riverside Tower ───────────────────────────────────────────────────
  // Multi-story high-rise: 12 × 12h × 10 units
  // 4 floors (3 units each), plus roof slab and north/south exterior areas
  s1: {
    camera: { position: [22, 16, 22] },
    orbitTarget: [0, 5, 0],
    buildings: [
      // Main tower shell
      { position: [0, 6, 0],  size: [12, 12, 10] },
      // Floor slabs (thin horizontal dividers)
      { position: [0, 0,  0], size: [12, 0.15, 10], isSlab: true },
      { position: [0, 3,  0], size: [12, 0.15, 10], isSlab: true },
      { position: [0, 6,  0], size: [12, 0.15, 10], isSlab: true },
      { position: [0, 9,  0], size: [12, 0.15, 10], isSlab: true },
      { position: [0, 12, 0], size: [12, 0.15, 10], isSlab: true },
    ],
    zones: [
      // Zone A — Ground Level West
      { position: [-2.9, 1.5, 0],    size: [5.8, 3, 9.7] },
      // Zone B — Level 3 East Scaffolding (CRITICAL)
      { position: [2.9, 10.5, 0],    size: [5.8, 3, 9.7] },
      // Zone C — North Exterior (outside north wall)
      { position: [0, 4.5, -6.5],    size: [12, 3, 3] },
      // Zone D — South Parking / Staging (flat ground slab)
      { position: [0, 0.08, 8],      size: [14, 0.15, 3.5] },
      // Zone E — Level 2 Interior
      { position: [-0.5, 7.5, 0.5],  size: [5.5, 3, 5.5] },
    ],
  },

  // ── s2: Harbor Warehouse ──────────────────────────────────────────────────
  // Large single-story warehouse: 18 × 5h × 14 units
  // Two open bays + south access road
  s2: {
    camera: { position: [28, 16, 28] },
    orbitTarget: [0, 2, 0],
    buildings: [
      { position: [0, 2.5, 0], size: [18, 5, 14] },
    ],
    zones: [
      // Zone A — West Bay
      { position: [-5.5, 2.5, 0],  size: [7.5, 5, 13.8] },
      // Zone B — East Bay
      { position: [5.5, 2.5, 0],   size: [7.5, 5, 13.8] },
      // Zone C — South Access Road (flat slab, CRITICAL)
      { position: [2, 0.08, 9.5],  size: [16, 0.15, 3.5] },
    ],
  },

  // ── s3: Oakfield Homes Ph.2 ───────────────────────────────────────────────
  // Three clusters of residential units at different build stages
  s3: {
    camera: { position: [22, 14, 22] },
    orbitTarget: [0, 1, 0],
    buildings: [
      // Lots 14-17: framed structures (left cluster)
      { position: [-7, 1.75, 0], size: [5.5, 3.5, 5.5] },
      // Lots 18-21: cladding phase (centre cluster)
      { position: [0, 1.75, 0],  size: [5.5, 3.5, 5.5] },
      // Lots 22-28: foundation slab only (right cluster)
      { position: [8, 0.1, 0],   size: [8.5, 0.2, 7], isSlab: true },
    ],
    zones: [
      // Lots 14-17 — Framing
      { position: [-7, 1.75, 0], size: [5.5, 3.5, 5.5] },
      // Lots 18-21 — Exterior cladding
      { position: [0, 1.75, 0],  size: [5.5, 3.5, 5.5] },
      // Lots 22-28 — Foundation (flat slab)
      { position: [8, 0.12, 0],  size: [8.5, 0.25, 7] },
    ],
  },
}
