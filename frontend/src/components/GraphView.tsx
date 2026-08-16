import { useEffect, useRef } from 'react';
import { backend } from '../api';
import * as d3 from 'd3';
import './GraphView.css';

interface GraphViewProps {
  onSelectNote: (noteId: string) => void;
  currentNoteId?: string;
  onRefresh: () => void;
}

export function GraphView({ onSelectNote, currentNoteId, onRefresh: _onRefresh }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const loadGraph = async () => {
      try {
        const data = await backend.getGraphData();
        if (!svgRef.current || data.nodes.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = svgRef.current.clientWidth || 800;
        const height = svgRef.current.clientHeight || 600;

        const simulation = d3.forceSimulation(data.nodes as d3.SimulationNodeDatum[])
          .force('link', d3.forceLink(data.edges).id((d: any) => d.id).distance(100))
          .force('charge', d3.forceManyBody().strength(-300))
          .force('center', d3.forceCenter(width / 2, height / 2));

        const link = svg.append('g')
          .selectAll('line')
          .data(data.edges)
          .join('line')
          .attr('stroke', '#999')
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1.5);

        const node = svg.append('g')
          .selectAll('circle')
          .data(data.nodes)
          .join('circle')
          .attr('r', 8)
          .attr('fill', (d: any) => d.id === currentNoteId ? '#14b8a6' : '#5eead4')
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')
          .on('click', (_: any, d: any) => onSelectNote(d.id));

        const label = svg.append('g')
          .selectAll('text')
          .data(data.nodes)
          .join('text')
          .text((d: any) => d.title)
          .attr('font-size', 10)
          .attr('dx', 12)
          .attr('dy', 4);

        simulation.on('tick', () => {
          link
            .attr('x1', (d: any) => d.source.x)
            .attr('y1', (d: any) => d.source.y)
            .attr('x2', (d: any) => d.target.x)
            .attr('y2', (d: any) => d.target.y);
          node
            .attr('cx', (d: any) => d.x)
            .attr('cy', (d: any) => d.y);
          label
            .attr('x', (d: any) => d.x)
            .attr('y', (d: any) => d.y);
        });

        return () => { simulation.stop(); };
      } catch (e) {
        console.error('Failed to load graph data:', e);
      }
    };
    loadGraph();
  }, [currentNoteId, onSelectNote]);

  return (
    <div className="graph-view">
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  );
}
