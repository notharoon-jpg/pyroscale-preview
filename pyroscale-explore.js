const $=id=>document.getElementById(id),MN="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const Y0=2001;let Y1=2026,NY=Y1-Y0+1,LAST=(Y1-Y0)*12+9;
const fmt=n=>!Number.isFinite(n)?"Unavailable":n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e4?Math.round(n/1e3)+"k":n>=1e3?(n/1e3).toFixed(1)+"k":Math.round(n)+"";
const hex=s=>[1,3,5].map(i=>parseInt(s.substr(i,2),16));
const RC=["#fcfdbf","#fed395","#fc9f6e","#f1605d","#c43c75","#8c2981","#51127c","#1b0c41"],DV=["#2c7bb6","#abd9e9","#f7f7f7","#fdae61","#c2410c"];
function ramp(c,t){t=Math.max(0,Math.min(1,t));const k=t*(c.length-1),i=Math.min(c.length-2,k|0),f=k-i,a=hex(c[i]),b=hex(c[i+1]);return"rgb("+a.map((x,j)=>Math.round(x+(b[j]-x)*f))+")"}
let cells=[], real=false, datasetId=null, observationRecord=null, dataLoadSequence=0, importSequence=0;
const observed = c => c[st.dm];
const finiteOrNull = v => Number.isFinite(v) ? v : null;
const recordNames = {v:"Suomi-NPP",m:"Terra",j:"NOAA-20",r:"Sensor history",h:"Reference + estimates"};
const finiteSum = values => values.reduce((sum, v) => Number.isFinite(v) ? sum + v : sum, 0);
const sumWhenComplete = values => values.every(Number.isFinite) ? finiteSum(values) : NaN;
const startAt = () => observationRecord ? dateIndex(observationRecord.start) : 0;
const dateIndex = value => {
  const [y,m] = value.split("-").map(Number);
  return (y-Y0)*12 + m-1;
};
const inb=(c,b)=>c.lat>=b[0]&&c.lat<=b[1]&&
  (b[2]<=b[3]?c.lon>=b[2]&&c.lon<=b[3]:c.lon>=b[2]||c.lon<=b[3])&&(!FOC||FOC(c));
