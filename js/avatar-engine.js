/**
 * Evalis AI — Premium WebGL Avatar Engine
 * Three.js + GLSL audio-reactive sphere with state-driven visuals
 * 
 * States: idle | speaking | listening | processing
 * Hooks into existing Web Audio API analyser for real-time audio reactivity
 * 
 * Usage:
 *   const avatar = new AvatarEngine(document.getElementById('ai-avatar-canvas'));
 *   avatar.setState('speaking');
 *   avatar.setAmplitude(0.7);   // 0-1
 *   avatar.destroy();
 */

const AVATAR_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uNoiseScale;
  uniform float uDisplacementStrength;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simplex-like 3D noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    // Multi-octave noise for organic displacement
    float noise1 = snoise(position * uNoiseScale + uTime * 0.3);
    float noise2 = snoise(position * uNoiseScale * 2.0 + uTime * 0.5) * 0.5;
    float noise3 = snoise(position * uNoiseScale * 4.0 + uTime * 0.8) * 0.25;

    float totalNoise = (noise1 + noise2 + noise3) * uDisplacementStrength;

    // Audio amplitude drives additional displacement
    float audioDisp = uAmplitude * 0.15 * sin(position.y * 3.0 + uTime * 4.0);

    vDisplacement = totalNoise + audioDisp;

    vec3 newPosition = position + normal * (totalNoise + audioDisp);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const AVATAR_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uAmplitude;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uGlowColor;
  uniform float uGlowIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    // Fresnel rim glow
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);

    // Gradient based on position and displacement
    float gradient = (vPosition.y + 1.0) * 0.5 + vDisplacement * 0.5;
    vec3 baseColor = mix(uColor1, uColor2, clamp(gradient, 0.0, 1.0));

    // Iridescent color shift
    float iridescence = sin(vPosition.x * 5.0 + uTime) * 0.5 + 0.5;
    baseColor = mix(baseColor, uColor2, iridescence * 0.2);

    // Audio-reactive glow
    float audioGlow = uAmplitude * uGlowIntensity;
    vec3 glow = uGlowColor * fresnel * (0.6 + audioGlow);

    vec3 finalColor = baseColor + glow;

    // Subtle inner brightness
    float innerGlow = smoothstep(0.0, 0.5, 1.0 - fresnel) * 0.15;
    finalColor += vec3(innerGlow) * uColor2;

    gl_FragColor = vec4(finalColor, 0.92 + fresnel * 0.08);
  }
