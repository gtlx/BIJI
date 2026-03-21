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
  const [stats, setStats] = useState({ nodes: 0, edges: 0, totalChars: 0 });

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const data = await window.electronAPI.getGraphData();
        if (!mounted) return;

        const allNotes = await window.electronAPI.getNotes();
        const totalChars = allNotes.reduce((sum, note) => sum + (note.content?.length || 0), 0);

        setStats({ 
          nodes: data.nodes.length, 
          edges: data.edges.length,
          totalChars 
        });
        setIsLoading(false);

        if (data.nodes.length === 0) {
          setError('暂无笔记，请创建笔记并使用 [[标题]] 语法添加链接');
          return;
        }

        renderGraph(data.nodes, data.edges);
      } catch (err) {
        console.error('[GraphView] Error:', err);
        if (!mounted) return;
        setError(`加载失败: ${err}`);
        setIsLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [onSelectNote, currentNoteId]);

  function renderGraph(nodes: GraphNode[], edges: GraphEdge[]) {
    if (!svgRef.current || !containerRef.current) {
      console.warn('[GraphView] Refs not ready');
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    if (width === 0 || height === 0) {
      console.warn('[GraphView] Container has no size');
      setTimeout(() => renderGraph(nodes, edges), 100);
      return;
    }

    console.log('[GraphView] Rendering:', { nodes: nodes.length, edges: edges.length, width, height });

    const svg = d3.select(svgRef.current);
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
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges).id(d => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1);

    const nodeGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelectNote(d.id));

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
      .attr('r', d => Math.min(6 + d.linkCount * 2, 20))
      .attr('fill', d => d.id === currentNoteId ? '#4a90d9' : '#69b3a2');

    nodeGroup.append('text')
      .attr('dy', d => Math.min(6 + d.linkCount * 2, 20) + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .text(d => d.title.length > 15 ? d.title.slice(0, 15) + '...' : d.title);

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
  }

  function handleCenter() {
    if (!svgRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).attr('transform', `translate(${width / 2}, ${height / 2}) scale(1)`);
  }

  function formatChars(num: number): string {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
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
          <span>字数: {formatChars(stats.totalChars)}</span>
        </div>
        <div className="graph-actions">
          <button onClick={handleCenter}>居中</button>
          {onRefresh && <button onClick={onRefresh}>刷新</button>}
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
          <span>其他笔记</span>
        </div>
      </div>
    </div>
  );
}
