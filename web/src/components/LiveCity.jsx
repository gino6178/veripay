// The live demo on the home page: a real map of Austin (Leaflet, Esri's light gray canvas) with the simulated customers and pros using VeriPay right now
// (GET /api/live), what just happened pinned to the person it happened to, and a way in: click anyone to see VeriPay as them.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, navigate } from "../api.jsx";

const STATUS = { scoped: "writing the job", offered: "getting offers", agreed: "hired", held: "money held", working: "pro working", submitted: "proof sent", review: "being checked", needs_fix: "fixing", released: "paid" };
const STAGE = { scoped: "ask", offered: "ask", agreed: "held", held: "held", working: "work", submitted: "work", review: "work", needs_fix: "work", released: "paid" };
const ago = (at) => { const s = Math.max(0, (Date.now() - Date.parse(at)) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const usd = (c) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// ZIP centroids of central Austin; people sit around their ZIP, the pins drawn over the real map in screen pixels
const ZIP = {
  78701: [30.270, -97.742], 78702: [30.263, -97.716], 78703: [30.293, -97.768], 78704: [30.243, -97.765], 78705: [30.294, -97.739],
  78722: [30.289, -97.715], 78723: [30.305, -97.686], 78741: [30.231, -97.721], 78744: [30.182, -97.738], 78745: [30.207, -97.796],
  78748: [30.168, -97.823], 78749: [30.218, -97.845], 78751: [30.312, -97.723], 78756: [30.322, -97.740], 78757: [30.351, -97.733], 78758: [30.370, -97.705],
};
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
const TILES = ESRI + "World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", LABELS = ESRI + "World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const CREDIT = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
// several people in one ZIP sit around its centroid, not on top of each other (offsets in pixels, so they stay apart at any zoom)
function place(list, kind, map) {
  const seen = {};
  return list.map((p) => {
    const c = ZIP[p.zip] || ZIP[78701], i = (seen[p.zip] = (seen[p.zip] ?? -1) + 1);
    const pt = map.latLngToContainerPoint(c), a = (kind === "pro" ? 0.6 : 3.7) + i * 1.9, r = i || kind === "pro" ? 26 + i * 4 : 0;
    return { ...p, kind, x: pt.x + Math.cos(a) * r, y: pt.y + Math.sin(a) * r };
  });
}

export default function LiveCity({ reload, toast }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(null), [spot, setSpot] = useState(0), [hover, setHover] = useState(null);
  const last = useRef(0), box = useRef(null), mapRef = useRef(null), [, redraw] = useState(0);
  useEffect(() => {
    let on = true;
    const pull = async () => {
      try {
        const r = await api(`/api/live?after=${last.current}`);
        if (!on) return;
        setD((old) => ({ ...r, events: [...r.events.slice().reverse(), ...(old?.events || [])].slice(0, 40) }));
        if (r.events.length) { if (last.current) setSpot(0); last.current = r.events.at(-1).id; }
      } catch {}
    };
    pull(); const t = setInterval(pull, 3000);
    // the map walks through the latest few events so there's always something happening on it
    const s = setInterval(() => setSpot((i) => (i + 1) % 6), 4200);
    return () => { on = false; clearInterval(t); clearInterval(s); };
  }, []);
  const become = async (p) => {
    setBusy(p.id);
    try {
      await api("/api/auth/demo", { method: "POST", body: p.kind === "pro" ? { as: "pro", pro: p.id, pin: "8642" } : { as: "customer", person: p.id, pin: "2468" } });
      await reload(); navigate(p.kind === "pro" ? "/pro" : "/");
    } catch (e) { toast(e.message, true); }
    setBusy(null);
  };
  // the real map, once; the pins re-place themselves whenever it moves or zooms
  useEffect(() => {
    if (!d || mapRef.current || !box.current) return;
    const m = L.map(box.current, { center: [30.268, -97.748], zoom: 12, zoomSnap: 0.25, scrollWheelZoom: false, attributionControl: true, zoomControl: true });
    L.tileLayer(TILES, { attribution: CREDIT, maxZoom: 16 }).addTo(m);
    L.tileLayer(LABELS, { maxZoom: 16 }).addTo(m);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    const fit = () => m.fitBounds([[30.19, -97.85], [30.375, -97.68]], { padding: [10, 10] });
    fit(); m.on("move zoom resize", () => redraw((n) => n + 1));
    mapRef.current = m; redraw((n) => n + 1);
    return () => { m.remove(); mapRef.current = null; };
  }, [!!d]);
  if (!d) return <div className="skel" style={{ height: 520 }} />;
  const s = d.stats, map = mapRef.current;
  const cs = map ? place(d.customers, "customer", map) : [], ps = map ? place(d.pros, "pro", map) : [];
  const size = map ? map.getSize() : { x: 1, y: 1 };
  const ev = d.events.filter((e) => e.job)[Math.min(spot, Math.max(0, d.events.filter((e) => e.job).length - 1))];
  const at = ev && (cs.find((c) => c.id === ev.job.customer) || cs.find((c) => c.name === ev.who.name));
  // a hired pro and their customer are joined on the map while the job is open
  const links = cs.filter((c) => c.open).map((c) => [c, ps.find((p) => p.busy?.number === c.open.number)]).filter(([, p]) => p);
  const tip = hover || null;
  return (
    <section className="city" aria-label="Live in Austin">
      <div className="city-head">
        <h2><span className="live-dot" aria-hidden="true" />Austin, right now</h2>
        <p>{s.jobs} jobs · {s.paid} paid on proof · <b>{usd(s.paidToPros)}</b> paid to pros</p>
      </div>
      <div className="city-body">
        <div className="map">
          <div ref={box} className="map-tiles" role="img" aria-label="Map of central Austin with customers and pros" />
          <svg className="map-over" viewBox={`0 0 ${size.x} ${size.y}`} width={size.x} height={size.y}>
            {links.map(([c, p]) => <path key={c.id} d={`M${p.x} ${p.y}Q${(p.x + c.x) / 2} ${Math.min(p.y, c.y) - 40} ${c.x} ${c.y}`} className="hire" />)}
            {ps.map((p) => (
              <g key={p.id} className={`pin pro ${p.busy ? "on" : ""}`} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`See VeriPay as ${p.name}, ${p.trade}`}
                onClick={() => become(p)} onKeyDown={(e) => e.key === "Enter" && become(p)} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
                <rect x="-11" y="-11" width="22" height="22" rx="6" /><text y="4">{p.initials}</text>
              </g>))}
            {cs.map((c) => { const st = c.open ? STAGE[c.open.status] || "ask" : "idle"; return (
              <g key={c.id} className={`pin cust s-${st} ${at?.id === c.id ? "spot" : ""} ${busy === c.id ? "busy" : ""}`} transform={`translate(${c.x} ${c.y})`} tabIndex={0} role="button" aria-label={`See VeriPay as ${c.name}`}
                onClick={() => become(c)} onKeyDown={(e) => e.key === "Enter" && become(c)} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(c)} onBlur={() => setHover(null)}>
                {at?.id === c.id && <circle r="15" className="ring" />}
                <circle r="15" /><text y="4.5">{c.initials}</text>
              </g>); })}
          </svg>
          {at && !tip && (
            <div key={ev.id} className="bubble" style={{ left: `${(at.x / size.x) * 100}%`, top: `${(at.y / size.y) * 100}%` }}>
              <b>{say(ev)[0]}{ev.who.agent && <span className="tag">agent</span>}</b><span>{say(ev)[1].trim().replace(/^./, (c) => c.toUpperCase())}</span>
            </div>)}
          {tip && (
            <div className="bubble hov" style={{ left: `${(tip.x / size.x) * 100}%`, top: `${(tip.y / size.y) * 100}%` }}>
              <b>{tip.name}</b>
              <span>{tip.kind === "pro" ? (tip.busy ? `${tip.busy.number} · ${STATUS[tip.busy.status] || tip.busy.status}` : `${tip.trade} · ★ ${tip.rating} · ${tip.paid} paid`) : tip.open ? `${tip.open.number} · ${STATUS[tip.open.status] || tip.open.status}` : `${tip.jobs} jobs done`}</span>
              <em>Click to see VeriPay as {tip.name.split(" ")[0]}</em>
            </div>)}
          <ul className="legend" aria-label="Legend">
            <li><i className="lg ask" />getting offers</li><li><i className="lg held" />money held</li><li><i className="lg work" />pro working</li><li><i className="lg pro" />pro</li>
          </ul>
        </div>
        <ol className="lp-feed" aria-live="polite">
          {d.events.slice(0, 5).map((e) => (
            <li key={e.id} className={`k-${e.kind}`}>
              <i aria-hidden="true" />
              <div><p><b>{say(e)[0]}</b>{say(e)[1]}</p><time>{ago(e.at)}</time></div>
            </li>))}
        </ol>
      </div>
      <p className="city-foot">Everyone here is simulated. Click a pin to use VeriPay as them.</p>
    </section>
  );
}
// who did it and what, without saying the name twice ("Eastside Pipe & Drain started work"); an offer is the pro's
function say(e) {
  const n = e.who.name, t = e.text, o = t.match(/^(.+?) offered (\$[\d.,]+)\.?$/);
  if (t.startsWith(n)) return [n, t.slice(n.length)];
  if (o) return [o[1], ` offered ${n.split(" ")[0]} ${o[2]}`];
  return [n, " " + t];
}
