  M.terrain.onBeforeCompile = (sh) => {
    sh.uniforms.uGrass = { value: grass.map }; sh.uniforms.uDirt = { value: dirt.map }; sh.uniforms.uSand = { value: sand.map }; sh.uniforms.uRock = { value: gravel.map };
    sh.vertexShader = 'attribute vec4 aW; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW; vTP = position; vTN = normal;');
    sh.fragmentShader = 'uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uSand; uniform sampler2D uRock; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 tg = texture2D(uGrass, vMapUv).rgb, td = texture2D(uDirt, vMapUv * 0.9).rgb, ts = texture2D(uSand, vMapUv * 0.8).rgb, tr = texture2D(uRock, vMapUv * 0.6).rgb;
        float macro = texture2D(uGrass, vMapUv * 0.043 + 0.31).g * 0.55 + texture2D(uGrass, vMapUv * 0.011).g * 0.45;
        vec4 w = vW;
        float desert = smoothstep(1950.0, 2350.0, vTP.x);
        float coast = max(step(vTP.x, -1020.0), step(2200.0, vTP.z));
        float sandK = coast * (1.0 - smoothstep(0.1, 1.5, vTP.y)) * (1.0 - w.w);
        w.y += w.x * desert * 0.45; w.z += w.x * desert * 0.55; w.x *= 1.0 - desert;
        w.z = mix(w.z, 1.0, sandK); w.x *= 1.0 - sandK; w.y *= 1.0 - sandK;
        vec3 sp = tg * w.x + td * w.y + ts * w.z + tr * w.w;
        diffuseColor.rgb *= sp * (0.78 + 0.5 * macro);`)
      .replace('#include <color_fragment>', `
#ifdef USE_COLOR
        diffuseColor.rgb *= mix(vColor.rgb, vec3(0.95), clamp(1.0 - w.x, 0.0, 1.0));
#endif
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.4, 0.92, 0.64), desert * (1.0 - w.w * 0.4));
        float snowN = smoothstep(0.35, 0.65, macro);
        float snow = smoothstep(226.0, 288.0, vTP.y + (snowN - 0.5) * 40.0) * smoothstep(0.5, 0.82, vTN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.8), snow);`);
  };
