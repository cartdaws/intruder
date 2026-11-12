// The alien's flesh: translucent teal gel, brighter at glancing angles, with a slow inner shimmer.
// One shader for arms, torso, legs, spines and tongues so the whole body reads as one substance in both graphics modes.
import * as THREE from 'three';
const uTime = { value: 0 };
export const gelTime = uTime;
export function gelMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: o.depthWrite ?? true, side: o.side ?? THREE.FrontSide,
    uniforms: { time: uTime, base: { value: new THREE.Color(o.color ?? 0x0fa89a) }, rim: { value: new THREE.Color(o.rim ?? 0x9ffff0) }, opacity: { value: o.opacity ?? 0.78 }, glow: { value: o.glow ?? 0 }, flash: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time, opacity, glow, flash; uniform vec3 base, rim; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float sh = 0.5 + 0.5 * sin(vP.x * 9.0 + vP.y * 7.0 + vP.z * 8.0 + time * 1.6);
        vec3 c = base * (0.55 + 0.25 * sh) + rim * f * 0.9 + base * glow + vec3(0.7,1.0,0.95) * flash;
        gl_FragColor = vec4(c, clamp(opacity + f * 0.35 + flash * 0.3, 0.0, 1.0)); }`,
  });
}
