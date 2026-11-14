function exportMap() {
  const layer = st.vm;
  const forecastDate = ym(FS + st.fk - 1);
  const riskDate = ym(FS);
  const scenario = st.fx === "c" ? "scenario_change_percent" : st.fx === "b" ? "baseline_hotspots_per_month" : "scenario_hotspots_per_month";
  return cells.filter(cell => inb(cell, st.b)).flatMap(cell => {
    const location = {latitude: cell.lat, longitude: cell.lon};
    if (layer === "f") return cell.f ? [{...location, month: forecastDate, projected_hotspots: cval(cell)}] : [];
    if (layer === "r") return cell.rk ? [{
      ...location, month: riskDate, projected_hotspots: cell.rk.v,
      seasonal_percentile: Number((cell.rk.pr * 100).toFixed(2)), activity_level: LV[cell.rk.l]
    }] : [];
    if (layer === "x") return SCP.run && cell.sB != null ? [{
      ...location, scenario_year: SCP.yr, [scenario]: Number(cval(cell).toFixed(3))
    }] : [];
    return [{...location, from_month: ym(st.f), through_month: ym(st.t), record: st.dm === "r" ? "raw" : "harmonized",
      mean_monthly_hotspots: Number(cellAvg(cell).toFixed(3))}];
  });
}

function exportRows(dataset) {
  if (dataset === "map") return exportMap();
  if (dataset === "grid") return cells.filter(cell => inb(cell, st.b)).map(cell => ({
    latitude: cell.lat, longitude: cell.lon, from_month: ym(st.f), through_month: ym(st.t),
    record: st.dm === "r" ? "raw" : "harmonized", hotspots_in_period: Math.round(cellAvg(cell) * (st.t - st.f + 1))
  }));
  if (!cells.some(cell => inb(cell, st.b))) return [];
  const rows = [];
  for (let month = st.f; month <= st.t && month <= LAST; month++) {
    const baseline = med[month % 12];
    rows.push({
      month: ym(month), hotspots_raw: A.R[month], hotspots_harmonized: A.H[month],
      comparison_record: st.dm === "r" ? "raw" : "harmonized",
      seasonal_median: Math.round(baseline), anomaly_percent: baseline ? Number(((S[month] / baseline - 1) * 100).toFixed(1)) : null
    });
  }
  return rows;
}

function exportText(rows, format) {
  if (format === "geojson") return JSON.stringify({
    type: "FeatureCollection",
    features: rows.map(({latitude, longitude, ...properties}) => ({
      type: "Feature", geometry: {type: "Point", coordinates: [longitude, latitude]}, properties
    }))
  }, null, 2);
  if (!rows.length) return "";
  const quote = value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [Object.keys(rows[0]).join(","), ...rows.map(row => Object.values(row).map(quote).join(","))].join("\r\n") + "\r\n";
}

function wireExport() {
  const dialog = $("dx"), dataset = $("export-data"), format = $("fx");
  const preview = $("ta"), status = $("export-status");
  let payload;

  function refresh() {
    const history = dataset.value === "history";
    format.options[1].disabled = history;
    if (history && format.value === "geojson") format.value = "csv";
    const layer = dataset.value === "map" ? st.vm : "o";
    let source = real ? "Satellite record" : "Demonstration data";
    if (real && (layer === "f" || layer === "r")) source = FC.demo ? "Seasonal baseline" : "Model forecast";
    if (real && layer === "x") source = "Illustrative scenario";
    const area = ITEMS.length ? ITEMS.map(item => item.name).join(", ") : PRE[Number($("pre").value)][0];
    const period = layer === "f" ? mname(FS + st.fk - 1) : layer === "r" ? mname(FS) :
      layer === "x" && SCP.run ? String(SCP.yr) : mname(st.f) + " – " + mname(st.t);
    const rows = exportRows(dataset.value).map(row => ({...row, data_source: source}));
    const name = {o: "observed", f: "forecast", r: "activity-risk", x: "scenario"}[layer];
    $("export-scope").textContent = area + " · " + period + " · " + source + " · " + rows.length.toLocaleString() + " rows";
    payload = {
      filename: "pyroscale-" + (dataset.value === "map" ? name : dataset.value) + "." + format.value,
      content: rows.length ? exportText(rows, format.value) : "",
      type: format.value === "geojson" ? "application/geo+json" : "text/csv;charset=utf-8"
    };
    preview.value = payload.content.slice(0, 12000);
    $("cp").disabled = $("dl").disabled = !rows.length;
    status.textContent = !rows.length ? "No data is available in this selection." :
      preview.value.length < payload.content.length ? "Preview shortened. Copy and download include every row." : "";
  }

  $("map-export").onclick = $("ex").onclick = event => {
    stopForecast();
    dataset.value = event.currentTarget.id === "ex" ? "history" : "map";
    refresh();
    dialog.showModal();
  };
  dataset.onchange = format.onchange = refresh;
  $("cl").onclick = () => dialog.close();
  $("cp").onclick = async () => {
    try {
      await navigator.clipboard.writeText(payload.content);
      status.textContent = "Copied the full export.";
    } catch {
      status.textContent = "Clipboard access is unavailable. Use Download to save the full export.";
    }
  };
  $("dl").onclick = () => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([payload.content], {type: payload.type}));
    link.href = url;
    link.download = payload.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
