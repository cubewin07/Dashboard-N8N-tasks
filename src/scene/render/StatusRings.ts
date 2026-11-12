import * as THREE from 'three'
import { visualLanguage } from '@/office/visualConfig'

const VERTEX = /* glsl */ `
attribute float aPulse;
attribute float aDashed;
uniform float uTime;
uniform float uPulseHz;
uniform float uPulseAmp;
varying vec2 vUv;
varying vec3 vColor;
varying float vDashed;
varying float vGlow;
void main() {
  float p = aPulse >= 0.0 ? 0.5 + 0.5 * sin(6.2831853 * (uPulseHz * uTime + aPulse)) : 0.0;
  vGlow = p * uPulseAmp;
  vec3 pos = position * (1.0 + vGlow);
  vUv = uv;
  vColor = instanceColor;
  vDashed = aDashed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform float uInner;
uniform float uOuter;
uniform float uHalf;
varying vec2 vUv;
varying vec3 vColor;
varying float vDashed;
varying float vGlow;
void main() {
  vec2 d = (vUv - 0.5) * 2.0 * uHalf;
  float r = length(d);
  float aa = fwidth(r) * 1.2;
  float a = smoothstep(uInner - aa, uInner + aa, r) * (1.0 - smoothstep(uOuter - aa, uOuter + aa, r));
  if (vDashed > 0.5) {
    float seg = fract(atan(d.y, d.x) / 6.2831853 * 12.0);
    a *= step(seg, 0.55);
  }
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * (1.0 + vGlow * 2.0), a);
  #include <colorspace_fragment>
}
`

const tmpMatrix = new THREE.Matrix4()

/**
 * Ground rings in the status colour (P05-T02, R1): one `InstancedMesh` for
 * the whole building. Steady by default; `ringPulse` statuses breathe at
 * `ring.pulseHz` (≤ 1 Hz); helping is dashed. Under reduced motion the pulse
 * amplitude uniform is 0.
 */
export class StatusRings {
  readonly mesh: THREE.InstancedMesh
  private readonly material: THREE.ShaderMaterial
  private readonly pulse: THREE.InstancedBufferAttribute
  private readonly dashed: THREE.InstancedBufferAttribute
  private readonly capacity: number
  private used = 0
  private time = 0

  constructor(capacity = 160) {
    this.capacity = capacity
    const { innerRadius, outerRadius, pulseHz, pulseAmount } = visualLanguage.ring
    const geometry = new THREE.PlaneGeometry(outerRadius * 2.4, outerRadius * 2.4)
    geometry.rotateX(-Math.PI / 2)
    this.pulse = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(-1), 1)
    this.dashed = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
    this.pulse.setUsage(THREE.DynamicDrawUsage)
    this.dashed.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aPulse', this.pulse)
    geometry.setAttribute('aDashed', this.dashed)
    this.material = new THREE.ShaderMaterial({
      name: 'status-rings',
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPulseHz: { value: pulseHz },
        uPulseAmp: { value: pulseAmount },
        uInner: { value: innerRadius },
        uOuter: { value: outerRadius },
        // The quad is 1.2 × the ring, so the pulse never clips at its edge.
        uHalf: { value: outerRadius * 1.2 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    this.mesh = new THREE.InstancedMesh(geometry, this.material, capacity)
    this.mesh.name = 'status-rings'
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1))
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    this.mesh.raycast = () => {}
    this.mesh.renderOrder = 2
  }

  /** Pulse amplitude in use (0 under reduced motion), for tests and E2E. */
  get pulseAmplitude(): number {
    return this.material.uniforms.uPulseAmp!.value as number
  }

  setReducedMotion(reduced: boolean): void {
    this.material.uniforms.uPulseAmp!.value = reduced ? 0 : visualLanguage.ring.pulseAmount
  }

  /** Animation time (s); stops while the office is paused. */
  advance(dt: number): void {
    this.time += dt
    this.material.uniforms.uTime!.value = this.time
  }

  begin(): void {
    this.used = 0
  }

  /** `pulsePhase` 0..1, or null for a steady ring. */
  push(x: number, y: number, z: number, color: THREE.Color, pulsePhase: number | null, dashed: boolean): void {
    if (this.used >= this.capacity) return
    const i = this.used
    tmpMatrix.makeTranslation(x, y, z)
    this.mesh.setMatrixAt(i, tmpMatrix)
    this.mesh.setColorAt(i, color)
    this.pulse.setX(i, pulsePhase ?? -1)
    this.dashed.setX(i, dashed ? 1 : 0)
    this.used += 1
  }

  end(): number {
    this.mesh.count = this.used
    this.mesh.visible = this.used > 0
    if (this.used > 0) {
      this.mesh.instanceMatrix.needsUpdate = true
      this.mesh.instanceColor!.needsUpdate = true
      this.pulse.needsUpdate = true
      this.dashed.needsUpdate = true
    }
    return this.used
  }

  get count(): number {
    return this.used
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mesh.dispose()
  }
}
