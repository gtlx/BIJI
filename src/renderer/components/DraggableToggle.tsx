import { useState } from 'react';
import './DraggableToggle.css';

interface DraggableToggleProps {
  direction: 'left' | 'right';
  onToggle: () => void;
  initialPosition?: { x?: number; y?: number };
}

export function DraggableToggle({ direction, onToggle, initialPosition = {} }: DraggableToggleProps) {
  const [position, setPosition] = useState({ y: initialPosition.y || 80 });
  const [isDragging, setIsDragging] = useState(false);

  const isLeft = direction === 'left';
  const icon = isLeft ? '◀' : '▶';

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientY > 0) {
      setPosition(prev => ({ 
        ...prev, 
        y: Math.max(50, Math.min(window.innerHeight - 50, e.clientY))
      }));
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <button
      className={`draggable-toggle ${isLeft ? 'left' : 'right'} ${isDragging ? 'dragging' : ''}`}
      style={{ top: position.y }}
      draggable
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onClick={onToggle}
      title={isLeft ? '展开左侧边栏' : '展开右侧边栏'}
    >
      <span className="toggle-icon">{icon}</span>
    </button>
  );
}
