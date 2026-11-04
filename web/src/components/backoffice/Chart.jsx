// An AG Chart in Cover's chart theme. Loaded on its own (React.lazy) so only staff pages fetch AG Charts.
import { AgCharts } from "ag-charts-react";
import { chartTheme } from "./theme.js";

export default function Chart({ options }) {
  return <AgCharts options={{ theme: chartTheme, ...options }} />;
}
