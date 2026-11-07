// AG Grid and AG Charts, drawn in VeriPay tokens (DESIGN.md): white panels, navy ink, hairlines, the blue system,
// Martian Mono for headers and figures, soft corners. The grid's theme is built with AG Grid's Theming API
// (themeQuartz + parts + params, which reach the CSS variables directly); the charts draw on a canvas, so they get
// the same tokens resolved to sRGB.
import { ModuleRegistry, AllCommunityModule, themeQuartz, colorSchemeLight, iconSetQuartzLight } from "ag-grid-community";
import { ModuleRegistry as ChartModules, AllCommunityModule as AllChartsModule } from "ag-charts-community";

ModuleRegistry.registerModules([AllCommunityModule]);
ChartModules.registerModules([AllChartsModule]);

export const gridTheme = themeQuartz
  .withPart(colorSchemeLight)
  .withPart(iconSetQuartzLight)
  .withParams({
    browserColorScheme: "light",
    backgroundColor: "var(--ground-2)",
    foregroundColor: "var(--ink)",
    textColor: "var(--ink)",
    subtleTextColor: "var(--ink-3)",
    chromeBackgroundColor: "var(--ground-3)",
    accentColor: "var(--signal)",
    borderColor: "var(--line)",
    borderRadius: 6,
    wrapperBorderRadius: 8,
    wrapperBorder: { color: "var(--line)" },
    rowBorder: { color: "var(--line)" },
    columnBorder: false,
    headerColumnBorder: { color: "var(--line)" },
    headerColumnBorderHeight: "40%",
    headerBackgroundColor: "var(--ground-3)",
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
    rowHoverColor: "var(--hover)",
    selectedRowBackgroundColor: "var(--signal-soft)",
    rangeSelectionBorderColor: "var(--signal)",
    inputBorder: { color: "var(--line-strong)" },
    inputFocusBorder: { color: "var(--signal)" },
    inputBackgroundColor: "#FFFFFF",
    focusShadow: { radius: 0, spread: 1, color: "var(--signal)" },
    checkboxCheckedBackgroundColor: "var(--signal)",
    checkboxCheckedBorderColor: "var(--signal)",
    menuBackgroundColor: "#FFFFFF",
    menuBorder: { color: "var(--line-strong)" },
    menuShadow: { radius: 24, offsetY: 12, color: "rgba(0, 28, 100, 0.16)" },
    tooltipBackgroundColor: "#FFFFFF",
    tooltipTextColor: "var(--ink)",
    tooltipBorder: { color: "var(--line-strong)" },
    cardShadow: "none",
    popupShadow: "0 12px 36px rgba(0, 28, 100, 0.16)",
    iconSize: 14,
    iconColor: "var(--ink-3)",
    paginationPanelHeight: 44,
  });

import { C } from "./tokens.js";
export { C };
export const chartTheme = {
  baseTheme: "ag-default",
  palette: { fills: [C.primary, C.signal, C.ok, C.warn, C.agent], strokes: [C.primary, C.signal, C.ok, C.warn, C.agent] },
  params: {
    fontFamily: "Martian Mono, monospace",
    fontSize: 11,
    backgroundColor: C.ground2,
    chartBackgroundColor: C.ground2,
    foregroundColor: C.ink,
    textColor: C.ink2,
    subtleTextColor: C.ink3,
    gridLineColor: "#E6EBF2",
    axisLineColor: C.lineStrong,
    borderColor: C.line,
    borderRadius: 8,
    chartPadding: 12,
    accentColor: C.signal,
    tooltipBackgroundColor: C.ground2,
    tooltipTextColor: C.ink,
    tooltipBorder: { color: C.lineStrong },
    tooltipBorderRadius: 6,
  },
  overrides: { common: { title: { fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 800, fontSize: 18, color: C.ink } }, bar: { series: { cornerRadius: 3 } } },
};