const lonWidth=(w,e)=>e>=w?e-w:e+360-w;
const wrapLon=lon=>((lon+540)%360)-180;
const centerLon=(w,e)=>((w+lonWidth(w,e)/2+540)%360)-180;
function boundsForCells(selected) {
  const lat=selected.map(c=>c.lat), lon=[...new Set(selected.map(c=>c.lon))].sort((a,b)=>a-b);
  const south=Math.min(...lat)-1.5,north=Math.max(...lat)+1.5;
  if(lon.length===120)return [south,north,-180,180];
  let gap=-1,edge=0;
  lon.forEach((value,i)=>{
    const distance=(lon[i+1]??lon[0]+360)-value;
    if(distance>gap){gap=distance;edge=i;}
  });
  const west=lon[(edge+1)%lon.length]-1.5,east=lon[edge]+1.5;
  return [south,north,west,east];
}
function agg(b) {
  const subset = cells.filter(c=>inb(c,b)).map(c=>[c,scopeWeight(c)]);
  const arrays = {};
  for (const key of ["h","r","v","m","j"]) {
    const series = Array(LAST+1).fill(NaN);
    if (subset.length) {
      for (let i=startAt(); i<=LAST; i++) {
        let total=0;
        for(const [cell,weight] of subset){
          const value=cell[key][i];
          if(!Number.isFinite(value)){total=NaN;break;}
          total+=value*weight;
        }
        series[i]=total;
      }
    }
    arrays[key] = series;
  }
  return arrays;
}
const PRE=[["Custom area",null],["Global",[-90,90,-180,180]],["Amazon arc",[-20,0,-72,-45]],["Southern Africa",[-20,-5,12,38]],["Southeast Australia",[-40,-28,140,154]],["Siberia",[50,66,85,140]],["California and western US",[32,48,-125,-110]],["Mediterranean",[34,46,-5,35]],["Indo-Gangetic Plain",[24,33,70,88]],["Pampas and Gran Chaco",[-38,-22,-68,-55]],["Indonesia",[-8,2,100,125]]];
const LAND=[[[-168,66],[-141,70],[-95,72],[-80,70],[-62,60],[-53,47],[-66,44],[-76,35],[-81,30],[-80,25],[-90,29],[-97,26],[-105,22],[-95,16],[-83,9],[-92,15],[-105,20],[-112,29],[-118,33],[-124,40],[-125,49],[-135,58],[-150,60],[-165,60]],[[-80,8],[-62,10],[-50,0],[-35,-6],[-40,-22],[-48,-28],[-58,-38],[-65,-42],[-68,-53],[-74,-50],[-72,-30],[-71,-18],[-81,-5]],[[-10,36],[-9,43],[0,50],[8,54],[5,62],[15,69],[30,71],[60,69],[90,76],[130,72],[160,70],[180,68],[178,64],[160,60],[140,54],[135,43],[127,38],[122,40],[121,31],[110,21],[106,10],[100,13],[103,1],[98,8],[92,22],[80,15],[77,8],[72,20],[66,25],[57,25],[56,26],[58,20],[43,13],[35,28],[32,31],[36,36],[28,37],[26,40],[22,37],[19,42],[12,44],[18,40],[16,38],[10,44],[3,43],[-5,36]],[[-17,21],[-10,35],[10,37],[32,31],[43,12],[51,12],[40,-5],[40,-15],[35,-25],[20,-35],[12,-18],[9,-1],[9,5],[-8,4],[-17,14]],[[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-27],[150,-37],[140,-38],[130,-32],[115,-34]],[[-73,78],[-20,82],[-20,70],[-43,60],[-55,68]],[[95,5],[106,-6],[120,-9],[140,-8],[150,-6],[130,0],[118,3],[108,1]]];
const st={b:PRE[1][1],f:0,t:LAST,dm:"v",cm:"c",cmp:Y1,gm:"r"};let A,S,med,WD=null,WX=null,WK="",G=null,noFly=false,FOC=null;
function setB(a){const cl=(v,m)=>Math.max(-m,Math.min(m,Math.round(v*10)/10));if(!a.every(Number.isFinite))return;st.b=[cl(Math.min(a[0],a[1]),90),cl(Math.max(a[0],a[1]),90),cl(a[2],180),cl(a[3],180)];
["s","n","w","e"].forEach((k,j)=>$(k).value=st.b[j]);update();if(!noFly){
  const [s,n,w,e]=st.b;
  if ($("pre").value === "1") flyTo(INITIAL_VIEW.lat, INITIAL_VIEW.lon, GLOBAL_VIEW_DISTANCE);
  else flyTo((s+n)/2,centerLon(w,e),Math.min(4.2,Math.max(1.55,1.35+Math.max(n-s,lonWidth(w,e)*.6)/45)));
}}
function cellAvg(c) {
  const values = observed(c).slice(st.f, st.t+1).filter(Number.isFinite);
  return values.length ? finiteSum(values)/values.length : NaN;
}
function update(){updatePanelRegion();A=agg(st.b);S=A[st.dm];
if(observationRecord)updateSourceBadge();
med=MN.map((_,m)=>{const a=[];for(let y=0;y<NY;y++){const v=S[y*12+m];v==v&&a.push(v)}a.sort((x,y)=>x-y);const n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:0});
let tot=0;const an={};for(let i=st.f;i<=st.t&&i<=LAST;i++){if(!Number.isFinite(S[i]))continue;tot+=S[i];const y=Y0+(i/12|0);an[y]=(an[y]||0)+S[i]}
const usable=S.slice(st.f,st.t+1).filter(Number.isFinite).length;const py=Object.keys(an).sort((a,b)=>an[b]-an[a])[0],mx=Math.max(...med),pm=med.indexOf(mx),li=Math.min(st.t,LAST),la=med[li%12]?(S[li]/med[li%12]-1)*100:0;
$("kp").innerHTML=[["Hotspots in period",fmt(usable?tot:NaN),usable+" of "+(st.t-st.f+1)+" months"],["Peak fire month",mx>0?MN[pm]:"None","median of full record"],["Highest year",py||"None",py?fmt(an[py])+" hotspots":""],["Latest month vs median",Number.isFinite(S[li])&&med[li%12]?sgn(la):"Unavailable",MN[li%12]+" "+(Y0+(li/12|0))]].map(k=>`<div><span>${k[0]}</span><b>${k[1]}</b><span>${k[2]}</span></div>`).join("");
const captions = {h:"Suomi-NPP observations and experimental estimates",r:"Historical sensor record",
                  v:"Suomi-NPP VIIRS detections",m:"Terra MODIS detections",j:"NOAA-20 VIIRS detections"};
$("ct").textContent=captions[st.dm];
$("cn").textContent="Monthly detections in the selected 3° cells. Blank months indicate incomplete coverage or missing estimates."
  +(st.dm==="r"?" Terra is used through January 2012 and Suomi-NPP thereafter. Cross-sensor differences can affect comparisons.":"")
  +(st.dm==="h"?" Earlier estimates are experimental and only shown for covered cells.":"");
$("cal").innerHTML=cal();$("sc").innerHTML=seas();$("an").innerHTML=ann();alerts();if(SCP.run){sApply(SCP.ph);sUI()}drawMap();outlook();riskUI();ctx();if(DLON)dlRun();if(PLON)placesUI()}
function cal(){const y0=Y0+(st.f/12|0),y1=Y0+(st.t/12|0),rows=y1-y0+1,cw=48,ch=17,ox=34,oy=16,v=[];
for(let i=st.f;i<=st.t&&i<=LAST;i++)if(Number.isFinite(S[i]))v.push(S[i]);v.sort((a,b)=>a-b);const p=v[Math.floor(v.length*.98)]||1;
let h=`<svg viewBox="0 0 ${ox+12*cw} ${oy+rows*ch+2}" role="img" aria-label="Calendar of monthly hotspot counts by year">`;
MN.forEach((m,j)=>h+=`<text x="${ox+j*cw+cw/2}" y="11" text-anchor="middle">${m}</text>`);
for(let r=0;r<rows;r++){const y=y0+r;h+=`<text x="${ox-6}" y="${oy+r*ch+12}" text-anchor="end">${y}</text>`;
for(let m=0;m<12;m++){const i=(y-Y0)*12+m,x=S[i],ok=x==x&&i>=st.f&&i<=st.t,a=med[m]?(x/med[m]-1)*100:0;
const c=!ok?"var(--hat)":st.cm=="c"?ramp(RC,x/p):ramp(DV,.5+Math.max(-150,Math.min(150,a))/300);
h+=`<rect x="${ox+m*cw+1}" y="${oy+r*ch+1}" width="${cw-2}" height="${ch-2}" fill="${c}"${ok?` data-i="${i}"`:""}/>`}}
$("lg").innerHTML=st.cm=="c"?`<span>0</span><i style="background:linear-gradient(90deg,${RC})"></i><span>${fmt(p)} or more hotspots per month</span>`:`<span>\u2212150%</span><i style="background:linear-gradient(90deg,${DV})"></i><span>+150% vs median (blue is below, orange is above)</span>`;
return h+"</svg>"}
function axes(W,H,l,b,t,r,mx){let h="";for(let k=0;k<=3;k++){const v=mx*k/3,y=H-b-v/(mx*1.1)*(H-b-t);h+=`<line x1="${l}" x2="${W-r}" y1="${y}" y2="${y}" stroke="var(--ln)"/><text x="${l-5}" y="${y+3}" text-anchor="end">${fmt(v)}</text>`}return h}
function seas(){const W=360,H=210,l=40,b=22,t=8,r=6,cv=MN.map((_,m)=>S[(st.cmp-Y0)*12+m]),mx=Math.max(...med,...cv.filter(v=>v==v),1);
const X=m=>l+(m+.5)*(W-l-r)/12,Y=v=>H-b-v/(mx*1.1)*(H-b-t);let h=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Median by month against selected year">`+axes(W,H,l,b,t,r,mx);
med.forEach((v,m)=>h+=`<rect x="${X(m)-9}" y="${Y(v)}" width="18" height="${H-b-Y(v)}" fill="var(--bar)"/><text x="${X(m)}" y="${H-8}" text-anchor="middle">${MN[m][0]}</text>`);
const pts=cv.map((v,m)=>v==v?[X(m),Y(v)]:null).filter(Boolean);
h+=`<polyline points="${pts.join(" ")}" fill="none" stroke="var(--ac)" stroke-width="2"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="var(--ac)"/>`).join("");
$("sn").textContent=`Gray bars: full-record median. Solid line: ${st.cmp}${st.cmp==Y1?" (through "+MN[LAST%12]+")":""}.`;return h+"</svg>"}
function ann() {
  const W=360,H=210,l=40,b=22,t=8,r=8,n=Math.max(1,NY);
  const totals = a=>Array.from({length:n},(_,y)=> {
    const months=a.slice(y*12,y*12+12);
    return months.length===12 ? sumWhenComplete(months) : NaN;
  });
  const raw=totals(A.m), reference=totals(A.v);
  const mx=Math.max(...raw.filter(Number.isFinite),...reference.filter(Number.isFinite),1);
  const X=i=>l+i*(W-l-r)/Math.max(1,n-1),Y=v=>H-b-v/(mx*1.1)*(H-b-t);
  let h=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Annual detection totals by satellite">`+axes(W,H,l,b,t,r,mx);
  for(let y=0;y<n;y+=5)h+=`<text x="${X(y)}" y="${H-8}" text-anchor="middle">${Y0+y}</text>`;
  return h+lineSegments(raw,0,X,Y,'stroke="var(--mut)" stroke-dasharray="5 3"')
    +lineSegments(reference,0,X,Y,'stroke="var(--ac)"')+"</svg>";
}
function alerts(){const L=[];for(let i=Math.min(st.t,LAST),k=0;k<12&&i>=st.f;k++,i--){const a=med[i%12]?(S[i]/med[i%12]-1)*100:0;if(a>=50)L.push([i,a])}
$("al").innerHTML=L.length?L.map(([i,a])=>`<li><span><b>${MN[i%12]} ${Y0+(i/12|0)}</b> at ${S[i].toLocaleString()} detections</span><span>+${Math.round(a)}% vs median</span></li>`).join(""):`<li>No available month in this window reached 150% of its median.</li>`}
function landTex(){const c=document.createElement("canvas");c.width=2048;c.height=1024;const g=c.getContext("2d"),X=lo=>(lo+180)/360*2048,Y=la=>(90-la)/180*1024,gr=g.createLinearGradient(0,0,0,1024);
gr.addColorStop(0,"#0f2036");gr.addColorStop(.5,"#0b1a2c");gr.addColorStop(1,"#0f2036");g.fillStyle=gr;g.fillRect(0,0,2048,1024);
g.filter="blur(5px)";g.fillStyle="#1e3430";LAND.forEach(p=>{g.beginPath();p.forEach((q,i)=>i?g.lineTo(X(q[0]),Y(q[1])):g.moveTo(X(q[0]),Y(q[1])));g.closePath();g.fill()});g.filter="none";
g.strokeStyle="rgba(150,180,210,.07)";g.lineWidth=1;for(let lo=-180;lo<=180;lo+=30){g.beginPath();g.moveTo(X(lo),0);g.lineTo(X(lo),1024);g.stroke()}for(let la=-60;la<=60;la+=30){g.beginPath();g.moveTo(0,Y(la));g.lineTo(2048,Y(la));g.stroke()}
return new THREE.CanvasTexture(c)}
$("pre").innerHTML=PRE.map((p,i)=>`<option value="${i}">${p[0]}</option>`).join("");$("pre").value="1";
$("pre").onchange=e=>{const b=PRE[+e.target.value][1];if(b)setB(b);else update()};
["s","n","w","e"].forEach(k=>$(k).onchange=()=>{$("pre").value="0";setB([+$("s").value,+$("n").value,+$("w").value,+$("e").value])});
$("cy").innerHTML=Array.from({length:NY},(_,i)=>`<option>${Y0+i}</option>`).join("");$("cy").value=Y1;
$("cy").onchange=e=>{st.cmp=+e.target.value;update()};
const pm=v=>{const[y,m]=v.split("-").map(Number);return Math.max(startAt(),Math.min(LAST,(y-Y0)*12+m-1))};
["f","t"].forEach(k=>$(k).onchange=()=>{if(!$(k).value)return;st[k]=pm($(k).value);if(st.f>st.t){const x=st.f;st.f=st.t;st.t=x}
const s=i=>(Y0+(i/12|0))+"-"+String(i%12+1).padStart(2,"0");$("f").value=s(st.f);$("t").value=s(st.t);update()});
document.querySelectorAll(".seg input").forEach(i=>i.onchange=()=>{st[i.name]=i.value;update()});
const tip=$("tip");$("cal").onpointermove=e=>{const r=e.target.closest("rect[data-i]");if(!r){tip.style.display="none";return}
const i=+r.dataset.i,m=i%12,a=med[m]?(S[i]/med[m]-1)*100:0;tip.innerHTML=`<b>${MN[m]} ${Y0+(i/12|0)}</b><br>${S[i].toLocaleString()} hotspots<br>${a>=0?"+":"\u2212"}${Math.abs(a).toFixed(0)}% vs median (${Math.round(med[m]).toLocaleString()})`;
tip.style.display="block";tip.style.left=Math.min(e.clientX+14,innerWidth-200)+"px";tip.style.top=e.clientY+14+"px"};
$("cal").onpointerleave=()=>tip.style.display="none";
function parseHistory(d) {
  const month = /^(?:20[0-9]{2})-(?:0[1-9]|1[0-2])$/;
  if(d?.schema_version!==2 || d.kind!=="monthly_detections" || !/^[a-f0-9]{64}$/.test(d.dataset_id)
      || d.grid?.degrees!==3 || d.grid?.rows!==60 || d.grid?.columns!==120
      || d.grid?.crs!=="EPSG:4326" || !month.test(d.start) || !month.test(d.end)
      || d.start<"2001-01" || d.end<d.start || !Array.isArray(d.cells) || !d.cells.length
      || d.cells.length>7200) throw Error("Expected a schema-v2 3° monthly record.");
  const first = dateIndex(d.start), last = dateIndex(d.end), length = last-first+1;
  for(const key of ["Terra","Suomi-NPP","NOAA-20"]) {
    const months=d.coverage?.[key];
    if(!Array.isArray(months)||months.length!==length||months.some(status=>
      !status||typeof status.complete_daily_archive!=="boolean"||!Array.isArray(status.qualities)
      ||status.qualities.some(q=>q!=="sp"&&q!=="nrt"))) throw Error("Invalid monthly coverage.");
  }
  const seen=new Set();
  return d.cells.map(input=>{
    const {id,lat,lon,cc}=input;
    if(!Number.isInteger(id)||id<0||id>=7200||seen.has(id)
        || lat!==-88.5+Math.floor(id/120)*3 || lon!==-178.5+id%120*3
        || !cc || Array.isArray(cc) || Object.entries(cc).some(([k,v])=>!/^[A-Z]{2}$/.test(k)||!Number.isFinite(v)||v<0||v>1)
        || Object.values(cc).reduce((a,b)=>a+b,0)>1.000001) throw Error("Invalid grid cell.");
    seen.add(id);
    const cell={id,lat,lon,cc};
    for(const [target,source] of [["v","viirs"],["m","terra"],["r","r"],["h","h"],["j","noaa20"]]) {
      const history=input[source];
      if(!Array.isArray(history)||history.length!==length
          || history.some(v=>v!==null&&(!Number.isFinite(v)||v<0))) throw Error("Invalid cell history.");
      cell[target]=new Float64Array(last+1).fill(NaN);
      cell[target].set(history.map(v=>v??NaN),first);
    }
    if (Array.isArray(input.backcast_lo) && Array.isArray(input.backcast_hi)
        && input.backcast_lo.length===length && input.backcast_hi.length===length) {
      cell.backcastLo=Array(first).fill(null).concat(input.backcast_lo);
      cell.backcastHi=Array(first).fill(null).concat(input.backcast_hi);
    }
    return cell;
  });
}
function useData(d,label,next=parseHistory(d)) {
  stopForecast();
  observationRecord=d;
  datasetId=d.dataset_id;
  cells=next;
  real=true;
  LAST=dateIndex(d.end);
  Y1=Number(d.end.slice(0,4)); NY=Y1-Y0+1;
  stopScenario();SCP.run=0;$("so").hidden=true;st.sel=-1; st.f=startAt(); st.t=LAST; st.cmp=Y1;
  $("cy").innerHTML=Array.from({length:Y1-Number(d.start.slice(0,4))+1},
                              (_,i)=>`<option>${Number(d.start.slice(0,4))+i}</option>`).join("");
  $("cy").value=Y1;
  for(const id of ["f","t"]) {$(id).min=d.start;$(id).max=d.end;}
  $("f").value=d.start; $("t").value=d.end;
  const status=d.coverage?.["Suomi-NPP"]?.at(-1);
  const qualifier=status?.qualities?.includes("nrt")?" · latest month uses near-real-time data":status&&!status.complete_daily_archive?" · latest month incomplete":"";
  $("tg").textContent=label+" · "+d.start+" to "+d.end+qualifier;
  $("demo-status").hidden=false;
  showCell();
  attachFC(matchingForecast());
  update();
}
function updateSourceBadge(){
  const cutoff=dateIndex("2012-02");
  const platform={v:"Suomi-NPP",m:"Terra",j:"NOAA-20"}[st.dm];
  const phases=[];
  for(let i=st.f;i<=st.t;i++){
    const key=platform || (i>=cutoff?"Suomi-NPP":"Terra");
    const status=observationRecord.coverage?.[key]?.[i-startAt()];
    if(status?.complete_daily_archive)phases.push(...status.qualities);
  }
  const offset=st.t-startAt();
  const latest=platform&&observationRecord.coverage?.[platform]?.[offset];
  let caption=recordNames[st.dm]+" · 3° cells";
  if(phases.includes("nrt"))caption+=" · includes provisional counts";
  else if(latest&&!latest.complete_daily_archive)caption+=" · latest selected month unavailable";
  $("demo-status").textContent=caption;
}
$("ld").onchange=async event=>{
  const input=event.target;
  if(!input.files.length)return;
  const ticket=++importSequence;
  const files=[...input.files];input.value="";
  try{
    let d,fc;
    for(const file of files) {
      const value=JSON.parse(await file.text());
      if(value.kind==="monthly_detections"&&!d)d=value;
      else if(value.kind==="forecast"&&!fc)fc=value;
      else throw Error("Choose one record and one forecast, using PyroScale schema v2.");
    }
    if(ticket!==importSequence)return;
    const parsed=d?parseHistory(d):null;
    if(fc&&!validateForecast(fc,d||observationRecord))throw Error("The forecast must match the observation dataset ID, date and grid.");
    ++dataLoadSequence;
    if(fc)FCfile=fc;
    if(d)useData(d,"Imported FIRMS record",parsed);
    else {attachFC(matchingForecast());update();}
  }catch(error){if(ticket===importSequence){$("tg").textContent=error.message;$("demo-status").textContent=error.message;}}
};
const med1=a=>{a=a.filter(v=>v==v).sort((x,y)=>x-y);const n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:0};
const dev=a=>{const mm=MN.map((_,m)=>med1(a.filter((_,i)=>i%12==m)));return a.map((v,i)=>mm[i%12]?(v/mm[i%12]-1)*100:NaN)};
const roll=(a,k)=>a.map((_,i)=>{let s=0,n=0;for(let j=Math.max(0,i-k+1);j<=i;j++)if(a[j]==a[j]){s+=a[j];n++}return n==k?s/n:NaN});
const corr=(x,y)=>{const p=[];x.forEach((v,i)=>v==v&&y[i]==y[i]&&p.push([v,y[i]]));const n=p.length;if(n<12)return null;const mx=p.reduce((s,q)=>s+q[0],0)/n,my=p.reduce((s,q)=>s+q[1],0)/n;let a=0,b=0,c=0;p.forEach(q=>{a+=(q[0]-mx)*(q[1]-my);b+=(q[0]-mx)**2;c+=(q[1]-my)**2});return b&&c?[a/Math.sqrt(b*c),n]:null};
const mon=(d,k,mean)=>{const s=Array(NY*12).fill(0),n=Array(NY*12).fill(0);d.time.forEach((t,j)=>{const v=d[k]&&d[k][j];if(v==null)return;const i=(+t.slice(0,4)-Y0)*12+ +t.slice(5,7)-1;if(i>=0&&i<s.length){s[i]+=v;n[i]++}});return s.map((v,i)=>n[i]?mean?v/n[i]:v:NaN)};
async function wxRun(ticket){const b=st.b,la=((b[0]+b[1])/2).toFixed(2),lo=centerLon(b[2],b[3]).toFixed(2),k=la+","+lo;
if(WK!=k||!WX){WX=null;$("wn").textContent="Loading ERA5 weather for "+la+", "+lo+"...";
try{const lim=new Date(Date.now()-6*864e5).toISOString().slice(0,10),e0=(Y0+(LAST/12|0))+"-"+String(LAST%12+1).padStart(2,"0")+"-28",e=e0<lim?e0:lim,
q=v=>fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=${ym(startAt())}-01&end_date=${e}&daily=${v}&timezone=UTC`,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw 0;return r.json()}),a=(await q("precipitation_sum,temperature_2m_mean")).daily;let x={time:[]};
try{x=(await q("soil_moisture_0_to_7cm_mean,relative_humidity_2m_mean")).daily}catch(_){}
if(ticket!==contextSequence)return;
WX={P:mon(a,"precipitation_sum"),T:mon(a,"temperature_2m_mean",1),SM:mon(x,"soil_moisture_0_to_7cm_mean",1)};WK=k}
catch(_){if(ticket===contextSequence){$("wn").textContent="Could not reach Open-Meteo. Check your internet connection and try the context layer again.";$("wc").innerHTML="";$("wk").textContent="";}return}}
wxDraw(la,lo)}
function wxDraw(la,lo){const H=S.map((v,i)=>med[i%12]?(v/med[i%12]-1)*100:NaN),R=dev(roll(WX.P,3)),M=dev(WX.SM),hm=M.some(v=>v==v),f=st.f,t=Math.min(st.t,LAST),n=t-f+1,W=640,l=44,pw=W-l-6,X=i=>l+(i-f+.5)*pw/n,Y=(c,v)=>c-Math.max(-150,Math.min(150,v))/150*36;
let h=`<svg viewBox="0 0 ${W} 196" role="img" aria-label="Monthly hotspot anomaly against rainfall and soil moisture anomaly">`;
[[46,"Hotspots"],[146,"Weather"]].forEach(([c,tx])=>h+=`<line x1="${l}" x2="${W-6}" y1="${c}" y2="${c}" stroke="var(--ln)"/><text x="${l-4}" y="${c-30}" text-anchor="end">+150%</text><text x="${l-4}" y="${c+40}" text-anchor="end">\u2212150%</text><text x="${l+4}" y="${c-30}">${tx}</text>`);
for(let i=f;i<=t;i++)if(H[i]==H[i]){const y=Y(46,H[i]);h+=`<rect x="${X(i)-Math.max(.5,pw/n*.4)}" y="${Math.min(y,46)}" width="${Math.max(1,pw/n*.8)}" height="${Math.abs(y-46)}" fill="${H[i]>=0?"var(--ac)":"var(--bar)"}"/>`}
const ln=(a,c)=>{const p=[];for(let i=f;i<=t;i++)if(a[i]==a[i])p.push(X(i)+","+Y(146,a[i]));return p.length?`<polyline points="${p.join(" ")}" fill="none" stroke="${c}" stroke-width="1.6"/>`:""};
for(let y=Math.ceil(f/12);y*12<=t;y+=Math.max(1,Math.round(n/96)))h+=`<text x="${X(y*12)}" y="192" text-anchor="middle">${Y0+y}</text>`;
$("wc").innerHTML=h+ln(R,"#2c7bb6")+(hm?ln(M,"#c2410c"):"")+"</svg>";
const c1=corr(H.slice(f,t+1),R.slice(f,t+1)),c2=hm&&corr(H.slice(f,t+1),M.slice(f,t+1)),fm=v=>v?"r = "+(v[0]<0?"\u2212":"+")+Math.abs(v[0]).toFixed(2)+" over "+v[1]+" months":"not enough overlap",lt=WX.T[t];
$("wn").textContent="Top: hotspot anomaly against the full-record median. Bottom: 3-month rainfall anomaly (blue)"+(hm?" and soil moisture anomaly (orange)":"")+", as percent from each calendar month median, at "+la+", "+lo+" (ERA5 via Open-Meteo).";
$("wk").textContent="Correlation with hotspot anomaly: rainfall "+fm(c1)+(hm?"; soil moisture "+fm(c2):"; soil moisture unavailable for this request")+(lt==lt?". Mean temperature in "+MN[t%12]+" "+(Y0+(t/12|0))+" was "+lt.toFixed(1)+" \u00b0C against a "+med1(WX.T.filter((_,i)=>i%12==t%12)).toFixed(1)+" \u00b0C median":"")+". Correlation is not proof of cause, and the series describes one point at the centre of the area."}
async function wdRun(ticket){const b=st.b,la=(b[0]+b[1])/2,lo=centerLon(b[2],b[3]),T=$("wdt");T.textContent="Loading current wind and air quality...";
try{const j=u=>fetch(u,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw 0;return r.json()}),[w,a]=await Promise.all([j(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`),j(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}&current=pm2_5,us_aqi`)]),
c=w.current,q=a.current,fr=c.wind_direction_10m,to=(fr+180)%360,D=["north","northeast","east","southeast","south","southwest","west","northwest"],nm=v=>D[Math.round(v/45)%8];
if(ticket!==contextSequence)return;WD={la,lo,to};T.textContent="Wind at the centre of the area blows from the "+nm(fr)+" ("+Math.round(fr)+"\u00b0) at "+Math.round(c.wind_speed_10m)+" km/h, toward the "+nm(to)+". PM2.5 is "+(q.pm2_5??"n/a")+" \u00b5g/m\u00b3 and the US AQI is "+(q.us_aqi??"n/a")+". Current conditions from Open-Meteo.";drawMap()}
catch(_){if(ticket===contextSequence){WD=null;T.textContent="Could not reach Open-Meteo. Check your internet connection and try the context layer again.";drawMap();}}}
let tmr,contextSequence=0;function ctx(){clearTimeout(tmr);const ticket=++contextSequence;tmr=setTimeout(()=>{$("lw").checked&&wxRun(ticket);$("lx").checked&&wdRun(ticket)},600)}
$("lw").onchange=()=>{$("wx").hidden=!$("lw").checked;ctx()};
$("lx").onchange=()=>{$("wd").hidden=!$("lx").checked;drawMap();ctx()};
const idb=(m,v,k)=>new Promise(res=>{try{const q=indexedDB.open("pyro",1);q.onupgradeneeded=()=>q.result.createObjectStore("k");q.onsuccess=()=>{const s=q.result.transaction("k",m=="get"?"readonly":"readwrite").objectStore("k"),r=m=="get"?s.get(k||"d"):s.put(v,k||"d");r.onsuccess=()=>res(r.result);r.onerror=()=>res()};q.onerror=()=>res()}catch(_){res()}});
st.vm="o";st.fk=1;st.rs="s";st.sel=-1;
let FC=null,FCfile=null,FS=0,RK=[],RKS=[];
const FH=24,LV=["Below threshold","Elevated","High","Very high"],RCOL=["#3d5875","#ffd166","#ff7a45","#ff2d55"],RT={c:[.8,.87],s:[.9,.97],t:[.95,.99]};
const ym=i=>(Y0+(i/12|0))+"-"+String(i%12+1).padStart(2,"0"),mname=i=>MN[i%12]+" "+(Y0+(i/12|0)),lcIdx=()=>LAST;
const cval=c=>st.vm=="x"?(SCP.run&&c.sB!=null?(st.fx=="c"?c.sd:(st.fx=="b"?c.sB:c.sP)/12):0):st.vm=="f"?(c.f?c.f[st.fk-1]:0):st.vm=="r"?(c.rk?c.rk.v:0):cellAvg(c);
const MT=()=>st.vm=="x"?(st.fx=="c"?"% change vs the reference":"illustrative detections per month"):st.vm=="f"?"NOAA-20 detections forecast for "+mname(FS+st.fk-1):st.vm=="r"?"NOAA-20 detections in first forecast month":"detections per available month";
function validateForecast(f,d) {
  if (!d || f?.schema_version!==2 || f.kind!=="forecast" || f.status!=="evaluated"
      || f.platform!=="NOAA-20" || f.dataset_id!==d.dataset_id || f.origin!==d.end || f.start!==ym(dateIndex(d.end)+1)
      || f.grid?.degrees!==3 || f.months!==FH || f.methods?.length!==FH
      || !Array.isArray(f.cells) || !f.cells.length) return false;
  const validSeries=a=>Array.isArray(a)&&a.length===FH&&a.every(v=>v===null||Number.isFinite(v)&&v>=0);
  const ids=new Set(d.cells.map(c=>c.id)),seen=new Set();
  return f.cells.every(c=>{
    if(!ids.has(c.id)||seen.has(c.id)||!["f","lo","hi","baseline"].every(k=>validSeries(c[k])))return false;
    seen.add(c.id);
    return c.f.every((v,k)=>{
      const [lo,hi]=[c.lo[k],c.hi[k]];
      return (lo===null&&hi===null)||(v!==null&&lo!==null&&hi!==null&&lo<=v&&v<=hi);
    });
  });
}
function matchingForecast() {
  return validateForecast(FCfile,observationRecord) ? FCfile : null;
}
function attachFC(F) {
  FC=F;
  FS=F ? dateIndex(F.start) : LAST+1;
  st.fk=1;
  $("fk").value=1;
  const byCell=new Map((F?.cells||[]).map(cell=>[cell.id,cell]));
  cells.forEach(cell=>{
    cell.projection=byCell.get(cell.id)||null;
    cell.f=cell.projection?.f.map(v=>v??NaN)||null;
    cell.rk=null;
  });
  if(!F)RK=[];
  derive();
  setFocus();
  modelSummary();
  riskCalc();
}
const methodNames={poisson_lightgbm:"Poisson LightGBM",seasonal_median:"Seasonal median",seasonal_naive:"Seasonal naïve"};
function modelSummary() {
  $("tf").textContent=FC?"Evaluated forecast":"Forecast unavailable";
  $("model-summary").textContent=FC
    ? "Issued after "+mname(FS-1)+". The target is science-quality NOAA-20 detections. Each lead uses the best method on development forecasts or a preset seasonal median if selection data are limited. Training uses a five-month reporting lag."
    : "An evaluated forecast for this observation dataset is unavailable.";
  const rows=[1,3,6,12,24].filter(k=>FC?.methods?.[k-1]);
  $("model-skill").hidden=!rows.length;
  $("model-skill").innerHTML=rows.map(k=>{
    const selected=FC.methods[k-1],raw=FC.candidate_skill?.[k-1],
          deployed=FC.skill?.[k-1],coverage=FC.coverage?.[k-1];
    const pct=v=>Number.isFinite(v)?sgn(v*100):"unavailable";
    return `<div><dt>${k} mo · ${methodNames[selected]||"Baseline"}</dt><dd>${pct(deployed)} skill</dd>
            <dd>LightGBM ${pct(raw)} · coverage ${Number.isFinite(coverage)?Math.round(coverage*100)+"%":"unavailable"}</dd></div>`;
  }).join("");
  $("model-window").textContent=FC ? "Test skill relative to the seasonal median. Negative skill means higher MAE. Coverage measures the fraction of withheld cell counts inside nominal 80% intervals." : "";
}
function riskCalc(){
  if(!FC)return;
  const [high,veryHigh]=RT[st.rs],tm=FS%12;
  for(const c of cells) {
    c.rk=null;
    const value=c.f?.[0], history=[];
    if(!Number.isFinite(value))continue;
    for(let i=tm;i<FS-5&&i<c.j.length;i+=12)
      if(Number.isFinite(c.j[i])&&observationRecord.coverage?.["NOAA-20"]?.[i-startAt()]?.qualities?.join()==="sp")history.push(c.j[i]);
    if(history.length<5)continue;
    history.sort((a,b)=>a-b);
    const quantile=q=>{
      const position=q*(history.length-1), index=Math.floor(position);
      return history[index]+(history[index+1]-history[index])*(position-index);
    };
    const pr=history.filter(v=>v<=value).length/history.length;
    c.rk={v:value,pr,n:history.length,l:value<20?0:value>quantile(veryHigh)?3:value>quantile(high)?2:value>quantile(.75)?1:0};
  }
  clusters();
}
function clusters(){const fl=[];cells.forEach((c,k)=>{if(c.rk&&c.rk.l>=2&&(!FOC||FOC(c)))fl.push(k)});const key=new Map(fl.map(k=>[cells[k].lat+","+cells[k].lon,k])),seen=new Set(),out=[];
for(const k of fl){if(seen.has(k))continue;const q=[k],m=[];seen.add(k);while(q.length){const i=q.pop();m.push(i);const c=cells[i];for(let dy=-3;dy<=3;dy+=3)for(let dx=-3;dx<=3;dx+=3){const j=key.get((c.lat+dy)+","+wrapLon(c.lon+dx));if(j!=null&&!seen.has(j)){seen.add(j);q.push(j)}}}
out.push({m,n:m.length,l:Math.max(...m.map(i=>cells[i].rk.l)),tot:m.reduce((s,i)=>s+cells[i].rk.v,0),b:boundsForCells(m.map(i=>cells[i]))})}
out.sort((a,b)=>b.l-a.l||b.tot-a.tot);RK=out;riskUI()}
function riskUI(){if(!FC){$("rks").textContent="A matched forecast is required for the activity comparison.";$("rkl").innerHTML="";return}
const sc=$("rkm").checked,L=RK.filter(r=>r.l>=2&&(!sc||r.m.some(i=>inb(cells[i],st.b))));RKS=L.slice(0,8);
$("rks").textContent=(L.length?L.length+" area"+(L.length>1?"s":"")+" with high or very high projected activity":"No areas with high projected activity")+" for "+mname(FS)+(sc?" in your selected area":FOC?" in your selected places":" worldwide")+".";
$("rkl").innerHTML=RKS.map((r,j)=>`<li><span><b>${LV[r.l]}</b> · ${((r.b[0]+r.b[1])/2).toFixed(0)}\u00b0, ${centerLon(r.b[2],r.b[3]).toFixed(0)}\u00b0<br><small>${r.n} cell${r.n>1?"s":""}, about ${fmt(r.tot)} detections projected</small></span><button data-r="${j}">Show</button></li>`).join("");}
function lineSegments(values, offset, X, Y, attributes) {
  let segments=[],current=[];
  for(const [i,v] of Array.from(values).entries()) {
    if(Number.isFinite(v))current.push(`${X(i+offset)},${Y(v)}`);
    else if(current.length){segments.push(current);current=[];}
  }
  if(current.length)segments.push(current);
  return segments.map(p=>p.length===1
    ? `<circle cx="${p[0].split(",")[0]}" cy="${p[0].split(",")[1]}" r="1.5" fill="var(--ac)"/>`
    : `<polyline points="${p.join(" ")}" fill="none" ${attributes}/>`).join("");
}
function fch(hs,lc,F,md,W,H,n0,full,interval=null,baseline=null){
  const x0=Math.max(startAt(),lc-n0+1),n=FS+FH-x0,l=full?44:6,b=full?22:4,t=6;
  const observed=Array.from(hs.slice(x0,lc+1));
  const typical=baseline || Array.from({length:FH},(_,k)=>md[(FS+k)%12]);
  const max=Math.max(...[...observed,...F,...typical,...(interval?.hi||[])].filter(Number.isFinite),1)*1.05;
  const X=i=>l+(i-x0)*(W-l-6)/Math.max(1,n-1),Y=v=>H-b-v/max*(H-b-t);
  let h=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly detections and forecast">`;
  if(full)for(let k=0;k<=3;k++){const v=max*k/3;h+=`<line x1="${l}" x2="${W-6}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--ln)"/><text x="${l-5}" y="${Y(v)+3}" text-anchor="end">${fmt(v)}</text>`;}
  if(interval) {
    for(let start=0,end=0;start<FH;start=end+1) {
      end=start;
      if(interval.lo[start]===null||interval.hi[start]===null)continue;
      while(end+1<FH&&interval.lo[end+1]!==null&&interval.hi[end+1]!==null)end++;
      const top=interval.hi.slice(start,end+1).map((v,k)=>`${X(FS+start+k)},${Y(v)}`);
      const bottom=interval.lo.slice(start,end+1).map((v,k)=>`${X(FS+start+k)},${Y(v)}`).reverse();
      h+=`<polygon points="${[...top,...bottom].join(" ")}" fill="var(--ac)" opacity=".2"/>`;
    }
  }
  h+=lineSegments(typical,FS,X,Y,'stroke="var(--mut)" stroke-dasharray="2 3"')
    +lineSegments(observed,x0,X,Y,'stroke="var(--ink)" stroke-width="1.6"')
    +lineSegments(F,FS,X,Y,'stroke="var(--ac)" stroke-width="2" stroke-dasharray="5 3"');
  if(full)for(let i=x0;i<FS+FH;i+=12)h+=`<text x="${X(i)}" y="${H-7}" text-anchor="middle">${MN[i%12]} ${String(Y0+(i/12|0)).slice(2)}</text>`;
  return h+"</svg>";
}
function outlook(){const el=$("oc"),no=t=>{el.innerHTML="";$("forecast-key").hidden=true;$("on").textContent=t;$("ok").textContent=""};if(!FC||!A)return no("No forecast loaded.");
const sel=cells.filter(c=>c.f&&inb(c,st.b)),lc=lcIdx();if(!sel.length)return no("No forecast cells fall inside this area.");
const F=Array.from({length:FH},(_,k)=>sumWhenComplete(sel.map(c=>scopeWeight(c)*c.f[k])));
const hs=Array.from({length:lc+1},(_,month)=>sumWhenComplete(sel.map(c=>scopeWeight(c)*c.j[month])));
const md=MN.map((_,month)=>med1(hs.filter((_,index)=>index%12===month)));
const baseline=Array.from({length:FH},(_,k)=>sumWhenComplete(sel.map(c=>scopeWeight(c)*(c.projection.baseline[k]??NaN))));
el.innerHTML=fch(hs,lc,F,md,420,176,48,true,null,baseline);
$("forecast-key").hidden=false;
const y12=sumWhenComplete(F.slice(0,12)),ty=sumWhenComplete(baseline.slice(0,12));
$("on").textContent="NOAA-20 detections across "+sel.length.toLocaleString()+" cells with forecasts. Select a cell to see its interval where available. Regional totals have no calibrated interval.";
$("ok").textContent="Projected over 12 months: "+fmt(y12)+" hotspots. Typical seasonal total: "+fmt(ty)+".";}

function selectCell(k, focus = false){st.sel=k;showCell();drawMap();tab("p", focus)}
function showCell(){const el=$("ci"),c=cells[st.sel];if(!c){el.innerHTML='<p class="note" style="margin:0">Select a hotspot on the globe to see its activity and forecast.</p>';return}
const lc=lcIdx(),v=observed(c),md=c.md,pk=md.indexOf(Math.max(...md)),cs=scopeCells();let tot=0;const an={};
for(let i=st.f;i<=st.t&&i<=LAST;i++){if(!Number.isFinite(v[i]))continue;tot+=v[i];const y=Y0+(i/12|0);an[y]=(an[y]||0)+v[i]}
const py=Object.keys(an).sort((a,b)=>an[b]-an[a])[0],r=c.rk,
lv=LY.filter(l=>SEL.has(l[0])).map(l=>{const x=l[2](c),a=cells.map(l[2]).filter(Number.isFinite);return `<tr><td>${esc(l[1])}</td><td>${f2(x)}</td><td>${Number.isFinite(x)&&a.length?ord(Math.round(a.filter(z=>z<=x).length/a.length*100)):"n/a"}</td></tr>`}).join("");
el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">Cell ${cn(c)}</h2><button id="cx" aria-label="Close">\u00d7</button></div><p class="note" id="point-place" style="margin:4px 0 10px">Looking up the place name...</p>
<table><tr><td>Hotspots in the chosen period</td><td><b>${fmt(Object.keys(an).length?tot:NaN)}</b></td></tr><tr><td>Latest record month (${mname(lc)})</td><td><b>${fmt(v[lc])}</b>, ${Number.isFinite(c.an)?sgn(c.an)+" vs NOAA-20 seasonal median":"comparison unavailable"}</td></tr><tr><td>Usual peak month</td><td><b>${MN[pk]}</b> (${fmt(md[pk])})</td></tr><tr><td>Busiest year in the period</td><td><b>${py||"none"}</b>${py?" ("+fmt(an[py])+")":""}</td></tr>
<tr><td>Activity comparison · ${mname(FS)}</td><td>${r?`<b>${LV[r.l]}</b>, ${ord(Math.round(r.pr*100))} empirical percentile from ${r.n} seasons`:"Unavailable"}</td></tr>
<tr><td>Forecast, next 3 months</td><td>${c.f?c.f.slice(0,3).map(fmt).join(", "):"none"}</td></tr>
${SCP.run&&c.sd!=null?`<tr><td>Scenario, ${SCP.yr}</td><td><b>${sgn(c.sd)}</b> (${fmt(c.sB)} to ${fmt(c.sP)} a year)</td></tr>`:""}</table>
${c.f?'<h2 style="margin:14px 0 6px">NOAA-20 history and forecast</h2>'+fch(c.j,lc,c.f,md,440,150,60,true,c.projection,c.projection.baseline.map(v=>v??NaN)):""}
${lv?`<h2 style="margin:14px 0 6px">Selected datasets for this cell</h2><table><tr><th>Dataset</th><th>Value</th><th>Rank among all cells</th></tr>${lv}</table>`:""}
<p class="note">One 3° cell spans about 330 km north to south. A place name is a geographic reference. Nominal 80% prediction intervals are shaded when available.</p>
${st.dm==="h"&&c.backcastLo?.some(Number.isFinite)?'<details><summary>Experimental history intervals</summary><ul>'+c.backcastLo.map((v,i)=>Number.isFinite(v)&&i>=st.f&&i<=st.t?`<li>${ym(i)} · ${fmt(c.h[i])} estimated detections (${fmt(v)}–${fmt(c.backcastHi[i])})</li>`:"").join("")+"</ul></details>":""}
<div class="row" style="justify-content:flex-start"><button class="p" id="cu">Use this cell as my area</button><button id="cq">Ask the analyst about it</button></div>`;
$("cx").onclick=()=>{st.sel=-1;showCell();drawMap()};$("cu").onclick=()=>{$("pre").value="0";setB([c.lat-1.5,c.lat+1.5,c.lon-1.5,c.lon+1.5])};
$("cq").onclick=()=>{tab("d");$("aiq").value="Analyze the point at "+cn(c)+": how active is it, how does the outlook compare with its usual season, and how does it compare with the rest of my selected area?";$("aiq").focus()};
const area=Object.entries(c.cc).sort((a,b)=>b[1]-a[1]).slice(0,4);
$("point-place").textContent=area.length?area.map(([code,weight])=>(CN[code]||code)+" "+Math.round(weight*100)+"%").join(" · ")+" of cell area":"Unassigned cell area";}
function legend(upper) {
  const content = $("legend-content"), scenario = st.vm === "x", change = scenario && st.fx === "c";
  $("fkl").hidden = st.vm !== "f" || !FC;
  if ($("fkl").hidden) stopForecast();
  $("fxl").hidden = !scenario;
  const scenarioYear = $("scenario-map-year");
  scenarioYear.hidden = !scenario || !SCP.run;
  if (scenario && SCP.run) scenarioYear.textContent = `Showing ${SCP.yr} · What-if projection`;
  mapOverview();
  const month = mname(FS + st.fk - 1);
  $("fkv").textContent = month;
  $("fk").setAttribute("aria-valuetext", month);
  $("fk").style.setProperty("--elapsed", (st.fk - 1) / (FH - 1) * 100 + "%");
  $("timeline-start").textContent = mname(FS);
  $("timeline-end").textContent = mname(FS + FH - 1);
  if ((st.vm==="f"||st.vm==="r")&&!FC) {
    content.textContent="A matched NOAA-20 forecast is unavailable.";
    return;
  }
  if (st.vm === "r") {
    content.innerHTML = `<strong>Activity vs. usual · ${mname(FS)}</strong><div class="risk-scale">` +
      LV.map((name, i) => `<span><i style="background:${RCOL[i]}"></i>${name}</span>`).join("") + "</div>";
    return;
  }
  if (scenario && !SCP.run) {
    content.textContent = "Run a scenario to map the results.";
    return;
  }
  const title = change ? "Change from baseline" : scenario ? (st.fx === "b" ? "Baseline monthly hotspots" : "Scenario monthly hotspots") :
    st.vm === "f" ? "NOAA-20 forecast · "+(methodNames[FC.methods[st.fk-1]]||"Baseline") : "Mean monthly detections";
  content.innerHTML = `<strong>${change ? title : title + " per cell"}</strong><div class="scale-track">
    <i class="legend-scale" style="--scale-colors:${change ? DV : HOTSPOT_COLORS}"></i>
    <div class="legend-ends"><span>${change ? "−100%" : "0"}</span>${change ? "<span>0%</span>" : ""}<span>${change ? "+100%" : upper == null ? "High" : fmt(upper) + "+"}</span></div></div>`;
}
let forecastTimer = null;
const forecastPlay = $("forecast-play");
function stopForecast() {
  if (forecastTimer === null) return;
  clearInterval(forecastTimer);
  forecastTimer = null;
  forecastPlay.setAttribute("aria-label", "Play forecast months");
  forecastPlay.title = "Play forecast months";
  forecastPlay.firstElementChild.textContent = "▶";
}
function forecastMonth(month) {
  st.fk = month;
  $("fk").value = month;
  drawMap();
}
$("fk").oninput = event => {
  stopForecast();
  forecastMonth(Number(event.target.value));
};
forecastPlay.onclick = () => {
  if (forecastTimer !== null) {
    stopForecast();
    return;
  }
  if (st.fk === FH) forecastMonth(1);
  forecastPlay.setAttribute("aria-label", "Pause forecast months");
  forecastPlay.title = "Pause forecast months";
  forecastPlay.firstElementChild.textContent = "Ⅱ";
  forecastTimer = setInterval(() => {
    forecastMonth(st.fk + 1);
    if (st.fk === FH) stopForecast();
  }, 700);
};
document.addEventListener("visibilitychange", () => { if (document.hidden) stopForecast(); });
$("rs").onchange=e=>{st.rs=e.target.value;riskCalc();drawMap()};
$("rkm").onchange=riskUI;
$("rkl").onclick=e=>{const b=e.target.closest("button[data-r]");if(!b)return;const r=RKS[+b.dataset.r];$("pre").value="0";setB([r.b[0],r.b[1],r.b[2],r.b[3]])};
let DLON=false,UID=0;st.fx="s";
const SEL=new Set(["hm","fc","rk"]),PL0=null;
const f2=v=>Number.isFinite(v)?(Math.abs(v)>=1000?fmt(v):String(+v.toPrecision(3))):"n/a";
const cn=c=>Math.abs(c.lat).toFixed(1)+"\u00b0"+(c.lat<0?"S":"N")+", "+Math.abs(c.lon).toFixed(1)+"\u00b0"+(c.lon<0?"W":"E");
const ord=n=>{const v=n%100;return n+(["th","st","nd","rd"][(v-20)%10]||["th","st","nd","rd"][v]||"th")};const sgn=v=>{const r=Math.round(v);return(r>0?"+":r<0?"\u2212":"")+Math.abs(r)+"%"};
const scopeCells=()=>$("dlw").checked?(FOC?cells.filter(FOC):cells):cells.filter(c=>inb(c,st.b));
function derive(){
  const lc=lcIdx(),yl=Math.floor((lc-11)/12);
  cells.forEach(c=>{
    const v=c.j, raw=c.r.filter(Number.isFinite), values=v.filter(Number.isFinite);
    c.mu=values.length ? finiteSum(values)/values.length : NaN;
    c.mr=raw.length ? finiteSum(raw)/raw.length : NaN;
    c.md=MN.map((_,m)=>med1(v.filter((value,i)=>i%12===m&&Number.isFinite(value))));
    const ya=[];
    for(let y=Math.max(0,yl-9);y<=yl;y++){
      const total=sumWhenComplete(v.slice(y*12,y*12+12));
      if(Number.isFinite(total))ya.push([y,total]);
    }
    const my=ya.reduce((a,p)=>a+p[1],0)/(ya.length||1),
          xm=ya.reduce((a,p)=>a+p[0],0)/(ya.length||1);
    let sx=0,sy=0;
    ya.forEach(([y,total])=>{sx+=(y-xm)*(total-my);sy+=(y-xm)**2;});
    c.tr=my&&sy?Math.max(-.03,Math.min(.03,sx/sy/my)):0;
    const l5=ya.slice(-5);
    c.b5=l5.length ? l5.reduce((a,p)=>a+p[1],0)/l5.length : c.md.reduce((a,b)=>a+b,0);
    c.yl=l5.at(-1)?.[0] ?? yl;
    const m=c.md[lc%12];c.an=m&&Number.isFinite(v[lc])?(v[lc]/m-1)*100:NaN;
    c.pkr=Math.max(...c.md)/((c.md.reduce((a,b)=>a+b,0)/12)||1);
  });
  const nw=Y0+Math.floor((lc+1)/12);
  $("l5").min=nw+1;if(+$("l5").value<nw+1)$("l5").value=nw+1;sRead();
}
const LY=[["hm","NOAA-20 detections (mean per month)",c=>c.mu,"Hotspots"],["hr","Sensor history detections (mean per month)",c=>c.mr,"Hotspots"],
["fc","Forecast, next 12 months (mean per month)",c=>c.f?c.f.slice(0,12).reduce((a,b)=>a+b,0)/12:NaN,"Forecast and activity"],["rk","Forecast seasonal percentile (0 to 100)",c=>c.rk?c.rk.pr*100:NaN,"Forecast and activity"],
["an","Latest full month vs usual (%)",c=>c.an,"Change"],["tr","Trend over the last 10 years (% per year)",c=>c.tr*100,"Change"],["se","Seasonality (peak month / average month)",c=>c.pkr,"Change"],
["sd","Scenario change at the chosen year (%)",c=>c.sd==null?NaN:c.sd,"Scenario"],["la","Distance from the equator (degrees)",c=>Math.abs(c.lat),"Location"]];
/* ---- tabs and drawer ---- */
const PANEL_TITLES = {x:"Area analysis", m:"Forecast & model", c:"Find a place", p:"Hotspot details", d:"Data Lab", f:"Scenario lab"};
let activePanel = "x";
const globePicker = $("globe-picker");
globePicker.querySelector("form").addEventListener("submit", event => {
  event.preventDefault();
  const style = globePicker.querySelector('input[name="launch-style"]:checked').value;
  document.querySelector(`input[name="basemap"][value="${style}"]`).checked = true;
  globePicker.close();
  initGlobe();
  drawMap();
  const view = new URLSearchParams(location.search).get("view");
  if (view === "forecast") {
    showForecast();
  } else if (view === "places") {
    tab("c");
    $("pq").focus();
  } else if (view === "calendar") {
    tab("x");
    $("ct").scrollIntoView({block:"start"});
    $("ct").focus({preventScroll:true});
  } else {
    (G ? G.renderer.domElement : $("dt")).focus({preventScroll:true});
  }
});
globePicker.addEventListener("cancel", event => {
  event.preventDefault();
  location.assign($("home").href);
});

function updatePanelRegion() {
  $("panel-region").textContent = ITEMS.length ? ITEMS.map(item => item.name).join(", ") :
    PRE[Number($("pre").value)]?.[0] || "Custom area";
}
function drawer(open, focus = false) {
  document.body.classList.toggle("dc", !open);
  $("dr").inert = !open;
  $("dt").setAttribute("aria-expanded", String(open));
  gResize();
  if (focus) (open ? document.querySelector("#tabs .on") : $("dt")).focus();
}
function tab(name, focus = false) {
  activePanel = name;
  document.querySelectorAll("#tabs button").forEach(button => {
    const current = button.dataset.t === name;
    button.classList.toggle("on", current);
    if (current) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tp").forEach(panel => { panel.hidden = panel.dataset.t !== name; });
  $("panel-title").textContent = PANEL_TITLES[name];
  updatePanelRegion();
  DLON = name === "d";
  PLON = name === "c";
  if (DLON) dlRun();
  if (PLON) placesUI();
  drawer(true, focus);
}
function showForecast() {
  const forecast = document.querySelector('input[name="vm"][value="f"]');
  forecast.checked = true;
  forecast.onchange();
  tab("m", true);
}
document.querySelectorAll("#tabs button").forEach(button => {
  button.onclick = () => {
    if (button.dataset.t === "m") showForecast();
    else tab(button.dataset.t);
  };
});
$("dt").onclick = () => {
  if (document.body.classList.contains("dc")) tab(activePanel, true);
  else drawer(false, true);
};
$("close-panel").onclick = () => drawer(false, true);
$("head-forecast").onclick = showForecast;
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("dx").open && !globePicker.open && !document.body.classList.contains("dc")) drawer(false, true);
});
/* ---- Data Lab ---- */
const pc=(a,b)=>{let n=0,sx=0,sy=0;for(let i=0;i<a.length;i++)if(Number.isFinite(a[i])&&Number.isFinite(b[i])){n++;sx+=a[i];sy+=b[i]}if(n<8)return NaN;const mx=sx/n,my=sy/n;let u=0,p=0,q=0;for(let i=0;i<a.length;i++)if(Number.isFinite(a[i])&&Number.isFinite(b[i])){const x=a[i]-mx,y=b[i]-my;u+=x*y;p+=x*x;q+=y*y}return p&&q?u/Math.sqrt(p*q):NaN};
function dlRender(){const g={};LY.forEach(l=>(g[l[3]]=g[l[3]]||[]).push(l));$("dll").innerHTML=Object.keys(g).map(k=>`<div class="lg2"><b>${k}</b>${g[k].map(l=>`<label class="ck"><input type="checkbox" data-l="${l[0]}"${SEL.has(l[0])?" checked":""}>${esc(l[1])}</label>`).join("")}</div>`).join("");optsSel();if(DLON)dlRun()}
function optsSel(){const ls=LY.filter(l=>SEL.has(l[0])),o=ls.map(l=>`<option value="${l[0]}">${esc(l[1])}</option>`).join("");["dx1","dy1","dtp"].forEach((id,j)=>{const e=$(id),v=e.value;e.innerHTML=o;e.value=ls.some(l=>l[0]==v)?v:(ls[j==1?Math.min(1,ls.length-1):0]||[""])[0]})}
function dlRun(){const cs=scopeCells(),ls=LY.filter(l=>SEL.has(l[0])),cols=ls.map(l=>cs.map(l[2]));
if(!ls.length){$("dls").innerHTML='<p class="note">Select at least one dataset.</p>';$("dlc").innerHTML="";$("dsc").innerHTML="";$("dtl").innerHTML="";return}
$("dls").innerHTML=`<p class="note">${cs.length} cells in ${$("dlw").checked?"the world":"your selected area"}, ${ls.length} dataset${ls.length>1?"s":""}.</p><div class="sc"><table><tr><th>Dataset</th><th>Cells</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr>`+ls.map((l,i)=>{const a=cols[i].filter(Number.isFinite).sort((x,y)=>x-y),n=a.length,mu=a.reduce((s,x)=>s+x,0)/(n||1);return `<tr><td>${esc(l[1])}</td><td>${n}</td><td>${f2(mu)}</td><td>${f2(n?(a[(n-1)>>1]+a[n>>1])/2:NaN)}</td><td>${f2(a[0])}</td><td>${f2(a[n-1])}</td></tr>`}).join("")+"</table></div>";
const L=ls.slice(0,14);$("dlc").innerHTML=L.length<2?"":`<h2 style="margin-top:14px">Correlation between datasets</h2><div class="sc"><table><tr><th></th>${L.map((_,i)=>"<th>#"+(i+1)+"</th>").join("")}</tr>`+L.map((l,i)=>`<tr><td>#${i+1} ${l[1].slice(0,30)}</td>`+L.map((m,j)=>{const r=i==j?1:pc(cols[i],cols[j]);return `<td style="background:${Number.isFinite(r)?ramp(DV,.5+r/2):"transparent"};color:#16202c">${Number.isFinite(r)?r.toFixed(2):"n/a"}</td>`}).join("")+"</tr>").join("")+`</table></div><p class="note">Pearson correlation across cells. It does not show cause.${ls.length>14?" Showing the first 14 datasets.":""}</p>`;
scat(cs);topc(cs)}
function scat(cs){const la=LY.find(l=>l[0]==$("dx1").value),lb=LY.find(l=>l[0]==$("dy1").value),el=$("dsc");if(!la||!lb){el.innerHTML="";return}
const P=[];cs.forEach(c=>{const x=la[2](c),y=lb[2](c);if(Number.isFinite(x)&&Number.isFinite(y))P.push([x,y])});if(P.length<3){el.innerHTML='<p class="note">Fewer than 3 cells have both datasets.</p>';return}
const n=P.length,mx=P.reduce((s,p)=>s+p[0],0)/n,my=P.reduce((s,p)=>s+p[1],0)/n;let u=0,v=0,w=0;P.forEach(p=>{u+=(p[0]-mx)*(p[1]-my);v+=(p[0]-mx)**2;w+=(p[1]-my)**2});
const xs=P.map(p=>p[0]),ys=P.map(p=>p[1]),x0=xs.reduce((a,b)=>Math.min(a,b)),x1=xs.reduce((a,b)=>Math.max(a,b)),y0=ys.reduce((a,b)=>Math.min(a,b)),y1=ys.reduce((a,b)=>Math.max(a,b)),W=440,H=230,l=44,b=26,
X=x=>l+(x-x0)/((x1-x0)||1)*(W-l-8),Y=y=>H-b-(y-y0)/((y1-y0)||1)*(H-b-8),sd=Math.ceil(n/1500),sl=v?u/v:0,ic=my-sl*mx,r=v&&w?u/Math.sqrt(v*w):NaN;
el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of ${esc(la[1])} against ${esc(lb[1])}"><line x1="${l}" x2="${W-8}" y1="${H-b}" y2="${H-b}" stroke="var(--ln)"/><line x1="${l}" x2="${l}" y1="8" y2="${H-b}" stroke="var(--ln)"/>`+P.filter((_,i)=>i%sd==0).map(p=>`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="2.4" fill="var(--ac)" opacity=".55"/>`).join("")+`<line x1="${X(x0)}" y1="${Y(ic+sl*x0)}" x2="${X(x1)}" y2="${Y(ic+sl*x1)}" stroke="var(--ink)" stroke-width="1.5"/><text x="${l}" y="${H-8}">${f2(x0)}</text><text x="${W-8}" y="${H-8}" text-anchor="end">${f2(x1)}</text><text x="${l-4}" y="${H-b}" text-anchor="end">${f2(y0)}</text><text x="${l-4}" y="14" text-anchor="end">${f2(y1)}</text></svg><p class="note">X: ${esc(la[1])}. Y: ${esc(lb[1])}. ${n} cells, r = ${Number.isFinite(r)?r.toFixed(2):"n/a"}.</p>`}
function topc(cs){const l=LY.find(z=>z[0]==$("dtp").value);if(!l){$("dtl").innerHTML="";return}
const T=cs.map(c=>[c,l[2](c)]).filter(p=>Number.isFinite(p[1])).sort((a,b)=>b[1]-a[1]).slice(0,8);
$("dtl").innerHTML=T.map(p=>`<li><span>${cn(p[0])}<br><small>${f2(p[1])}</small></span><button data-k="${cells.indexOf(p[0])}">Open</button></li>`).join("")}
const openCell=e=>{const b=e.target.closest("button[data-k]");if(!b)return;const k=+b.dataset.k;flyTo(cells[k].lat,cells[k].lon,1.7);selectCell(k)};
$("dtl").onclick=openCell;$("sol").onclick=openCell;
$("dll").onchange=e=>{const i=e.target;if(!i.dataset.l)return;i.checked?SEL.add(i.dataset.l):SEL.delete(i.dataset.l);optsSel();dlRun()};
$("dx1").onchange=$("dy1").onchange=()=>scat(scopeCells());$("dtp").onchange=()=>topc(scopeCells());$("dlw").onchange=dlRun;
$("dla").onclick=()=>{LY.forEach(l=>SEL.add(l[0]));dlRender()};$("dln").onclick=()=>{SEL.clear();dlRender()};
function parseCsv(text) {
  const rows=[[]];
  let field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}
      else if(quoted||!field)quoted=!quoted;
      else throw Error("unexpected quote in a CSV field");
    }else if(!quoted&&(ch===","||ch==="\r"||ch==="\n")){
      rows.at(-1).push(field.trim());field="";
      if(ch!==","){if(ch==="\r"&&text[i+1]==="\n")i++;rows.push([]);}
    }else field+=ch;
  }
  if(quoted)throw Error("unclosed CSV quote");
  rows.at(-1).push(field.trim());
  return rows.filter(row=>row.some(Boolean));
}
$("dlf").onchange=async e=>{const byId=new Map(cells.map(c=>[c.id,c])),msg=[];
const find=(lat,lon)=>lat>=-90&&lat<=90&&lon>=-180&&lon<=180
  ? byId.get(Math.min(59,Math.floor((lat+90)/3))*120+(lon===180?0:Math.floor((lon+180)/3))) : null;
for(const f of e.target.files){let rows;
try{rows=parseCsv((await f.text()).replace(/^\uFEFF/,""));}catch(error){msg.push(f.name+": "+error.message);continue;}
if(!rows.length){msg.push(f.name+": empty file");continue;}
const h=rows.shift().map(x=>x.toLowerCase()),li=h.findIndex(x=>/^(lat|latitude)$/.test(x)),oi=h.findIndex(x=>/^(lon|lng|long|longitude)$/.test(x));
if(li<0||oi<0){msg.push(f.name+": needs lat and lon columns");continue}
h.forEach((name,j)=>{if(j==li||j==oi)return;const m=new Map();rows.forEach(r=>{if(!r[j]||!r[li]||!r[oi])return;const x=Number(r[j]),la=Number(r[li]),lo=Number(r[oi]);if(!Number.isFinite(x)||!Number.isFinite(la)||!Number.isFinite(lo))return;const c=find(la,lo);if(!c)return;const a=m.get(c)||[0,0];a[0]+=x;a[1]++;m.set(c,a)});
if(!m.size){msg.push(f.name+", "+name+": no rows fell on a cell with data");return}const id="u"+(++UID);cells.forEach(c=>{(c.u=c.u||{})[id]=NaN});m.forEach((a,c)=>{c.u[id]=a[0]/a[1]});
LY.push([id,name+" ("+f.name+")",c=>c.u&&Number.isFinite(c.u[id])?c.u[id]:NaN,"Your datasets"]);SEL.add(id);msg.push(f.name+", "+name+": "+m.size+" cells")})}
$("dlm").textContent=msg.join(". ");e.target.value="";dlRender()};
/* ---- Local data analyst ---- */
$("aip").innerHTML=["Where does the forecast exceed the usual season?","What correlates most with hotspot activity here?","Summarize detections in this area","What if warming reaches 2 °C and burning is cut by 40% by 2040?"].map(t=>`<button>${t}</button>`).join("");
const chatAdd=(r,t)=>{const d=document.createElement("div");d.className="m "+r;d.textContent=t;$("aic").appendChild(d);$("aic").scrollTop=1e9;return d};
function promptLevers(q){const l=q.toLowerCase();if(!/(what if|scenario|simulat|suppose|if we|if the|assume|by 20[3-6]\d)/.test(l))return"";const got=[],set=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new Event("input"));return Number($(id).value);};let m;
if(m=l.match(/([+-]?\d+(?:\.\d+)?)\s*(?:°|degrees?\s*)?c\b/)){got.push("warming "+set("l1",+m[1])+" °C")}
if(m=l.match(/(?:rain\w*|precip\w*)[^.\d+-]{0,25}([+-]?\d+)\s*%/)){let v=+m[1];if(!/[+-]/.test(m[1])&&/(less|drop|declin|decreas|drier|fall)/.test(l))v=-v;v=Math.max(-30,Math.min(30,v));set("l2",v);got.push("rainfall "+v+"%")}
if(m=l.match(/(\d+)\s*%[^.]{0,30}(?:burn|ignition|fire start)|(?:burn\w*|ignition\w*)[^.\d]{0,30}(\d+)\s*%/)){let v=+(m[1]||m[2]);if(!/(more|increase|rise|expand)/.test(l))v=-v;v=Math.max(-80,Math.min(50,v));set("l3",v);got.push("burning "+(v>0?"+":"")+v+"%")}
if(m=l.match(/(?:fuel|suppress\w*|prescribed|management)[^.\d]{0,30}(\d+)\s*%/)){got.push("fuel management "+set("l4",+m[1])+"%")}
if(m=l.match(/\b(20[3-6]\d)\b/)){got.push("year "+set("l5",+m[1]))}
if(!got.length)return"";$("lsw").checked=!/(my area|this area|selected area)/.test(l)&&/(world|global|everywhere)/.test(l);$("lsw").dispatchEvent(new Event("input"));runScenario();return got.join(", ")}
function local(q){const l=q.toLowerCase(),cs=scopeCells(),sc=$("dlw").checked?"the whole world":"your selected area";if(!cs.length)return"There are no data cells in "+sc+". Draw or choose an area that contains hotspots.";
const top=(fn,k)=>cs.map(c=>[c,fn(c)]).filter(p=>Number.isFinite(p[1])).sort((a,b)=>b[1]-a[1]).slice(0,k||3);
if(/(risk|danger|warn|alert|threat|exceed|threshold)/.test(l)){if(!FC)return $("rks").textContent;const h=cs.filter(c=>c.rk&&c.rk.l>=2);return $("rks").textContent+"\nIn "+sc+", "+h.length+" of "+cs.length+" cells exceed the activity threshold. Highest forecast activity among them: "+(top(c=>c.rk&&c.rk.l>=2?c.rk.v:NaN).map(p=>cn(p[0])+" ("+fmt(p[1])+" hotspots, "+LV[p[0].rk.l]+")").join("; ")||"none")+". The activity comparison uses NOAA-20 counts for the same calendar month."}
if(/(correl|driver|relat|explain|why|depend)/.test(l)){const ls=LY.filter(z=>SEL.has(z[0])),pr=[];for(let i=0;i<ls.length;i++)for(let j=i+1;j<ls.length;j++){const r=pc(cs.map(ls[i][2]),cs.map(ls[j][2]));if(Number.isFinite(r)&&Math.abs(r)<.995)pr.push([r,ls[i][1],ls[j][1]])}pr.sort((a,b)=>Math.abs(b[0])-Math.abs(a[0]));return pr.length?"Strongest relationships across cells in "+sc+":\n"+pr.slice(0,5).map(p=>"\u2022 "+p[1]+" and "+p[2]+": r = "+p[0].toFixed(2)).join("\n")+"\nCorrelation does not show cause. Tick more datasets in the Data Lab to widen the search.":"Tick at least two datasets with enough overlapping cells to compare."}
if(/(forecast|predict|next|coming|outlook)/.test(l))return $("ok").textContent||"No forecast is loaded.";
if(/(season|peak|when|month)/.test(l)){const m=med.indexOf(Math.max(...med));return "In "+sc+" the usual peak month is "+MN[m]+" with about "+fmt(med[m])+" hotspots, and the quietest is "+MN[med.indexOf(Math.min(...med))]+"."}
if(/(trend|increas|decreas|grow|declin)/.test(l)){const t=cs.map(c=>c.tr*100).sort((a,b)=>a-b);return "Over the last 10 full years the median cell in "+sc+" changed by "+f2(t[t.length>>1])+"% a year, and "+Math.round(t.filter(x=>x>0).length/t.length*100)+"% of cells are trending up."}
if(SCP.run&&/(scenario|future|result)/.test(l))return $("sot").textContent;
const t=top(c=>c.mu);if(!t.length)return "NOAA-20 data are unavailable in this scope.";return "Summary for "+sc+": "+cs.length+" cells averaging "+fmt(cs.reduce((s,c)=>s+c.mu,0))+" hotspots a month in total. Busiest cells: "+t.map(p=>cn(p[0])+" ("+fmt(p[1])+")").join("; ")+". "+$("rks").textContent+" Ask about projected activity, correlations, the forecast, seasons, trends, or a scenario such as \u201cwhat if warming is 2 \u00b0C and burning is cut 40% by 2040\u201d."}
function ask(q){
  q=q.trim();
  if(!q)return;
  $("aiq").value="";
  chatAdd("u",q);
  const levers=hasScenarioInputs()?promptLevers(q):"";
  chatAdd("a",levers ? $("sot").textContent+" Input changes: "+levers+"." : local(q));
}
$("ais").onclick=()=>ask($("aiq").value);
$("aiq").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask($("aiq").value);}};
$("aip").onclick=e=>{const b=e.target.closest("button");if(b)ask(b.textContent)};
/* ---- scenario lab ---- */
const SCP={t:0,p:0,i:0,f:0,y:2040,w:0,kt:15,kp:8,run:0,ph:1,yr:0,B:0,P:0,Bs:0,Ps:0};
const LVL=[["l1","t","v1",v=>"+"+v+" \u00b0C"],["l2","p","v2",v=>(v>0?"+":v<0?"\u2212":"")+Math.abs(v)+"%"],["l3","i","v3",v=>(v>0?"+":v<0?"\u2212":"")+Math.abs(v)+"%"],["l4","f","v4",v=>v+"%"],["l5","y","v5",v=>v]];
function sRead(){LVL.forEach(([id,k,lb,fm])=>{SCP[k]=+$(id).value;$(lb).textContent=fm(SCP[k])});const factor=id=>Math.max(-90,Math.min(200,Number($(id).value)||0));SCP.kt=factor("a1");SCP.kp=factor("a2");SCP.w=$("lsw").checked?1:0}
[...LVL.map(l=>l[0]),"a1","a2","lsw"].forEach(id=>$(id).oninput=sRead);
function baseYear(c,yr){
  const tb=Math.max(0,c.b5*(1+c.tr*(yr-(Y0+c.yl-2)))),sh=c.md.reduce((a,b)=>a+b,0)||1;
  let total=0;
  for(let m=0;m<12;m++){
    const i=(yr-Y0)*12+m,k=i-FS,f=c.f?.[k];
    total+=Number.isFinite(c.j[i])?c.j[i]:Number.isFinite(f)?f:tb*c.md[m]/sh;
  }
  return total;
}
function baseNote(){return "Illustrative sensitivity calculation. The reference uses observed counts, evaluated forecasts where available and a seasonal trend elsewhere."}
function sc1(c,ph){const L=SCP,now=Y0+Math.floor((lcIdx()+1)/12),yr=Math.round(now+ph*(L.y-now)),p=L.y>now?(yr-now)/(L.y-now):1,B=baseYear(c,yr),selected=(L.w&&(!FOC||FOC(c)))||inb(c,st.b),
M=selected?Math.pow(1+L.kt/100,L.t*p)*Math.pow(1+L.kp/100,-L.p/10*p)*Math.max(0,1+L.i/100*p)*(1-L.f/100*p):1;return[B,B*M,selected?scopeWeight(c):0]}
function sApply(ph){SCP.ph=ph;const now=Y0+Math.floor((lcIdx()+1)/12);SCP.yr=Math.round(now+ph*(SCP.y-now));let B=0,P=0,Bs=0,Ps=0;
cells.forEach(c=>{const[b,p,weight]=sc1(c,ph);c.sB=b;c.sP=p;c.sS=weight>0;c.sd=b>0?(p/b-1)*100:0;B+=b;P+=b+(p-b)*weight;Bs+=b*weight;Ps+=p*weight;});
SCP.B=B;SCP.P=P;SCP.Bs=Bs;SCP.Ps=Ps;}
function sUI(){const pct=(a,b)=>b?(a/b-1)*100:0;
$("sot").textContent=`In ${SCP.yr}, ${SCP.w?(FOC?"in your selected places":"worldwide"):"in your selected area"}, the scenario gives about ${fmt(SCP.Ps)} hotspots a year against ${fmt(SCP.Bs)} on the current path (${sgn(pct(SCP.Ps,SCP.Bs))}). Across the whole globe the change is ${sgn(pct(SCP.P,SCP.B))}. Levers: warming +${SCP.t} \u00b0C, rainfall ${sgn(SCP.p)}, human burning ${sgn(SCP.i)}, fuel management ${SCP.f}%, horizon ${SCP.y}. ${baseNote()}`;$("syl").textContent=SCP.yr;
const pts=[...Array(9)].map((_,i)=>{let b=0,p=0;cells.forEach(c=>{const r=sc1(c,i/8);b+=r[0]*r[2];p+=r[1]*r[2];});return[b,p]}),mx=pts.reduce((a,p)=>Math.max(a,p[0],p[1]),1)*1.08,W=440,H=150,l=44,X=i=>l+i*(W-l-8)/8,Y=v=>H-22-v/mx*(H-30),now=Y0+Math.floor((lcIdx()+1)/12);
$("soc").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hotspots a year, current path against scenario">`+[0,1,2,3].map(k=>`<line x1="${l}" x2="${W-8}" y1="${Y(mx*k/3.24)}" y2="${Y(mx*k/3.24)}" stroke="var(--ln)"/><text x="${l-5}" y="${Y(mx*k/3.24)+3}" text-anchor="end">${fmt(mx*k/3.24)}</text>`).join("")+
`<polyline points="${pts.map((p,i)=>X(i)+","+Y(p[0])).join(" ")}" fill="none" stroke="var(--mut)" stroke-width="1.6" stroke-dasharray="5 3"/><polyline points="${pts.map((p,i)=>X(i)+","+Y(p[1])).join(" ")}" fill="none" stroke="var(--ac)" stroke-width="2.2"/><line x1="${X(SCP.ph*8)}" x2="${X(SCP.ph*8)}" y1="6" y2="${H-22}" stroke="var(--ink)" stroke-dasharray="2 3"/><text x="${l}" y="${H-6}">${now}</text><text x="${W-8}" y="${H-6}" text-anchor="end">${SCP.y}</text><text x="${W/2}" y="${H-6}" text-anchor="middle">dashed: current path, solid: scenario</text></svg>`;
const T=cells.filter(c=>c.sS).map(c=>[c,c.sP-c.sB]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,5);
$("sol").innerHTML=T.map(p=>`<li><span>${cn(p[0])}<br><small>${sgn(p[0].sd)}, ${fmt(p[0].sB)} to ${fmt(p[0].sP)} a year</small></span><button data-k="${cells.indexOf(p[0])}">Open</button></li>`).join("")}
function hasScenarioInputs(){return !!observationRecord?.coverage?.["NOAA-20"]?.some(m=>m.complete_daily_archive);}
function runScenario(){
  if(!hasScenarioInputs()){$("scenario-status").textContent="NOAA-20 history is required to run this scenario.";return;}
  $("scenario-status").textContent="";
  stopScenario();
  sRead();$("a1").value=SCP.kt;$("a2").value=SCP.kp;SCP.run=1;sApply(1);$("vmx").checked=true;st.vm="x";$("so").hidden=false;$("sy").value=100;sUI();update();dlRender();
if(!SCP.w){const[s,n,w,e]=st.b;flyTo((s+n)/2,centerLon(w,e),Math.min(4.2,Math.max(1.55,1.35+Math.max(n-s,lonWidth(w,e)*.6)/45)))}}
const scrub=()=>{if(!SCP.run)return;sApply(+$("sy").value/100);sUI();drawMap()};
$("sr").onclick=()=>{tab("f");runScenario()};$("sy").oninput=scrub;
let PLT=null;function stopScenario(){if(PLT){clearInterval(PLT);PLT=null;$("sp").textContent="Play";}}$("sp").onclick=()=>{if(PLT){stopScenario();return;}let v=+$("sy").value>=100?0:+$("sy").value;$("sp").textContent="Pause";PLT=setInterval(()=>{v+=1.2;if(v>=100){v=100;clearInterval(PLT);PLT=null;$("sp").textContent="Play"}$("sy").value=v;scrub()},60)};
$("sx").onclick=()=>{stopScenario();$("scenario-status").textContent="";["l1","l2","l3","l4"].forEach(id=>$(id).value=0);$("l5").value=2040;$("a1").value=15;$("a2").value=8;$("lsw").checked=false;sRead();SCP.run=0;$("so").hidden=true;
if(st.vm=="x"){st.vm="o";document.querySelector('input[name=vm][value=o]').checked=true}cells.forEach(c=>{c.sB=c.sP=c.sd=null});update();dlRender()};
sRead();dlRender();
$("vmx").addEventListener("change",()=>{if(!SCP.run){tab("f");runScenario()}});

