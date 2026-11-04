// Cover's own models: what each does, what it is built on, what it learned from, its held-out scores with their
// intervals (ml/results.json, from ml/RESULTS.md), and which ones this server is using right now (GET /api/models).
import { useApi, useT } from "../api.jsx";

const iv = (c, d = 1) => (c ? `[${c[0].toFixed(d)}, ${c[1].toFixed(d)}]` : "");
const pc = (x) => (x == null ? "—" : `${x.toFixed(1)}%`);
const sign = (x) => (x > 0 ? `+${x.toFixed(3)}` : x.toFixed(3));

function Live({ s }) {
  const t = useT();
  if (!s) return <span className="badge">—</span>;
  return s.live ? <span className="badge good">{t("使用中", "LIVE")}</span> : <span className="badge">{t("未使用", "NOT LIVE")}</span>;
}

function Hero({ v, ci, unit = "%", d = 1 }) {
  return <span style={{ whiteSpace: "nowrap" }}><span className="big" style={{ fontSize: 28 }}>{v == null ? "—" : v.toFixed(d)}{unit}</span> <span className="mono muted">{iv(ci, d)}</span></span>;
}

function Facts({ m }) {
  const t = useT();
  return (
    <dl className="kv">
      <dt>{t("做什麼", "DOES")}</dt><dd>{m.does}</dd>
      <dt>{t("基礎", "BASE")}</dt><dd>{m.base}</dd>
      <dt>{t("資料", "DATA")}</dt><dd>{m.data}</dd>
    </dl>
  );
}

function OcrScores({ s }) {
  const t = useT();
  const rows = [...s.recognition_true_lines.map((r) => ({ ...r, how: t("辨識（真實行位置）", "Recognition, true line positions"), lc: null })), ...s.end_to_end.map((r) => ({ ...r, how: t("端到端：照片 → 欄位（CPU）", "End to end: photo → fields (CPU)"), lc: r.line_count_right }))];
  return (
    <div className="scroll-x"><table className="table">
      <thead><tr><th>{t("怎麼量", "Measured")}</th><th>{t("測試集", "Split")}</th><th className="r">{t("文件", "Docs")}</th><th className="r">CER</th><th className="r">{t("日期", "Date")}</th><th className="r">{t("金額", "Amount")}</th><th className="r">{t("商家", "Merchant")}</th><th className="r">{t("品項", "Items")}</th><th className="r">{t("整份全對", "Every field right")}</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>
          <td>{r.how}{r.lc != null && <div className="tiny muted">{t(`行數找對 ${r.lc}%`, `line count right on ${r.lc}%`)}{r.ms_median_cpu ? ` · ${r.ms_median_cpu} ms ${t("中位數", "median")}` : ""}</div>}</td>
          <td className="mono">{r.split === "test_font" ? t("test_font（沒見過的字型）", "test_font (unseen font)") : r.split}</td>
          <td className="r">{r.documents}</td><td className="r">{pc(r.cer)}</td>
          <td className="r">{pc(r.fields.date)}</td><td className="r">{pc(r.fields.amount)}</td><td className="r">{pc(r.fields.merchant)}</td><td className="r">{pc(r.fields.items)}</td>
          <td className="r"><Hero v={r.all_fields} ci={r.all_fields_ci95} /></td>
        </tr>))}</tbody>
    </table></div>
  );
}

function RiskScores({ s, live }) {
  const t = useT();
  return (
    <div className="stack-s">
      <div className="scroll-x"><table className="table">
        <thead><tr><th>{t("產品", "Product")}</th><th className="r">{t("訓練理賠數", "Train claims")}</th><th className="r">Gini · LightGBM</th><th className="r">Gini · GLM</th><th className="r">LightGBM − GLM</th><th className="r">{t("費率表", "Tables")}</th><th className="r">{t("上限", "Ceiling")}</th><th className="r">{t("預測／實際", "Predicted / actual")}</th><th className="r">RMSE $</th><th className="r">{t("單調違反", "Monotone violations")}</th><th>{t("報價中", "In quotes")}</th></tr></thead>
        <tbody>{s.by_product.map((r) => {
          const ps = live?.products?.[r.product];
          return (
            <tr key={r.product}>
              <td><b>{r.product}</b>{r.product === "home" && <div className="tiny muted">{t(`水準 ×${s.home_level_factor}`, `level ×${s.home_level_factor}`)}</div>}</td>
              <td className="r">{r.claims_train.toLocaleString("en-US")}</td>
              <td className="r"><Hero v={r.gini_lightgbm} ci={r.gini_lightgbm_ci95} unit="" d={3} /></td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>{r.gini_glm.toFixed(3)}<br /><span className="muted">{iv(r.gini_glm_ci95, 3)}</span></td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>[{sign(r.gini_diff_ci95[0])}, {sign(r.gini_diff_ci95[1])}]</td>
              <td className="r">{r.gini_tables.toFixed(3)}</td><td className="r">{r.gini_ceiling.toFixed(3)}</td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>{r.pred_over_actual_test.toFixed(3)} <span className="muted">{t("測試", "test")}</span><br />{r.pred_over_actual_train.toFixed(3)} <span className="muted">{t("訓練", "train")}</span></td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>{r.rmse_usd.lightgbm} / {r.rmse_usd.glm} / {r.rmse_usd.product_tables}</td>
              <td className="r">{r.monotone_violations}</td>
              <td>{ps ? <Live s={ps} /> : "—"}{ps && !ps.live && ps.why && <div className="tiny muted" style={{ minWidth: "24ch", maxWidth: "32ch" }}>{ps.why[0]}{ps.why.length > 1 ? t(`（另 ${ps.why.length - 1} 項）`, ` (+${ps.why.length - 1} more)`) : ""}</div>}</td>
            </tr>);
        })}</tbody>
      </table></div>
      <p className="tiny muted">{t("RMSE 是對真實保費的誤差：LightGBM / GLM / 費率表。壽險不用模型，用死亡率表。", "RMSE is the error against the true premium: LightGBM / GLM / product tables. Life is not modelled; it is priced from its mortality table.")} {s.home_level_note}</p>
    </div>
  );
}

