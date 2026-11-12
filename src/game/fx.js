// Particles, goo decals and flashes. Fixed-size pools drawn as a few meshes: effects never allocate during play.
import * as THREE from 'three';
import { G } from '../core/engine.js';

const N = 420, ND = 48;
export class Fx {
  constructor(scene) {
    // Particles: one Points cloud, square sprites, per-point colour and size. Dead points are parked far away.
    this.p = { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), size: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), s0: new Float32Array(N), next: 0 };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.p.col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(this.p.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { scale: { value: 500 } },
      vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vc; uniform float scale; void main(){ vc=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vc; void main(){ vec2 d=gl_PointCoord-0.5; float a=1.0-smoothstep(0.2,0.5,length(d)); gl_FragColor=vec4(vc*a,a); }',
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; scene.add(this.points);
    this.p.pos.fill(1e5);
    // Decals: goo splats that stay on walls and floors for a while.
    this.decals = []; const dg = new THREE.CircleGeometry(1, 7);
    for (let i = 0; i < ND; i++) { const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x22e6c8, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); m.visible = false; scene.add(m); this.decals.push({ m, life: 0 }); }
    this.dn = 0;
    this.light = new THREE.PointLight(0x40ffe0, 0, 14, 1.6); scene.add(this.light); this.lightT = 0;
    this._c = new THREE.Color();
  }
  // Burst of n particles at (x,y,z). o: color, speed, spread dir {x,y,z} (optional bias), life, size, grav, up
  burst(x, y, z, n, o = {}) {
    const p = this.p, c = this._c.set(o.color ?? 0xffffff), sp = o.speed ?? 4;
    for (let k = 0; k < n; k++) {
      const i = p.next; p.next = (p.next + 1) % N;
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), s = sp * (0.35 + Math.random() * 0.65);
      p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
      p.vel[i * 3] = Math.cos(a) * q * s + (o.dir ? o.dir.x * sp : 0); p.vel[i * 3 + 1] = u * s + (o.dir ? o.dir.y * sp : 0) + (o.up ?? 0); p.vel[i * 3 + 2] = Math.sin(a) * q * s + (o.dir ? o.dir.z * sp : 0);
      const f = 0.6 + Math.random() * 0.4; p.col[i * 3] = c.r * f; p.col[i * 3 + 1] = c.g * f; p.col[i * 3 + 2] = c.b * f;
      p.max[i] = p.life[i] = (o.life ?? 0.5) * (0.6 + Math.random() * 0.4); p.s0[i] = p.size[i] = (o.size ?? 0.12) * (0.6 + Math.random() * 0.8); p.grav[i] = o.grav ?? 9;
    }
  }
  // Goo splat on a surface with normal n.
  decal(x, y, z, nx, ny, nz, size = 0.3, color = 0x22e6c8) {
    const d = this.decals[this.dn]; this.dn = (this.dn + 1) % ND;
    d.m.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02); d.m.lookAt(x + nx, y + ny, z + nz); d.m.rotateZ(Math.random() * 6);
    d.m.scale.set(size * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), 1); d.m.material.color.set(color); d.m.material.opacity = 0.85; d.m.visible = true; d.life = 9;
  }
  flash(x, y, z, color, intensity = 6, time = 0.08) { this.light.position.set(x, y, z); this.light.color.set(color); this.light.intensity = intensity; this.lightT = time; this.lightMax = time; this.lightI = intensity; }
  update(dt) {
    const p = this.p;
    for (let i = 0; i < N; i++) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.pos[i * 3 + 1] = 1e5; p.size[i] = 0; continue; }
      p.vel[i * 3 + 1] -= p.grav[i] * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      p.size[i] = p.s0[i] * (p.life[i] / p.max[i]);
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.points.material.uniforms.scale.value = G.renderer.domElement.height * 0.9;
    for (const d of this.decals) if (d.life > 0) { d.life -= dt; if (d.life < 2) d.m.material.opacity = Math.max(0, d.life / 2) * 0.85; if (d.life <= 0) d.m.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = this.lightT > 0 ? this.lightI * (this.lightT / this.lightMax) : 0; }
  }
}
