import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import './GraphView.css';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  linkCount: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphViewProps {
  onSelectNote: (noteId: string) => void;
  currentNoteId?: string;
  onRefresh?: () => void;
}

export function GraphView({ onSelectNote, currentNoteId, onRefresh }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  useEffect(() => {
    let mounted = true;

    async function loadAndRender() {
      try {
        console.log('[GraphView] Loading graph data...');
        const data = await window.electronAPI.getGraphData();
        console.log('[GraphView] Graph data loaded:', data);
        
        if (!mounted) return;

        setStats({ nodes: data.nodes.length, edges: data.edges.length });
        setIsLoading(false);

        if (data.nodes.length === 0) {
          setError('暂无笔记，请先创建笔记并使用 [[标题]] 语法添加链接');
          return;
        }

        renderGraph(data.nodes, data.edges);
      } catch (err) {
        console.error('[GraphView] Error loading graph:', err);
        if (!mounted) return;
        setError(`加载失败: ${err}`);
        setIsLoading(false);
      }
    }

    loadAndRender();

    return () => {
      mounted = false;
    };
  }, [onSelectNote, currentNoteId]);

  function renderGraph(nodes: GraphNode[], edges: GraphEdge[]) {
    const svgElement = svgRef.current;
    const container = containerRef.current;
    if (!container || !svgElement) {
      console.error('[GraphView] SVG or container not found');
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    console.log('[GraphView] Rendering graph:', { nodes: nodes.length, edges: edges.length, width, height });

    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges).id(d => d.id).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400).distanceMax(300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 1)
      .transition()
      .duration(500)
      .delay((_, i) => i * 20 + 300)
      .attr('stroke-opacity', 0.6);

    const nodeGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        onSelectNote(d.id);
      });

    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeGroup.call(drag);

    nodeGroup.append('circle')
      .attr('r', d => Math.min(8 + d.linkCount * 2, 25))
      .attr('fill', d => d.id === currentNoteId ? '#4a90d9' : '#69b3a2')
      .attr('stroke', d => d.id === currentNoteId ? '#2d5a8a' : '#408e71')
      .attr('stroke-width', 2)
      .attr('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('opacity', 1);

    nodeGroup.append('text')
      .attr('dy', d => Math.min(8 + d.linkCount * 2, 25) + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text(d => truncateTitle(d.title, 20));

    nodeGroup.append('title')
      .text(d => `${d.title}\n链接数: ${d.linkCount}`);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    console.log('[GraphView] Graph rendered successfully');
  }

  function truncateTitle(title: string, maxLength: number): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
  }

  function handleCenter() {
    const svgElement = svgRef.current;
    const container = containerRef.current;
    if (!svgElement || !container) return;
    
    const svg = d3.select(svgElement);
    const zoom = d3.zoom<SVGSVGElement, unknown>();
    svg.transition().duration(500).call(
      zoom.transform,
      d3.zoomIdentity.translate(container.clientWidth / 2, container.clientHeight / 2).scale(1)
    );
  }

  if (isLoading) {
    return (
      <div className="graph-view loading">
        <div className="spinner"></div>
        <p>加载图谱中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-view error">
        <div className="error-icon">!</div>
        <p>{error}</p>
        <button onClick={() => { setIsLoading(true); setError(null); }}>重试</button>
      </div>
    );
  }

  return (
    <div className="graph-view" ref={containerRef}>
      <div className="graph-header">
        <h3>知识图谱</h3>
        <div className="graph-stats">
          <span>笔记: {stats.nodes}</span>
          <span>链接: {stats.edges}</span>
        </div>
        <div className="graph-actions">
          <button onClick={handleCenter} title="居中">居中</button>
          {onRefresh && <button onClick={onRefresh} title="刷新">刷新</button>}
        </div>
      </div>
      <svg ref={svgRef}></svg>
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot current"></span>
          <span>当前笔记</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot linked"></span>
          <span>链接笔记</span>
        </div>
      </div>
    </div>
  );
}