`;

class AvatarEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.size = options.size || 320;
    this.state = 'idle';
    this.amplitude = 0;
    this.targetAmplitude = 0;
    this.destroyed = false;
    this.clock = { elapsed: 0, lastTime: performance.now() / 1000 };

    // State-specific color palettes
    this.palettes = {
      idle: {
        color1: [0.275, 0.278, 0.667],  // #4647AA (deep indigo)
        color2: [0.024, 0.714, 0.831],   // #06B6D4 (cyan)
        glow: [0.388, 0.400, 0.945],     // #6366F1 (indigo)
        glowIntensity: 0.5,
        noiseScale: 1.2,
        displacement: 0.06,
      },
      speaking: {
        color1: [0.388, 0.400, 0.945],   // #6366F1 (bright indigo)
        color2: [0.506, 0.529, 0.976],    // #818CF8 (light indigo)
        glow: [0.506, 0.529, 0.976],
        glowIntensity: 1.2,
        noiseScale: 1.5,
        displacement: 0.12,
      },
      listening: {
        color1: [0.063, 0.725, 0.506],    // #10B981 (emerald)
        color2: [0.133, 0.827, 0.882],    // #22D3E1 (cyan-green)
        glow: [0.063, 0.725, 0.506],
        glowIntensity: 0.8,
        noiseScale: 1.0,
        displacement: 0.05,
      },
      processing: {
        color1: [0.961, 0.620, 0.043],    // #F59E0B (amber)
        color2: [0.957, 0.247, 0.369],    // #F43F5E (rose)
        glow: [0.961, 0.620, 0.043],
        glowIntensity: 1.0,
        noiseScale: 2.0,
        displacement: 0.10,
      },
    };

    // Current interpolated values
    this.current = { ...this.palettes.idle };

    this._init();
  }

  async _init() {
    // Dynamically load Three.js from CDN
    if (!window.THREE) {
      await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    }

    const THREE = window.THREE;
    const w = this.size;
    const h = this.size;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.z = 3.2;

    // Shader material
    this.uniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uNoiseScale: { value: 1.2 },
      uDisplacementStrength: { value: 0.06 },
      uColor1: { value: new THREE.Vector3(...this.palettes.idle.color1) },
      uColor2: { value: new THREE.Vector3(...this.palettes.idle.color2) },
      uGlowColor: { value: new THREE.Vector3(...this.palettes.idle.glow) },
      uGlowIntensity: { value: 0.5 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: AVATAR_VERTEX_SHADER,
      fragmentShader: AVATAR_FRAGMENT_SHADER,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });

    // High-res sphere
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    this.sphere = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.sphere);

    // Outer glow ring (particle ring)
    this._createParticleRing(THREE);

    // Start render loop
    this._animate();
  }

  _createParticleRing(THREE) {
    const count = 80;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 1.6 + Math.random() * 0.3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      sizes[i] = Math.random() * 3 + 1;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particleMaterial = new THREE.PointsMaterial({
      color: 0x6366f1,
      size: 0.03,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(particleGeom, this.particleMaterial);
    this.scene.add(this.particles);
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  setState(newState) {
    if (!this.palettes[newState]) return;
    this.state = newState;
  }

  setAmplitude(value) {
    this.targetAmplitude = Math.max(0, Math.min(1, value));
  }

  setFrequencyData(dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    // Calculate average amplitude from frequency data
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    this.targetAmplitude = Math.min(1, (sum / dataArray.length) / 128);
  }

  _animate() {
    if (this.destroyed) return;
    requestAnimationFrame(() => this._animate());

    const now = performance.now() / 1000;
    const delta = now - this.clock.lastTime;
    this.clock.lastTime = now;
    this.clock.elapsed += delta;

    if (!this.uniforms) return;

    // Smooth amplitude interpolation
    const ampSmooth = this.state === 'speaking' ? 0.12 : 0.08;
    this.amplitude += (this.targetAmplitude - this.amplitude) * ampSmooth;

    // Smoothly interpolate palette values
    const target = this.palettes[this.state];
    const lerpSpeed = 0.04;

    this.current.noiseScale += (target.noiseScale - this.current.noiseScale) * lerpSpeed;
    this.current.displacement += (target.displacement - this.current.displacement) * lerpSpeed;
    this.current.glowIntensity += (target.glowIntensity - this.current.glowIntensity) * lerpSpeed;

    for (let i = 0; i < 3; i++) {
      this.current.color1[i] += (target.color1[i] - this.current.color1[i]) * lerpSpeed;
      this.current.color2[i] += (target.color2[i] - this.current.color2[i]) * lerpSpeed;
      this.current.glow[i] += (target.glow[i] - this.current.glow[i]) * lerpSpeed;
    }

    // Update uniforms
    this.uniforms.uTime.value = this.clock.elapsed;
    this.uniforms.uAmplitude.value = this.amplitude;
    this.uniforms.uNoiseScale.value = this.current.noiseScale;
    this.uniforms.uDisplacementStrength.value = this.current.displacement + this.amplitude * 0.08;
    this.uniforms.uColor1.value.set(...this.current.color1);
    this.uniforms.uColor2.value.set(...this.current.color2);
    this.uniforms.uGlowColor.value.set(...this.current.glow);
    this.uniforms.uGlowIntensity.value = this.current.glowIntensity;

    // Sphere rotation
    const rotSpeed = this.state === 'processing' ? 0.5 : this.state === 'speaking' ? 0.2 : 0.08;
    this.sphere.rotation.y += delta * rotSpeed;
    this.sphere.rotation.x = Math.sin(this.clock.elapsed * 0.15) * 0.1;

    // Breathing scale
    const breathe = 1.0 + Math.sin(this.clock.elapsed * 1.2) * 0.015;
    const audioScale = 1.0 + this.amplitude * 0.08;
    this.sphere.scale.setScalar(breathe * audioScale);

    // Particle ring rotation + color
    if (this.particles) {
      const particleSpeed = this.state === 'speaking' ? 0.3 : this.state === 'processing' ? 0.6 : 0.1;
      this.particles.rotation.y += delta * particleSpeed;
      this.particles.rotation.z = Math.sin(this.clock.elapsed * 0.2) * 0.05;

      // Match particle color to current palette
      const pColor = this.particleMaterial.color;
      pColor.r += (this.current.glow[0] - pColor.r) * 0.05;
      pColor.g += (this.current.glow[1] - pColor.g) * 0.05;
      pColor.b += (this.current.glow[2] - pColor.b) * 0.05;

      this.particleMaterial.opacity = 0.3 + this.amplitude * 0.4;
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  resize(size) {
    this.size = size;
    if (this.renderer) {
      this.renderer.setSize(size, size);
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.sphere) {
      this.sphere.geometry.dispose();
    }
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particleMaterial.dispose();
    }
  }
}

// Export for use in interview pages
window.AvatarEngine = AvatarEngine;