export default function Models() {
  const t = useT();
  const { data, error } = useApi("/api/models");
  const r = data?.results, live = data?.live || {};
  if (error) return <div className="empty">{t("讀不到模型資料。", "Couldn't load the models.")} <span className="mono">{error.message}</span></div>;
  if (!data) return <div className="empty">{t("載入中…", "Loading…")}</div>;
  return (
    <div className="stack-l">
      <div className="page-head" style={{ display: "block" }}>
        <p className="eyebrow">{t("COVER 自己的模型 · 第 1 輪", "COVER'S OWN MODELS · ROUND 1")}</p>
        <h1>{t("模型", "Models")}</h1>
        <p className="lede" style={{ maxWidth: "70ch" }}>{t("Cover 不用任何 AI 公司的金鑰。它的模型是自己訓練、在自己機器上跑的。下面是每個模型在沒訓練過的測試資料上的分數，含 95% 區間，以及這台伺服器現在用的是哪些。", "Cover holds no AI company's key. Its models are its own, trained by Cover and run on Cover's machines. Below is each model's score on held-out data it never trained on, with 95% intervals, and which of them this server is using right now.")}</p>
      </div>
      {r && <p className="note warn" style={{ maxWidth: "90ch" }}>{r.synthetic}</p>}

      <section className="stack-s">
        <h2>{t("這台伺服器現在", "In this server now")}</h2>
        <div className="scroll-x"><table className="table">
          <thead><tr><th>{t("模型", "Model")}</th><th>{t("狀態", "State")}</th><th>{t("說明", "Detail")}</th></tr></thead>
          <tbody>
            {(r?.models || []).map((m) => {
              const s = live[m.id];
              const detail = m.id === "cover-risk" && s?.products ? Object.entries(s.products).map(([p, x]) => `${p}: ${x.live ? t("模型", "model") : x.why?.[0]?.includes("mortality") ? t("死亡率表", "mortality table") : t("費率表", "factor table")}`).join(" · ") : s?.live ? (s.version || "") : s?.why || "";
              return <tr key={m.id}><td><b>{m.name}</b> <span className="part">{m.round}</span></td><td><Live s={s} /></td><td className="small">{detail}</td></tr>;
            })}
            <tr><td><b>{t("文件讀取", "Document reader")}</b></td><td><span className="badge">{data.reader}</span></td><td className="small">{data.reader.startsWith("ollama") ? t("Muse Glimmer 讀文件（Cover-OCR 還不夠準，見下）", "Muse Glimmer reads documents (Cover-OCR is not accurate enough yet; see below)") : data.reader === "cover-ocr" ? "Cover-OCR" : data.reader === "none" ? t("沒有讀取器：理賠用申請人自己填的數字，並標示為未讀", "No reader: claims use the claimant's own figures, marked as not read") : data.reader}</td></tr>
          </tbody>
        </table></div>
      </section>

      {r?.teacher && <section className="stack-s">
        <h2>{t("老師模型", "The teacher")}</h2>
        <dl className="kv">
          <dt>{t("模型", "MODEL")}</dt><dd><b>{r.teacher.name}</b> <span className="mono muted">{r.teacher.model} · {r.teacher.digest}</span></dd>
          <dt>{t("授權", "LICENSE")}</dt><dd>{r.teacher.license} · {r.teacher.by}</dd>
          <dt>{t("角色", "ROLE")}</dt><dd>{r.teacher.role}</dd>
        </dl>
      </section>}

      {(r?.models || []).map((m) => (
        <section key={m.id} className="stack-s" id={m.id}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{m.name}</h2><span className="part">{m.id} · {m.round}</span>
            <span className={`badge ${m.status === "trained" ? "" : "warn"}`}>{m.status === "trained" ? t("已訓練", "TRAINED") : t("訓練中", "TRAINING")}</span>
            <Live s={live[m.id]} />
          </div>
          <Facts m={m} />
          {m.id === "cover-ocr" && m.scores && <OcrScores s={m.scores} />}
          {m.id === "cover-risk" && m.scores && <RiskScores s={m.scores} live={live["cover-risk"]} />}
          <p className="small" style={{ maxWidth: "90ch" }}>{m.verdict}</p>
        </section>
      ))}
      {!r && <p className="note">{t("ml/results.json 還沒產生。", "ml/results.json has not been generated.")}</p>}
    </div>
  );
}
