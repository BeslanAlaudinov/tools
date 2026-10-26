// GLSL ES 1.0 (WebGL 1) so the globe runs on every browser and GPU we care about.

export const POINTS_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aInfo;
attribute float aHi;
uniform mat3 uRot;
uniform vec2 uScale, uOff;
uniform float uSide, uPx, uEdge, uTime, uGlowScale;
uniform float uOceanSize, uOceanAlpha, uBackAlpha;
uniform float uShimmer, uShimmerSpeed;
uniform vec4 uWaves[4];
uniform int uFx;
uniform float uFxAmt, uFxWidth, uFxRange, uFxPhase;
uniform int uColorMode;
uniform vec3 uColA, uColB, uOceanCol, uFxCol, uHiCol, uNightCol, uSun;
uniform float uFlowFreq, uFlowPhase, uAnyHi, uHiSize, uHiDim, uDayNight, uNightDim, uNightSoft;
varying vec3 vCol;
varying float vAlpha, vBright, vSize, vLevel;
void main() {
  vec3 p = uRot * aPos;
  float side = p.z >= 0.0 ? 1.0 : -1.0;
  if (side != uSide) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float land = aInfo.x, rnd = aInfo.y, facing = abs(p.z);
  float size = uPx * mix(1.0, 0.3 + 0.7 * facing, uEdge);
  float tw = 0.5 + 0.5 * sin(uTime * uShimmerSpeed * (0.6 + rnd * 1.8) * 3.0 + rnd * 61.0);
  float bright = mix(1.0, 0.2 + 1.2 * tw * tw, uShimmer);
  // overlay effect: 1 waves (points / view center / markers), 2 radar, 3 scanner, 4 meridian band, 5 breathing
  float fx = 0.0;
  if (uFx == 1) {
    for (int i = 0; i < 4; i++) {
      vec4 w = uWaves[i];
      if (w.w < 0.0) continue;
      float d = acos(clamp(dot(aPos, w.xyz), -1.0, 1.0));
      fx = max(fx, exp(-pow((d - w.w * uFxRange) / uFxWidth, 2.0)) * (1.0 - w.w));
    }
  } else if (uFx == 2) {
    float dl = mod(uFxPhase * 6.2831853 - 3.1415927 - atan(p.x, p.z), 6.2831853);
    fx = exp(-dl / uFxWidth);
  } else if (uFx == 3) {
    fx = exp(-pow((p.y - (1.2 - 2.4 * uFxPhase)) / uFxWidth, 2.0));
  } else if (uFx == 4) {
    float d = mod(atan(aPos.x, aPos.z) - uFxPhase * 6.2831853 + 3.1415927, 6.2831853) - 3.1415927;
    fx = exp(-pow(d / uFxWidth, 2.0));
  } else if (uFx == 5) {
    fx = 0.5 - 0.5 * cos(uFxPhase * 6.2831853);
  }
  float hl = clamp(fx * uFxAmt, 0.0, 1.0);
  float t = 0.0;
  if (uColorMode == 1) t = 1.0 - facing;
  else if (uColorMode == 2) t = aPos.y * 0.5 + 0.5;
  else if (uColorMode == 3) t = 0.5 + 0.5 * sin(atan(aPos.x, aPos.z) * uFlowFreq + aPos.y * uFlowFreq * 0.8 + uFlowPhase);
  else if (uColorMode == 4) t = rnd;
  vec3 col = mix(uColA, uColB, t);
  float alpha = side < 0.0 ? uBackAlpha : 1.0;
  if (land < 0.5) { col = uOceanCol; size *= uOceanSize; alpha *= uOceanAlpha; }
  if (aHi > 0.5) { col = uHiCol; size *= uHiSize; }
  else if (uAnyHi > 0.5) alpha *= 1.0 - uHiDim;
  float night = uDayNight * smoothstep(uNightSoft, -uNightSoft, dot(aPos, uSun));
  col = mix(col, uNightCol, night);
  bright *= mix(1.0, 1.0 - uNightDim, night);
  col = mix(col, uFxCol, hl);
  size *= 1.0 + 0.5 * hl;
  bright *= 1.0 + 0.8 * hl;
  vCol = col; vAlpha = alpha; vBright = bright; vSize = size;
  vLevel = clamp(bright * 0.55 * (land < 0.5 ? 0.6 : 1.0), 0.0, 0.999);
  gl_Position = vec4(p.xy * uScale + uOff, 0.0, 1.0);
  gl_PointSize = max(1.0, size * uGlowScale);
}`;

export const POINTS_FS = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform int uShape;
uniform float uGlow, uGlowScale, uGlyphCount;
uniform sampler2D uGlyphs;
varying vec3 vCol;
varying float vAlpha, vBright, vSize, vLevel;
float sdf(vec2 q) {
  vec2 a = abs(q);
  if (uShape == 0) return length(q) - 1.0;
  if (uShape == 1) return max(a.x, a.y) - 0.86;
  if (uShape == 2) return abs(length(q) - 0.74) - 0.2;
  if (uShape == 3) return max(min(a.x, a.y) - 0.22, max(a.x, a.y) - 1.0);
  if (uShape == 4) return max(a.x * 0.866 + a.y * 0.5, a.y) - 0.9;
  if (uShape == 5) return (a.x + a.y) * 0.8 - 0.8;
  return max(a.x - 1.0, a.y - 0.26);
}
void main() {
  vec2 q = (gl_PointCoord * 2.0 - 1.0) * uGlowScale;
  float core;
  if (uShape == 7) {
    if (abs(q.x) > 1.0 || abs(q.y) > 1.0) core = 0.0;
    else {
      float gi = floor(vLevel * uGlyphCount);
      core = texture2D(uGlyphs, vec2((gi + q.x * 0.5 + 0.5) / uGlyphCount, q.y * 0.5 + 0.5)).a;
    }
  } else {
    float aa = 2.0 / max(vSize, 1.0);
    core = 1.0 - smoothstep(-aa, aa, sdf(q));
  }
  float halo = uGlow > 0.0 ? pow(max(0.0, 1.0 - length(q) / uGlowScale), 2.0) * uGlow * 0.9 : 0.0;
  float a = clamp(core + halo * (1.0 - core), 0.0, 1.0) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * min(vBright, 2.0) * a, a);
}`;

