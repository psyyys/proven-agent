import { useEffect, useRef } from "react";

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  return { ink: css.getPropertyValue("--color-ink").trim(), line: css.getPropertyValue("--color-line").trim() };
}

export function Plot({ fig, height = 320 }: { fig: any; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { ink, line } = themeColors();
    const layout = {
      ...(fig.layout ?? {}),
      template: undefined,
      autosize: true,
      height,
      margin: { l: 56, r: 16, t: fig.layout?.title?.text ? 44 : 16, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, PingFang SC, Microsoft YaHei, sans-serif", size: 12, color: ink },
      xaxis: { gridcolor: line, zerolinecolor: line, ...(fig.layout?.xaxis ?? {}) },
      yaxis: { gridcolor: line, zerolinecolor: line, ...(fig.layout?.yaxis ?? {}) },
      legend: { orientation: "h", y: -0.2, ...(fig.layout?.legend ?? {}) },
      colorway: ["#0f766e", "#d97706", "#2563eb", "#be185d", "#65a30d", "#7c3aed"],
    };
    let plotly: any = null;
    let disposed = false;
    // Plotly is large; load it only when the first chart is shown.
    import("plotly.js-dist-min").then((mod) => {
      if (disposed) return;
      plotly = mod.default ?? mod;
      plotly.react(el, fig.data ?? [], layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] });
    });
    return () => {
      disposed = true;
      plotly?.purge(el);
    };
  }, [fig, height]);

  return <div ref={ref} className="w-full" style={{ minHeight: height }} />;
}