/* ---- countries and cities ---- */
const CN={"AD":"Andorra","AE":"United Arab Emirates","AF":"Afghanistan","AG":"Antigua & Barbuda","AI":"Anguilla","AL":"Albania","AM":"Armenia","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AS":"American Samoa","AT":"Austria","AU":"Australia","AW":"Aruba","AX":"Åland Islands","AZ":"Azerbaijan","BA":"Bosnia & Herzegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BH":"Bahrain","BI":"Burundi","BJ":"Benin","BL":"St. Barthélemy","BM":"Bermuda","BN":"Brunei","BO":"Bolivia","BQ":"Caribbean Netherlands","BR":"Brazil","BS":"Bahamas","BT":"Bhutan","BV":"Bouvet Island","BW":"Botswana","BY":"Belarus","BZ":"Belize","CA":"Canada","CC":"Cocos (Keeling) Islands","CD":"Congo - Kinshasa","CF":"Central African Republic","CG":"Congo - Brazzaville","CH":"Switzerland","CI":"Côte d’Ivoire","CK":"Cook Islands","CL":"Chile","CM":"Cameroon","CN":"China","CO":"Colombia","CQ":"Sark","CR":"Costa Rica","CU":"Cuba","CV":"Cape Verde","CW":"Curaçao","CX":"Christmas Island","CY":"Cyprus","CZ":"Czechia","DE":"Germany","DJ":"Djibouti","DK":"Denmark","DM":"Dominica","DO":"Dominican Republic","DZ":"Algeria","EC":"Ecuador","EE":"Estonia","EG":"Egypt","EH":"Western Sahara","ER":"Eritrea","ES":"Spain","ET":"Ethiopia","FI":"Finland","FJ":"Fiji","FK":"Falkland Islands","FM":"Micronesia","FO":"Faroe Islands","FR":"France","GA":"Gabon","GB":"United Kingdom","GD":"Grenada","GE":"Georgia","GF":"French Guiana","GG":"Guernsey","GH":"Ghana","GI":"Gibraltar","GL":"Greenland","GM":"Gambia","GN":"Guinea","GP":"Guadeloupe","GQ":"Equatorial Guinea","GR":"Greece","GS":"South Georgia & South Sandwich Islands","GT":"Guatemala","GU":"Guam","GW":"Guinea-Bissau","GY":"Guyana","HK":"Hong Kong SAR China","HM":"Heard & McDonald Islands","HN":"Honduras","HR":"Croatia","HT":"Haiti","HU":"Hungary","ID":"Indonesia","IE":"Ireland","IL":"Israel","IM":"Isle of Man","IN":"India","IO":"British Indian Ocean Territory","IQ":"Iraq","IR":"Iran","IS":"Iceland","IT":"Italy","JE":"Jersey","JM":"Jamaica","JO":"Jordan","JP":"Japan","KE":"Kenya","KG":"Kyrgyzstan","KH":"Cambodia","KI":"Kiribati","KM":"Comoros","KN":"St. Kitts & Nevis","KP":"North Korea","KR":"South Korea","KW":"Kuwait","KY":"Cayman Islands","KZ":"Kazakhstan","LA":"Laos","LB":"Lebanon","LC":"St. Lucia","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya","MA":"Morocco","MC":"Monaco","MD":"Moldova","ME":"Montenegro","MF":"St. Martin","MG":"Madagascar","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MM":"Myanmar (Burma)","MN":"Mongolia","MO":"Macao SAR China","MP":"Northern Mariana Islands","MQ":"Martinique","MR":"Mauritania","MS":"Montserrat","MT":"Malta","MU":"Mauritius","MV":"Maldives","MW":"Malawi","MX":"Mexico","MY":"Malaysia","MZ":"Mozambique","NA":"Namibia","NC":"New Caledonia","NE":"Niger","NF":"Norfolk Island","NG":"Nigeria","NI":"Nicaragua","NL":"Netherlands","NO":"Norway","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"New Zealand","OM":"Oman","PA":"Panama","PE":"Peru","PF":"French Polynesia","PG":"Papua New Guinea","PH":"Philippines","PK":"Pakistan","PL":"Poland","PM":"St. Pierre & Miquelon","PN":"Pitcairn Islands","PR":"Puerto Rico","PS":"Palestinian Territories","PT":"Portugal","PW":"Palau","PY":"Paraguay","QA":"Qatar","RE":"Réunion","RO":"Romania","RS":"Serbia","RU":"Russia","RW":"Rwanda","SA":"Saudi Arabia","SB":"Solomon Islands","SC":"Seychelles","SD":"Sudan","SE":"Sweden","SG":"Singapore","SH":"St. Helena","SI":"Slovenia","SJ":"Svalbard & Jan Mayen","SK":"Slovakia","SL":"Sierra Leone","SM":"San Marino","SN":"Senegal","SO":"Somalia","SR":"Suriname","SS":"South Sudan","ST":"São Tomé & Príncipe","SV":"El Salvador","SX":"Sint Maarten","SY":"Syria","SZ":"Eswatini","TC":"Turks & Caicos Islands","TD":"Chad","TF":"French Southern Territories","TG":"Togo","TH":"Thailand","TJ":"Tajikistan","TK":"Tokelau","TL":"Timor-Leste","TM":"Turkmenistan","TN":"Tunisia","TO":"Tonga","TR":"Türkiye","TT":"Trinidad & Tobago","TV":"Tuvalu","TW":"Taiwan","TZ":"Tanzania","UA":"Ukraine","UG":"Uganda","UM":"U.S. Outlying Islands","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VA":"Vatican City","VC":"St. Vincent & Grenadines","VE":"Venezuela","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","VN":"Vietnam","VU":"Vanuatu","WF":"Wallis & Futuna","WS":"Samoa","XK":"Kosovo","YE":"Yemen","YT":"Mayotte","ZA":"South Africa","ZM":"Zambia","ZW":"Zimbabwe"},AL={US:"usa america united states of america",GB:"uk britain england scotland wales great britain",RU:"russian federation",CZ:"czech republic",TR:"turkey turkiye",CI:"ivory coast",MM:"burma",SZ:"swaziland",KR:"south korea korea",KP:"north korea korea",CD:"drc democratic republic of the congo",CG:"republic of the congo",HK:"hong kong",PS:"palestine gaza west bank",MK:"macedonia",CV:"cape verde",TL:"east timor",VA:"vatican",LA:"laos",VN:"viet nam",SY:"syria",IR:"persia",BO:"bolivia",VE:"venezuela",TZ:"tanzania",MD:"moldova",BN:"brunei",AE:"uae emirates",NL:"holland"};
const CNL=Object.keys(CN).map(k=>[k,CN[k],(CN[k]+" "+k+" "+(AL[k]||"")).toLowerCase()]);
let ITEMS=[],PLACES=null,PLN=null,PLON=false,RADV=250,SR=[],PQT=null;
function esc(t) {return String(t).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));}
const hav=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
const cellW=(c,it)=>it.t=="c"?(c.cc&&c.cc[it.code]||0):((Math.abs(c.lat-it.lat)<=1.5&&Math.abs(((c.lon-it.lon+540)%360)-180)<=1.5)||(RADV>0&&hav(c.lat,c.lon,it.lat,it.lon)<=RADV)?1:0);
function scopeWeight(cell) {
  if (!ITEMS.length || ITEMS.some(it=>it.t==="p"&&cellW(cell,it)>0)) return 1;
  return ITEMS.reduce((sum,it)=>it.t==="c"?sum+cellW(cell,it):sum,0);
}
function setFocus(){FOC=ITEMS.length?(c=>ITEMS.some(it=>it.t=="c"?cellW(c,it)>0:cellW(c,it)>0)):null}
function itemCenter(it){
  if(it.t==="p")return [it.lat,it.lon];
  const selected=cells.filter(c=>cellW(c,it)>0);
  if(!selected.length)return null;
  const [s,n,w,e]=boundsForCells(selected);
  return [(s+n)/2,centerLon(w,e)];
}
function placesLocal(q){const a=[],b=[];for(let i=0;i<PLN.length&&a.length<8;i++){const n=PLN[i];if(n.startsWith(q))a.push(i);else if(b.length<8&&n.includes(q))b.push(i)}
return a.concat(b).slice(0,8).map(i=>{const p=PLACES[i];return{t:"p",id:"p"+i,name:p[0]+(p[1]?", "+p[1]:"")+", "+(CN[p[2]]||p[2]),lat:p[3],lon:p[4]}})}
async function placesApi(q){const r=await fetch("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(q)+"&count=8&language=en&format=json");if(!r.ok)throw 0;const j=await r.json();
return(j.results||[]).map(p=>({t:"p",id:"p"+p.id,name:p.name+(p.admin1?", "+p.admin1:"")+", "+(p.country||p.country_code),lat:p.latitude,lon:p.longitude}))}
async function placeMatches(query) {
  const countries = CNL.filter(country => country[2].includes(query))
    .sort((a, b) => Number(b[1].toLowerCase().startsWith(query)) - Number(a[1].toLowerCase().startsWith(query)) || a[1].localeCompare(b[1]))
    .slice(0, 8).map(([code, name]) => ({t:"c", id:"c"+code, code, name}));
  if (query.length < 2) return countries;
  let places = [];
  try { places = PLACES ? placesLocal(query) : await placesApi(query); }
  catch {
    $("pfm").textContent = "City search needs the city list file below or access to Open-Meteo.";
  }
  return countries.concat(places);
}
async function doSearch() {
  const input = $("pq"), query = input.value.trim().toLowerCase(), list = $("pr");
  if (!query) { list.innerHTML = ""; SR = []; return; }
  const matches = await placeMatches(query);
  if (input.value.trim().toLowerCase() !== query) return;
  SR = matches;
  list.innerHTML = matches.map((place, index) =>
    `<li data-j="${index}"><b>${esc(place.name)}</b><small>${place.t === "c" ? "Country" : "City"}</small></li>`
  ).join("") || "<li>No match</li>";
}
function setPlaces(a){if(!Array.isArray(a)||!Array.isArray(a[0])||a[0].length<5)throw 0;PLACES=a;PLN=a.map(p=>String(p[0]).toLowerCase());$("pfm").textContent=a.length.toLocaleString()+" places loaded, so city search works offline."}
function addItem(it){if(ITEMS.some(x=>x.id==it.id))return;ITEMS.push(it);applyFocus(true)}
function clearFocus(){ITEMS=[];applyFocus(false)}
function applyFocus(fly){setFocus();riskCalc();$("fcl").hidden=!ITEMS.length;$("fcl").innerHTML="Showing only: <b>"+ITEMS.map(i=>esc(i.name)).join(", ")+'</b><button id="fcc">Clear</button>';
const cs=FOC?cells.filter(FOC):[];
if(cs.length&&fly){const b=boundsForCells(cs);$("pre").value="0";noFly=true;setB(b);noFly=false;
const width=lonWidth(b[2],b[3]);if(width>120){const ct=itemCenter(ITEMS[0]);if(ct)flyTo(ct[0],ct[1],3.4)}else flyTo((b[0]+b[1])/2,centerLon(b[2],b[3]),Math.min(4.2,Math.max(1.55,1.35+Math.max(b[1]-b[0],width*.6)/45)))}else update();
placesUI()}
function itemStats(it,lc,wd){const S=new Float64Array(NY*12),J=new Float64Array(NY*12),F=Array(FH).fill(0),B=Array(FH).fill(0);let n=0,hi=0,Bs=0,Ps=0,hf=0;
cells.forEach(c=>{const w=cellW(c,it);if(w<=0)return;n++;for(let i=0;i<=lc;i++)S[i]+=w*observed(c)[i];
if(c.f){hf=1;c.f.forEach((v,k)=>{F[k]+=w*v;B[k]+=w*(c.projection.baseline[k]??NaN)});for(let i=0;i<=lc;i++)J[i]+=w*c.j[i];}
if(c.rk&&c.rk.l>=2)hi++;if(SCP.run&&c.sB!=null){Bs+=w*c.sB;Ps+=w*c.sP}});
const available=Array.from(S.slice(st.f,Math.min(st.t,lc)+1)).filter(Number.isFinite);const tot=n&&available.length?finiteSum(available):NaN;
const md=MN.map((_,m)=>med1(Array.from({length:NY},(_,y)=>y*12+m<=lc?S[y*12+m]:NaN))),pk=md.indexOf(Math.max(...md));
return{it,n,hi,tot,sh:wd?tot/wd*100:0,an:md[lc%12]&&Number.isFinite(S[lc])?(S[lc]/md[lc%12]-1)*100:null,pk,mpk:md[pk],f3:hf?finiteOrNull(sumWhenComplete(F.slice(0,3))):null,sd:SCP.run&&Bs?(Ps/Bs-1)*100:null,J,B,F:hf?F:null,md}}
function placesUI(){$("pch").innerHTML=ITEMS.map((it,i)=>`<button class="chip" data-i="${i}" aria-label="Remove ${esc(it.name)}">${esc(it.name)} \u00d7</button>`).join("");
const nocc=ITEMS.some(i=>i.t=="c")&&!cells.some(c=>c.cc),none=FOC&&!cells.some(FOC);
$("pnt").textContent=nocc?"This dataset has no country information yet, so countries cannot be matched to cells. Run add_places.py on pyroscale_data.json, then load the file again. Cities work without it.":none?"No recorded grid cells overlap your selection.":"";
if(!PLON)return;const lc=lcIdx();let wd=0;cells.forEach(c=>{for(let i=st.f;i<=Math.min(st.t,lc);i++)wd+=Number.isFinite(observed(c)[i])?observed(c)[i]:0});
const R=ITEMS.slice(0,8).map(it=>itemStats(it,lc,wd));
const cmp=R.length>1?`<div class="pn"><h2>Comparison</h2><div class="sc"><table><tr><th>Place</th><th>Cells</th><th>Hotspots</th><th>Last month</th><th>Next 3 months</th><th>Cells with high projected activity</th></tr>`+R.map(r=>`<tr><td>${esc(r.it.name)}</td><td>${r.n}</td><td>${fmt(r.tot)}</td><td>${r.an==null?"n/a":sgn(r.an)}</td><td>${r.f3==null?"n/a":fmt(r.f3)}</td><td>${r.hi}</td></tr>`).join("")+"</table></div></div>":"";
$("pcards").innerHTML=cmp+R.map(r=>`<div class="pn"><h2>${esc(r.it.name)}</h2><p class="note" style="margin-top:0">${r.n} grid cell${r.n==1?"":"s"}${r.it.t=="c"?"; estimated by weighting detections by cell area within the country":", "+(RADV>0?"within "+RADV+" km of the city":"the cell containing the city")}.</p>
<table><tr><td>Hotspots in the chosen period</td><td><b>${fmt(r.tot)}</b> (${r.sh.toFixed(1)}% of the available record)</td></tr><tr><td>Last full month</td><td>${r.an==null?"n/a":sgn(r.an)+" vs usual"}</td></tr><tr><td>Usual peak month</td><td><b>${MN[r.pk]}</b> (${fmt(r.mpk)})</td></tr><tr><td>Forecast, next 3 months</td><td>${r.f3==null?"none":fmt(r.f3)}</td></tr><tr><td>Cells with high projected activity</td><td>${r.hi} of ${r.n}</td></tr>${r.sd==null?"":`<tr><td>Scenario, ${SCP.yr}</td><td><b>${sgn(r.sd)}</b></td></tr>`}</table>
${r.F?'<h2 style="margin:14px 0 6px">NOAA-20 history and forecast</h2>'+fch(r.J,lc,r.F,r.md,440,150,60,true,null,r.B):""}
<div class="row" style="justify-content:flex-start;margin-top:8px"><button data-f="${ITEMS.indexOf(r.it)}">Show on globe</button></div></div>`).join("")+(ITEMS.length>8?'<p class="note">Showing the first 8 selections.</p>':"")}
$("pq").oninput=()=>{clearTimeout(PQT);$("pr").replaceChildren();SR=[];PQT=setTimeout(doSearch,PLACES?60:300)};
$("pq").onkeydown=event=>{
  if(event.key==="Enter" && SR.length && $("pr").querySelector("li[data-j]")){
    event.preventDefault();
    $("pr").querySelector("li[data-j]").click();
  }
};
$("pr").onclick=e=>{const li=e.target.closest("li[data-j]");if(!li)return;const it=SR[+li.dataset.j];$("pq").value="";$("pr").innerHTML="";addItem(it)};
$("pch").onclick=e=>{const b=e.target.closest("button[data-i]");if(!b)return;ITEMS.splice(+b.dataset.i,1);applyFocus(ITEMS.length>0)};
$("pcl").onclick=clearFocus;$("fcl").onclick=e=>{if(e.target.id=="fcc")clearFocus()};
$("prr").onchange=()=>{RADV=+$("prr").value;if(ITEMS.length)applyFocus(true)};
$("pcards").onclick=e=>{const b=e.target.closest("button[data-f]");if(!b)return;const c=itemCenter(ITEMS[+b.dataset.f]);if(c)flyTo(c[0],c[1],2.2)};
$("pfl").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const t=await f.text();setPlaces(JSON.parse(t));idb("put",t,"p")}catch(_){$("pfm").textContent="Choose a city directory in PyroScale JSON format."}e.target.value=""};
(async()=>{try{const r=await fetch("pyroscale_places.json");if(r.ok)setPlaces(await r.json())}catch(_){}if(!PLACES){try{const c=await idb("get",0,"p");if(c)setPlaces(JSON.parse(c))}catch(_){}}})();

wireMap();
wireExport();
attachFC(null);
const loadJson=async path=>{
  const response=await fetch(path,{cache:"no-cache",signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error(path+" returned "+response.status);
  return response.json();
};
async function loadBundled() {
  const ticket=++dataLoadSequence;
  const forecast=loadJson("pyroscale_forecast.json").catch(()=>null);
  try {
    const history=await loadJson("pyroscale_data.json");
    if(ticket!==dataLoadSequence)return;
    useData(history,"NASA FIRMS archive");
    const candidate=await forecast;
    if(ticket!==dataLoadSequence)return;
    FCfile=candidate;
    attachFC(matchingForecast());
    update();
  } catch (error) {
    if(ticket!==dataLoadSequence)return;
    $("tg").textContent="Observation record unavailable";
    $("demo-status").textContent="Observations unavailable. Use Analysis → Period and view to load a record.";
    console.warn("PyroScale could not load its observation record",error.message);
  }
}
loadBundled();
noFly = true;
setB(st.b);
noFly = false;
globePicker.showModal();