export const QUAD_VS = /* glsl */ `attribute vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }`;

export const QUAD_FS = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform int uPass, uBgMode;
uniform vec2 uRes, uOff;
uniform float uAspect, uR;
uniform vec3 uBg1, uBg2, uFill, uAtmo;
uniform float uFillA, uAtmoAmt, uAtmoW, uVig, uGrain, uSeed;
// Arithmetic hash (Dave Hoskins): unlike fract(sin(...)) it keeps its precision at large pixel coordinates,
// where the sin version shows streaks on many GPUs.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cp = uv * 2.0 - 1.0;
  vec2 sp = vec2((cp.x - uOff.x) * uAspect, cp.y - uOff.y) / uR;
  float d = length(sp);
  if (uPass == 0) {
    vec3 c = uBg1;
    if (uBgMode == 1) c = mix(uBg2, uBg1, uv.y);
    else if (uBgMode == 2) c = mix(uBg2, uBg1, clamp((d - 0.7) / 2.2, 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
  } else if (uPass == 1) {
    float px = 2.0 / (uRes.y * uR);
    float a = (1.0 - smoothstep(1.0 - px, 1.0 + px, d)) * uFillA;
    gl_FragColor = vec4(uFill * a, a);
  } else if (uPass == 2) {
    float g = d > 1.0 ? exp(-(d - 1.0) / uAtmoW) : pow(d, 14.0) * 0.6;
    g *= uAtmoAmt;
    gl_FragColor = vec4(uAtmo * g, g);
  } else if (uPass == 3) {
    float v = smoothstep(0.45, 1.45, length(cp * vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0)))) * uVig;
    gl_FragColor = vec4(0.0, 0.0, 0.0, v);
  } else {
    // film grain: zero-mean noise with a triangular spread, so the image keeps its brightness instead of
    // turning grey. Blending cannot add a negative color, so pass 4 adds the bright half and pass 5 subtracts the dark half.
    vec2 p = gl_FragCoord.xy + uSeed;
    float n = (hash(p) + hash(p + 71.7) - 1.0) * uGrain;
    float v = uPass == 4 ? max(n, 0.0) : max(-n, 0.0);
    gl_FragColor = vec4(vec3(v), 0.0);
  }
}`;
