// AG Grid and AG Charts, drawn in Cover's tokens (DESIGN.md): graphite ground, white ink, hairlines, one safety-orange
// signal, Martian Mono for headers and figures, 2px corners. The grid's theme is built with AG Grid's Theming API
// (themeQuartz + parts + params, which reach Cover's CSS variables directly); the charts draw on a canvas, so they get
// the same tokens resolved to sRGB.
import { ModuleRegistry, AllCommunityModule, themeQuartz, colorSchemeDark, iconSetQuartzLight } from "ag-grid-community";
import { ModuleRegistry as ChartModules, AllCommunityModule as AllChartsModule } from "ag-charts-community";

ModuleRegistry.registerModules([AllCommunityModule]);
ChartModules.registerModules([AllChartsModule]);

export const gridTheme = themeQuartz
  .withPart(colorSchemeDark)
  .withPart(iconSetQuartzLight)
  .withParams({
    browserColorScheme: "dark",
    backgroundColor: "var(--ground-2)",
    foregroundColor: "var(--ink)",
    textColor: "var(--ink)",
    subtleTextColor: "var(--ink-3)",
    chromeBackgroundColor: "var(--ground)",
    accentColor: "var(--signal)",
    borderColor: "var(--line)",
    borderRadius: 2,
    wrapperBorderRadius: 2,
    wrapperBorder: { color: "var(--line)" },
    rowBorder: { color: "var(--line)" },
    columnBorder: false,
    headerColumnBorder: { color: "var(--line)" },
    headerColumnBorderHeight: "40%",
    headerBackgroundColor: "var(--ground)",
    headerTextColor: "var(--ink-3)",
    headerFontFamily: "var(--mono)",
    headerFontSize: 11,
    headerFontWeight: 500,
    headerHeight: 40,
    headerRowBorder: { color: "var(--line-strong)" },
    fontFamily: "var(--font)",
    fontSize: 14,
    rowHeight: 46,
    spacing: 6,
    cellHorizontalPadding: 12,
    oddRowBackgroundColor: "var(--ground-2)",
    rowHoverColor: "oklch(1 0 0 / 0.035)",
    selectedRowBackgroundColor: "var(--signal-soft)",
    rangeSelectionBorderColor: "var(--signal)",
    inputBorder: { color: "var(--line-strong)" },
    inputFocusBorder: { color: "var(--signal)" },
    inputBackgroundColor: "var(--ground)",
    focusShadow: { radius: 0, spread: 1, color: "var(--signal)" },
    checkboxCheckedBackgroundColor: "var(--signal)",
    checkboxCheckedBorderColor: "var(--signal)",
    menuBackgroundColor: "var(--ground-3)",
    menuBorder: { color: "var(--line-strong)" },
    menuShadow: { radius: 24, offsetY: 12, color: "oklch(0 0 0 / 0.5)" },
    tooltipBackgroundColor: "var(--ground-3)",
    tooltipTextColor: "var(--ink)",
    tooltipBorder: { color: "var(--line-strong)" },
    cardShadow: "none",
    popupShadow: "0 24px 60px oklch(0 0 0 / 0.5)",
    iconSize: 14,
    iconColor: "var(--ink-3)",
    paginationPanelHeight: 44,
  });

import { C } from "./tokens.js";
export { C };
export const chartTheme = {
  baseTheme: "ag-default-dark",
  palette: { fills: [C.signal, C.ink3, C.agent, C.ok, C.warn], strokes: [C.signal, C.ink3, C.agent, C.ok, C.warn] },
  params: {
    fontFamily: "Martian Mono, Noto Sans TC, monospace",
    fontSize: 11,
    backgroundColor: C.ground2,
    chartBackgroundColor: C.ground2,
    foregroundColor: C.ink,
    textColor: C.ink2,
    subtleTextColor: C.ink3,
    gridLineColor: "rgba(255,255,255,0.08)",
    axisLineColor: C.lineStrong,
    borderColor: C.line,
    borderRadius: 2,
    chartPadding: 12,
    accentColor: C.signal,
    tooltipBackgroundColor: C.ground3,
    tooltipTextColor: C.ink,
    tooltipBorder: { color: C.lineStrong },
    tooltipBorderRadius: 2,
  },
  overrides: { common: { title: { fontFamily: "Big Shoulders Display, Noto Sans TC, sans-serif", fontWeight: 800, fontSize: 20, color: C.ink } }, bar: { series: { cornerRadius: 0 } } },
};
