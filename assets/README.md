# Optional models

Put `.glb` files in `assets/models/` and describe them in `assets/models/manifest.json`. Anything listed replaces the generated model with the same id; anything missing keeps the procedural one.

```json
{
  "car:civa": { "file": "civa.glb", "scale": 1, "yaw": 0, "seat": { "x": 0.37, "y": 0.5, "z": -0.1 } }
}
```

Cars: forward is +Z, up is +Y, origin on the ground at the body centre. Name the wheel nodes `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
(origin at the axle, the wheel spins around its local X). Materials whose name contains `paint` or `body` take the vehicle colour;
names containing `glass` or `window` become the tinted glass.

# Textures

`assets/tex` holds 14 photo-scanned PBR textures, all CC0 from Poly Haven (polyhaven.com). `<key>.jpg` is the albedo (512 px, ambient occlusion baked in,
colour matched to the procedural texture it replaces) and `<key>_n.png` packs the tangent-space normal xy in R,G and the roughness in B.
`index.json` lists the source id and the real size in metres of each tile. Rebuild with `python tools/tex_fetch.py` then `python tools/tex_pack.py`.
Without the folder, or with `?nophoto=1`, the procedural textures in `src/world/textures.js` are used.
