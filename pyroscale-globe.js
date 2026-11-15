const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const HOTSPOT_COLORS = ["#f25045", "#ff7842", "#ffa34e", "#ffcf75", "#fdf0d5"];
const EARTH_RADIUS = 1;
const INITIAL_VIEW = {lat: 16, lon: -23};
const GLOBAL_VIEW_DISTANCE = 3.75;
const EARTH_CREDIT = "https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/";
const HD_EARTH_CREDIT = "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/";

function ll2v(lat, lon, radius) {
  const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(a) * Math.cos(b),
    radius * Math.sin(a),
    -radius * Math.cos(a) * Math.sin(b)
  );
}

function gResize() {
  if (!G) return;
  const el = $("gl"), w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  const drawer = !document.body.classList.contains("dc");
  const mobile = w <= 720;
  const header = $("map-header").offsetHeight;
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h;
  G.camera.fov = 45;
  G.camera.zoom = mobile ? Math.min(1, w / h * (drawer ? 1.24 : 1.5)) :
    drawer ? Math.min(1, (w - $("dr").offsetWidth) / h * 1.12) : 1;
  G.markerUniforms.pixelRatio.value = G.renderer.getPixelRatio();
  G.markerUniforms.viewportHeight.value = h;
  const x = drawer && !mobile ? $("dr").offsetWidth / 2 : 0;
  const y = drawer && mobile ? ($("dr").offsetHeight - header) / 2 : -header / 2;
  G.camera.setViewOffset(w, h, x, y, w, h);
}

function flyTo(lat, lon, distance) {
  if (!G) return;
  const from = G.camera.position.clone().normalize(), to = ll2v(lat, lon, 1);
  const targetDistance = THREE.MathUtils.clamp(distance ?? G.camera.position.length(), 1.19, 7);
  if (reducedMotion.matches) {
    G.camera.position.copy(to.multiplyScalar(targetDistance));
    G.fly = null;
    return;
  }
  G.fly = {
    from,
    turn: new THREE.Quaternion().setFromUnitVectors(from, to),
    start: performance.now(),
    fromDistance: G.camera.position.length(),
    distance: targetDistance
  };
}

function sunDirection() {
  const now = new Date();
  const day = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5;
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
  return ll2v(23.44 * Math.sin(2 * Math.PI * (day - 81) / 365), (12 - hours) * 15, 1);
}

function sceneRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function initGlobe() {
  const el = $("gl");
  try {
    const renderer = new THREE.WebGLRenderer({antialias: true});
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 100);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x031522);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Earth. Use the arrow keys to rotate, plus or minus to zoom, and Enter to inspect the hotspot nearest the center.");
    el.append(canvas);
    camera.position.copy(ll2v(INITIAL_VIEW.lat, INITIAL_VIEW.lon, GLOBAL_VIEW_DISTANCE));
    camera.lookAt(0, 0, 0);

    const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    empty.needsUpdate = true;
    const earthUniforms = {
      day: {value: landTex()}, night: {value: empty},
      sun: {value: new THREE.Vector3()}, daylight: {value: 0}, style: {value: 0}
    };
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 192, 128), new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: `
        varying vec2 texCoord;
        varying vec3 worldNormal;
        varying vec3 worldPoint;
        void main() {
          texCoord = uv;
          worldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          worldPoint = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform sampler2D day, night;
        uniform vec3 sun;
        uniform float daylight, style;
        varying vec2 texCoord;
        varying vec3 worldNormal, worldPoint;
        void main() {
          vec3 n = normalize(worldNormal);
          vec3 view = normalize(cameraPosition - worldPoint);
          vec3 base = texture2D(day, texCoord).rgb;
          vec3 cities = texture2D(night, texCoord).rgb;
          float d = dot(n, sun);
          float lit = smoothstep(-.16, .28, d);
          vec3 dayColor = pow(base, vec3(.83)) * mix(.73, 1.12, smoothstep(-.5, .88, d));
          float gray = dot(dayColor, vec3(.2126, .7152, .0722));
          dayColor = mix(dayColor, vec3(gray), .04);
          vec3 color = mix(dayColor, mix(base * .15 + cities * .95, dayColor, lit), daylight);
          float limb = pow(1. - max(dot(n, view), 0.), 3.);
          color += vec3(.25, .61, .72) * limb * mix(.5, .22 + .32 * lit, daylight);
          if (style == 1.) {
            float land = 1. - smoothstep(.09, .28, base.b - base.r);
            float mono = mix(.27 + .26 * gray, .35 + .37 * gray, land);
            color = vec3(mono * (1. - .19 * limb) * mix(1., .42 + .58 * lit, daylight));
          }
          gl_FragColor = vec4(color, 1.);
        }
      `
    }));
    scene.add(earth);
    const loader = new THREE.TextureLoader();
    const basemap = {
      style: "satellite", base: earthUniforms.day.value, hd: null, sky: null, borders: null,
      loader, renderer, scene
    };
    for (const [key, file] of [["day", "earth-blue-marble.jpg"], ["night", "earth-night.jpg"]]) {
      loader.load("assets/" + file, texture => {
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (key === "day") {
          basemap.base.dispose();
          basemap.base = texture;
        } else {
          earthUniforms.night.value.dispose();
          earthUniforms.night.value = texture;
        }
      });
    }

    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.055, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 shellNormal, viewRay;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.);
          shellNormal = normalize(normalMatrix * normal);
          viewRay = -p.xyz;
          gl_Position = projectionMatrix * p;
        }
      `,
      fragmentShader: `
        varying vec3 shellNormal, viewRay;
        void main() {
          float edge = pow(max(0., .58 + dot(normalize(shellNormal), normalize(viewRay))), 2.6);
          gl_FragColor = vec4(.37, .76, .84, edge);
        }
      `
    }));
    scene.add(rim);

    const stars = [], random = sceneRandom(38);
    for (let i = 0; i < 1500; i++) {
      const y = random() * 2 - 1, angle = random() * 2 * Math.PI;
      const r = 56 * Math.sqrt(1 - y * y);
      stars.push(r * Math.cos(angle), 56 * y, r * Math.sin(angle));
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
    const starfield = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      size: 1.15, sizeAttenuation: false, color: 0x9cbac7, transparent: true, opacity: .20, depthWrite: false
    }));
    scene.add(starfield);

    const markerUniforms = {pixelRatio: {value: 1}, viewportHeight: {value: 600}, time: {value: 0}};
    const markers = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      uniforms: markerUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `
        attribute vec3 tint;
        attribute float strength, size, phase;
        uniform float pixelRatio, viewportHeight, time;
        varying vec3 color;
        varying float alpha;
        void main() {
          vec3 normal = normalize(position);
          vec3 direction = normalize(cameraPosition - position);
          float visible = smoothstep(.025, .30, dot(normal, direction));
          alpha = strength * visible;
          color = tint;
          vec4 point = modelViewMatrix * vec4(position, 1.);
          float pulse = 1. + .045 * sin(time * 1.8 + phase);
          gl_PointSize = clamp(size * pulse * viewportHeight / -point.z, 6., 42.) * pixelRatio;
          gl_Position = projectionMatrix * point;
        }
      `,
      fragmentShader: `
        varying vec3 color;
        varying float alpha;
        void main() {
          float r = length(gl_PointCoord - .5) * 2.;
          float core = 1. - smoothstep(.36, .53, r);
          float edge = (1. - smoothstep(.52, .72, r)) * (1. - core);
          float glow = (1. - smoothstep(.52, 1., r)) * (1. - core - edge);
          float opacity = core + .93 * edge + .25 * glow;
          vec3 ink = vec3(.08, .023, .025);
          vec3 tint = (color * (core + .25 * glow) + ink * .93 * edge) / max(opacity, .001);
          gl_FragColor = vec4(tint, alpha * opacity);
        }
      `
    }));
    markers.frustumCulled = false;
    markers.renderOrder = 2;
    scene.add(markers);

    const line = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0x84d3ff, transparent: true, opacity: .72
    }));
    const selected = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color: 0xdaf1ff}));
    scene.add(line, selected);
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion.matches;
    controls.minDistance = 1.19;
    controls.maxDistance = 7;
    controls.rotateSpeed = .48;
    controls.addEventListener("start", () => {
      G.fly = null;
      $("ga").checked = false;
      tip.style.display = "none";
    });

    G = {renderer, scene, camera, earth, line, selected, markers, markerUniforms, controls, visible: [], tv: [], fly: null};
    wireGlobeInput(canvas);
    wireBasemap(basemap);
    let previousTime = 0;
    const up = new THREE.Vector3(0, 1, 0);
    const turn = new THREE.Quaternion(), sun = new THREE.Vector3(), lightOffset = new THREE.Vector3(-.17, .29, 0);
    function render(time) {
      requestAnimationFrame(render);
      const delta = Math.min(40, time - previousTime);
      previousTime = time;
      const mono = basemap.style === "mono";
      const space = basemap.style === "space";
      renderer.setClearColor(mono ? 0x252b31 : 0x031522);
      earthUniforms.day.value = !mono && basemap.hd ? basemap.hd : basemap.base;
      earthUniforms.style.value = mono ? 1 : 0;
      rim.visible = !mono;
      starfield.visible = space;
      if (basemap.sky) basemap.sky.visible = space;
      if (basemap.borders) basemap.borders.visible = mono;
      const drawing = st.gm === "d";
      const flight = G.fly;
      if (flight) {
        const t = Math.min(1, (time - flight.start) / 640), eased = t * t * (3 - 2 * t);
        turn.identity().slerp(flight.turn, eased);
        camera.position.copy(flight.from).applyQuaternion(turn)
          .multiplyScalar(THREE.MathUtils.lerp(flight.fromDistance, flight.distance, eased));
        if (t === 1) G.fly = null;
      }
      const rotate = $("ga").checked && !drawing;
      if (!reducedMotion.matches && !flight && rotate) {
        camera.position.applyAxisAngle(up, delta * .000055);
      }
      const daylight = $("gn").checked;
      if (daylight) sun.copy(sunDirection());
      else sun.copy(camera.position).normalize().add(lightOffset).normalize();
      earthUniforms.sun.value.copy(sun);
      earthUniforms.daylight.value = daylight ? 1 : 0;
      markerUniforms.time.value = reducedMotion.matches ? 0 : time / 1000;
      controls.enabled = !drawing;
      controls.update();
      renderer.render(scene, camera);
    }
    new ResizeObserver(gResize).observe(el);
    gResize();
    requestAnimationFrame(render);
  } catch (error) {
    console.warn("3D globe unavailable", error);
    G = null;
    el.innerHTML = '<p class="globe-unavailable">The 3D globe needs WebGL. You can still open the analysis panel to explore the data.</p>';
    document.querySelectorAll(".map-tools button:not(#map-export):not(#map-legend), .map-settings input, input[name=basemap], .draw-shortcut").forEach(control => control.disabled = true);
  }
}

function wireBasemap(map) {
  const options = document.querySelectorAll('input[name="basemap"]');
  const status = $("map-style-status");
  const hd = file => new Promise((resolve, reject) => {
    map.loader.load("assets/" + file, texture => {
      const max = map.renderer.capabilities.maxTextureSize;
      if (texture.image.width > max) {
        const image = document.createElement("canvas");
        image.width = max;
        image.height = Math.round(max * texture.image.height / texture.image.width);
        image.getContext("2d").drawImage(texture.image, 0, 0, image.width, image.height);
        texture.image = image;
        texture.needsUpdate = true;
      }
      texture.anisotropy = Math.min(12, map.renderer.capabilities.getMaxAnisotropy());
      resolve(texture);
    }, undefined, reject);
  });
  let earthLoad, spaceLoad;
  async function loadEarth() {
    map.hd = await hd("earth-blue-marble-hd.webp");
  }
  async function loadSky() {
    const texture = await hd("milky-way.webp");
    map.sky = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.MeshBasicMaterial({
      map: texture, color: 0xb2b9cc, side: THREE.BackSide
    }));
    map.sky.rotation.set(.3, 1.7, -.35);
    map.scene.add(map.sky);
  }
  function updateCredits() {
    $("map-border-credit").hidden = map.style !== "mono" || !map.borders;
    $("map-space-credit").hidden = map.style !== "space" || !map.sky;
    $("map-earth-credit").href = map.style !== "mono" && map.hd ? HD_EARTH_CREDIT : EARTH_CREDIT;
  }
  async function useStyle(style) {
    map.style = $("map-ui").dataset.style = style;
    updateCredits();
    status.textContent = "";
    if (style === "mono") return;
    earthLoad ??= loadEarth();
    if (style === "space") spaceLoad ??= loadSky();
    if (!map.hd || (style === "space" && !map.sky)) status.textContent = "Loading HD imagery…";
    const results = await Promise.allSettled(style === "space" ? [earthLoad, spaceLoad] : [earthLoad]);
    if (map.style !== style) return;
    updateCredits();
    status.textContent = results.some(result => result.status === "rejected") ? "Some HD imagery is unavailable." : "";
  }
  options.forEach(option => option.addEventListener("change", () => useStyle(option.value)));
  useStyle(Array.from(options).find(option => option.checked).value);

  fetch("assets/country-boundaries.json").then(response => {
    if (!response.ok) throw new Error("Country boundaries unavailable");
    return response.json();
  }).then(paths => {
    const points = [];
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const [a, b] = [path[i - 1], path[i]];
        const left = ll2v(a[1], a[0], 1), right = ll2v(b[1], b[0], 1);
        const steps = Math.max(1, Math.ceil(left.angleTo(right) / .025));
        for (let step = 0; step < steps; step++) {
          for (const t of [step / steps, (step + 1) / steps]) {
            const p = left.clone().lerp(right, t).normalize().multiplyScalar(1.0015);
            points.push(p.x, p.y, p.z);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    map.borders = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0x2c3133, transparent: true, opacity: .72}));
    map.scene.add(map.borders);
    updateCredits();
  }).catch(() => { $("map-border-credit").hidden = true; });
}

function wireGlobeInput(canvas) {
  const {camera, earth} = G;
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), projection = new THREE.Vector3();
  let start = null, area = null, draft = null;

  function coordinates(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObject(earth)[0];
    if (!hit) return null;
    const v = hit.point.normalize();
    return [THREE.MathUtils.radToDeg(Math.asin(v.y)), THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x))];
  }

  function nearest(x, y, radius) {
    const {width, height} = canvas.getBoundingClientRect();
    let best = null, score = Infinity;
    for (const marker of G.visible) {
      if (marker.point.dot(camera.position) < 1.055) continue;
      projection.copy(marker.point).project(camera);
      const dx = (projection.x + 1) * width / 2 - x, dy = (1 - projection.y) * height / 2 - y;
      const distance = dx * dx + dy * dy;
      if (distance < score && distance <= radius * radius) {
        best = marker;
        score = distance;
      }
    }
    return best?.index;
  }
  function pickAt(event) {
    const {left, top} = canvas.getBoundingClientRect();
    return nearest(event.clientX - left, event.clientY - top, event.pointerType === "touch" ? 18 : 11);
  }

  function adjustArea(bounds) {
    if (ITEMS.length) clearFocus();
    $("pre").value = "0";
    noFly = true;
    setB(bounds);
    noFly = false;
  }
  canvas.onpointerdown = event => {
    start = {x: event.clientX, y: event.clientY};
    if (st.gm !== "d") return;
    area = coordinates(event);
    draft = null;
    if (area) canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = event => {
    if (area) {
      const end = coordinates(event);
      if (end && (draft || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)) {
        const west = Math.min(area[1], end[1]), east = Math.max(area[1], end[1]);
        draft = [Math.min(area[0], end[0]), Math.max(area[0], end[0]), ...(
          east-west>180 ? [east,west] : [west,east])];
        drawAreaOutline(draft, true);
      }
      return;
    }
    if (start || st.gm === "d") return;
    const index = pickAt(event);
    tip.style.display = index == null ? "none" : "block";
    canvas.style.cursor = index == null ? "grab" : "pointer";
    if (index == null) return;
    const cell = cells[index];
    tip.innerHTML = `<b>${cn(cell)}</b><br>${fmt(G.tv[index])} ${MT()}`;
    tip.style.left = Math.max(8, Math.min(event.clientX + 14, innerWidth - 218)) + "px";
    tip.style.top = Math.min(event.clientY + 14, innerHeight - 67) + "px";
  };
  canvas.onpointerup = event => {
    if (area) {
      const wrap = longitude => ((longitude + 540) % 360) - 180;
      adjustArea(draft || [area[0]-4,area[0]+4,wrap(area[1]-4),wrap(area[1]+4)]);
      tab("x");
    } else if (start && st.gm !== "d" && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) {
      const index = pickAt(event);
      if (index != null) selectCell(index);
    }
    start = area = draft = null;
  };
  canvas.onpointercancel = () => {
    if (draft) drawAreaOutline(st.b, $("pre").value !== "1");
    start = area = draft = null;
  };
  canvas.onpointerleave = () => { tip.style.display = "none"; if (!area) start = null; };
  canvas.ondblclick = event => {
    if (st.gm === "d") return;
    const point = coordinates(event);
    if (point) flyTo(point[0], point[1], 1.65);
  };
  function cameraPosition() {
    const {x, y, z} = camera.position, distance = camera.position.length();
    return [THREE.MathUtils.radToDeg(Math.asin(y / distance)), THREE.MathUtils.radToDeg(Math.atan2(-z, x)), distance];
  }
  function zoom(factor) {
    const [lat, lon, distance] = cameraPosition();
    flyTo(lat, lon, 1 + (distance - 1) * factor);
  }
  $("zoom-in").onclick = () => zoom(.68);
  $("zoom-out").onclick = () => zoom(1.47);
  $("gr").onclick = () => {
    const [s, n, w, e] = st.b;
    if ($("pre").value === "1") flyTo(INITIAL_VIEW.lat, INITIAL_VIEW.lon, GLOBAL_VIEW_DISTANCE);
    else flyTo((s + n) / 2, (w + e) / 2, 3);
  };
  canvas.onkeydown = event => {
    if (event.key === "Enter" && st.gm !== "d") {
      event.preventDefault();
      const view = camera.view;
      const index = nearest(view.width / 2 - view.offsetX, view.height / 2 - view.offsetY, Infinity);
      if (index != null) selectCell(index, true);
      return;
    }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      zoom(event.key === "-" ? 1.47 : .68);
      return;
    }
    const movement = {ArrowUp: [8, 0], ArrowDown: [-8, 0], ArrowLeft: [0, -8], ArrowRight: [0, 8]}[event.key];
    if (!movement) return;
    event.preventDefault();
    const [lat, lon, distance] = cameraPosition();
    flyTo(THREE.MathUtils.clamp(lat + movement[0], -85, 85), lon + movement[1], distance);
  };
}

function drawMap() {
  if (!G) {
    legend();
    return;
  }
  const tv = cells.map(cval);
  const change = st.vm === "x" && st.fx === "c";
  let upper = 100;
  if (st.vm === "f") {
    if (G.forecastScale?.forecast !== FC || G.forecastScale?.focus !== FOC) {
      const values = cells.filter(cell => !FOC || FOC(cell)).flatMap(cell => cell.f || []);
      G.forecastScale = {forecast: FC, focus: FOC, upper: markerScale(values)};
    }
    upper = G.forecastScale.upper;
  } else if (!change) {
    upper = markerScale(tv.map((value, index) => !FOC || FOC(cells[index]) ? Math.abs(value) : 0));
  }
  const position = [], tint = [], strength = [], size = [], phase = [];
  const color = new THREE.Color();
  G.tv = tv;
  G.visible = [];
  for (const [index, cell] of cells.entries()) {
    const value = tv[index];
    if (!value || (FOC && !FOC(cell))) continue;
    const level = cell.rk?.l ?? 0;
    const amount = Math.min(1, Math.abs(value) / upper);
    const scaled = Math.sqrt(amount);
    const point = ll2v(cell.lat, cell.lon, 1.002);
    const main = inb(cell, st.b);
    if (st.vm === "r") color.set(RCOL[level]);
    else if (change) color.set(ramp(DV, .5 + .5 * Math.sign(value) * amount));
    else color.set(ramp(HOTSPOT_COLORS, amount));
    position.push(point.x, point.y, point.z);
    tint.push(color.r, color.g, color.b);
    strength.push((st.vm === "r" ? [.48, .76, .92, 1][level] : .73 + .27 * scaled) * (main ? 1 : .46));
    size.push(st.vm === "r" ? [.029, .041, .054, .065][level] : .03 + .039 * scaled);
    phase.push(index * 1.7);
    G.visible.push({index, point});
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, data, itemSize] of [["position", position, 3], ["tint", tint, 3], ["strength", strength, 1], ["size", size, 1], ["phase", phase, 1]]) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, itemSize));
  }
  G.markers.geometry.dispose();
  G.markers.geometry = geometry;
  drawMapGuides();
  legend(upper);
}

function markerScale(values) {
  const positive = values.filter(value => value > 0).sort((a, b) => a - b);
  return positive[Math.floor(positive.length * .95)] || 1;
}

function drawAreaOutline([s, n, w, east], show) {
  const outline = [];
  const e=east<w?east+360:east;
  function edge(lat1, lon1, lat2, lon2) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lat2 - lat1), Math.abs(lon2 - lon1)) / 2));
    for (let i = 0; i < steps; i++) {
      outline.push(ll2v(THREE.MathUtils.lerp(lat1, lat2, i / steps), THREE.MathUtils.lerp(lon1, lon2, i / steps), 1.006));
    }
  }
  if (show) {
    edge(s, w, s, e);
    edge(s, e, n, e);
    edge(n, e, n, w);
    edge(n, w, s, w);
  }
  G.line.geometry.dispose();
  G.line.geometry = new THREE.BufferGeometry().setFromPoints(outline);
  G.line.visible = outline.length > 0;
}

function drawMapGuides() {
  drawAreaOutline(st.b, $("pre").value !== "1");
  const cell = cells[st.sel], ring = [];
  if (cell && (!FOC || FOC(cell))) {
    const center = ll2v(cell.lat, cell.lon, 1);
    const east = ll2v(0, cell.lon + 90, 1), north = center.clone().cross(east);
    for (let i = 0; i < 36; i++) {
      const angle = i * 2 * Math.PI / 36;
      ring.push(center.clone().addScaledVector(east, .024 * Math.cos(angle))
        .addScaledVector(north, .024 * Math.sin(angle)).normalize().multiplyScalar(1.007));
    }
  }
  G.selected.geometry.dispose();
  G.selected.geometry = new THREE.BufferGeometry().setFromPoints(ring);
  G.selected.visible = ring.length > 0;

  if (G.arw) {
    G.scene.remove(G.arw);
    G.arw.line.material.dispose();
    G.arw.cone.material.dispose();
    G.arw = null;
  }
  if (WD && $("lx").checked) {
    const origin = ll2v(WD.la, WD.lo, 1.01), center = origin.clone().normalize();
    const east = ll2v(0, WD.lo + 90, 1), north = center.clone().cross(east);
    const angle = THREE.MathUtils.degToRad(WD.to);
    const direction = east.multiplyScalar(Math.sin(angle)).addScaledVector(north, Math.cos(angle)).normalize();
    G.arw = new THREE.ArrowHelper(direction, origin, .18, 0xc7eeff, .045, .025);
    G.scene.add(G.arw);
  }
}
