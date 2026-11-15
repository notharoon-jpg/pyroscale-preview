function setDrawMode(active, focus = false) {
  if (!G) return;
  st.gm = active ? "d" : "r";
  document.querySelector(`input[name="gm"][value="${st.gm}"]`).checked = true;
  for (const id of ["map-draw", "panel-draw"]) {
    $(id).setAttribute("aria-pressed", String(active));
    $(id).textContent = active ? "Stop drawing" : "Draw area";
  }
  $("draw-status").hidden = !active;
  G.renderer.domElement.style.cursor = active ? "crosshair" : "grab";
  tip.style.display = "none";
  if (active) {
    G.fly = null;
    $("ga").checked = false;
    if (focus) G.renderer.domElement.focus({preventScroll: true});
  }
}

function mapOverview() {
  const layer = st.vm;
  const region = $("pre").value;
  $("map-region").value = region;
  $("map-overview-title").textContent = ITEMS.length ? ITEMS.map(item => item.name).join(", ") : PRE[Number(region)][0];
  const scoped = cells.filter(cell => inb(cell, st.b));
  let period = mname(st.f) + " – " + mname(st.t);
  let label = {v:"Suomi-NPP detections",m:"Terra detections",j:"NOAA-20 detections",
               r:"Sensor history detections",h:"Reference detections and estimates"}[st.dm];
  let history = S?.slice(st.f, st.t + 1) || [];
  let value = history.some(Number.isFinite) ? finiteSum(history) : null;
  if (history.some(v=>!Number.isFinite(v)) && value!==null) label += " · available months";
  let marker = -1;

  if (layer === "f" && FC) {
    const available = scoped.filter(cell => cell.f);
    history = Array.from({length: FH}, (_, month) => sumWhenComplete(available.map(cell=>scopeWeight(cell)*cell.f[month])));
    marker = st.fk - 1;
    period = mname(FS + marker);
    value = available.length ? history[marker] : null;
    label = "Projected NOAA-20 detections";
  } else if (layer === "r" && FC) {
    period = mname(FS);
    value = scoped.filter(cell => cell.rk?.l >= 2).length;
    label = "Cells above activity threshold";
    history = [];
  } else if (layer === "f" || layer === "r") {
    period = "";
    label = "Forecast unavailable";
    value = null;
    history = [];
  } else if (layer === "x") {
    history = [];
    period = SCP.run ? "Illustrative scenario for " + SCP.yr : "";
    value = SCP.run ? st.fx === "b" ? SCP.Bs : SCP.Ps : null;
    label = st.fx === "b" ? "Annual baseline hotspots" : "Annual scenario hotspots";
    if (SCP.run && st.fx === "c") {
      value = SCP.Bs ? (SCP.Ps / SCP.Bs - 1) * 100 : null;
      label = "Change from baseline";
    }
  }
  $("map-overview-period").textContent = period;
  $("map-overview-value").textContent = value == null || !scoped.length ? "–" :
    layer === "x" && st.fx === "c" ? sgn(value) : fmt(value);
  $("map-overview-measure").textContent = label;
  const values = history.slice(-36);
  const ceiling = Math.max(1, ...values.filter(Number.isFinite));
  const width = 228 / (values.length || 1);
  const bars = values.map((count, index) => {
    if (!Number.isFinite(count)) return "";
    const height = 34 * count / ceiling;
    return `<rect x="${(index * width).toFixed(2)}" y="${(38 - height).toFixed(2)}" width="${Math.max(1, width - 1).toFixed(2)}" height="${height.toFixed(2)}" opacity="${marker === -1 || marker === index ? 1 : .45}"/>`;
  }).join("");
  $("map-overview-chart").innerHTML = scoped.length && values.length ?
    `<svg viewBox="0 0 228 40" role="img" aria-label="${layer === "f" ? "Projected monthly hotspot totals" : "Monthly hotspot totals for the last " + values.length + " months of the selection"}"><path d="M0 39H228" fill="none"/>${bars}</svg>` : "";
}

function setLegendVisible(visible) {
  $("lgd").hidden = !visible;
  $("map-legend").setAttribute("aria-pressed", String(visible));
}

function wireMap() {
  const region = $("map-region"), filters = $("pre");
  region.replaceChildren(...Array.from(filters.options, option => option.cloneNode(true)));
  region.onchange = () => {
    const selected = region.value;
    if (ITEMS.length && selected !== "0") clearFocus();
    filters.value = selected;
    filters.dispatchEvent(new Event("change"));
    if (selected === "0") tab("x", true);
  };
  $("map-draw").onclick = $("panel-draw").onclick = () => setDrawMode(st.gm !== "d", true);
  document.querySelectorAll('input[name="gm"]').forEach(input => {
    input.onchange = () => setDrawMode(input.value === "d");
  });
  $("map-legend").onclick = () => setLegendVisible($("lgd").hidden);
  $("edit-scenario").onclick = () => tab("f", true);
  const menus = Array.from(document.querySelectorAll(".map-tools > details"));
  for (const menu of menus) {
    menu.addEventListener("toggle", () => {
      if (menu.open) menus.filter(other => other !== menu).forEach(other => { other.open = false; });
    });
  }

  const input = $("map-query"), results = $("map-results");
  let timer, serial = 0;
  function clearResults() {
    clearTimeout(timer);
    serial++;
    results.replaceChildren();
    results.hidden = true;
  }
  input.oninput = () => {
    clearResults();
    const query = input.value.trim().toLowerCase(), current = serial;
    if (!query) return;
    timer = setTimeout(async () => {
      const matches = await placeMatches(query);
      if (current !== serial) return;
      results.hidden = false;
      if (!matches.length) {
        const item = document.createElement("li");
        item.className = "map-no-results";
        item.textContent = "No matching places";
        results.append(item);
        return;
      }
      for (const place of matches) {
        const item = document.createElement("li"), button = document.createElement("button");
        const name = document.createElement("span"), kind = document.createElement("small");
        button.type = "button";
        name.textContent = place.name;
        kind.textContent = place.t === "c" ? "Country" : "City";
        button.append(name, kind);
        button.onclick = () => {
          input.value = "";
          clearResults();
          input.focus();
          addItem(place);
        };
        item.append(button);
        results.append(item);
      }
    }, 150);
  };
  input.onkeydown = event => {
    const first = results.querySelector("button");
    if (event.key === "Escape") clearResults();
    if (event.key === "ArrowDown" && first) {
      event.preventDefault();
      first.focus();
    }
    if (event.key === "Enter" && first) {
      event.preventDefault();
      first.click();
    }
  };
  results.onkeydown = event => {
    if (event.key === "Escape") {
      clearResults();
      input.focus();
      return;
    }
    const sibling = event.key === "ArrowDown" ? event.target.closest("li")?.nextElementSibling :
      event.key === "ArrowUp" ? event.target.closest("li")?.previousElementSibling : null;
    if (sibling) {
      event.preventDefault();
      sibling.querySelector("button")?.focus();
    }
  };
  document.addEventListener("pointerdown", event => {
    if (!input.parentElement.contains(event.target)) clearResults();
    for (const menu of menus) if (!menu.contains(event.target)) menu.open = false;
  });
}
