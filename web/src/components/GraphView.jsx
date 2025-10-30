import React, { useEffect, useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

export default function GraphView({ data, filter, onNodeClick }) {
  const fgRef = useRef();

  const filtered = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const nodes = data.clusters.map((c) => ({ id: c.id, ...c }));
    const links = data.links.map((l) => ({ source: l.source, target: l.target, ...l }));
    if (!filter) return { nodes, links };
    const keep = new Set(
      nodes.filter((n) => n.label?.toLowerCase().includes(filter.toLowerCase())).map((n) => n.id)
    );
    return {
      nodes: nodes.filter((n) => keep.has(n.id)),
      links: links.filter((l) => keep.has(l.source.id || l.source) && keep.has(l.target.id || l.target)),
    };
  }, [data, filter]);

  useEffect(() => {
    if (!fgRef.current) return;
    // increase spread and fit when data changes
    fgRef.current.d3Force("charge").strength(-280);
    // slight delay to allow layout to tick before fitting
    const t = setTimeout(() => {
      try { fgRef.current.zoomToFit(400, 80); } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [filtered.nodes.length, filtered.links.length]);

  return (
    <div className="w-full h-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={filtered}
        nodeRelSize={6}
        linkColor={() => "rgba(255,255,255,.15)"}
        backgroundColor="transparent"
        nodeLabel={n => n.label}
        onNodeClick={onNodeClick}
        nodeCanvasObject={(node, ctx, scale) => {
          const r = 6;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = "#7C5CFC";
          ctx.fill();
          const label = node.label || node.id;
          const fontSize = 12 / scale + 1;
          ctx.font = `${fontSize}px ui-sans-serif`;
          ctx.fillStyle = "rgba(230,233,238,.92)";
          ctx.fillText(label, node.x + 10, node.y + 4);
        }}
      />
    </div>
  );
}
