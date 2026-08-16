import { StrokeIcon } from '../icons';
import './MobileTabbar.css';

/** 底部 Tab 项(手机 <768px 显示,与桌面侧栏导航同源概念) */
export interface TabItem {
  id: string;
  icon: string;
  label: string;
}

interface MobileTabbarProps {
  items: TabItem[];
  activeId: string;
  onTabClick: (id: string) => void;
}

/** 移动端底部 Tab 栏:固定底栏、毛玻璃、图标 + 小字(商枢同款) */
export function MobileTabbar({ items, activeId, onTabClick }: MobileTabbarProps) {
  return (
    <nav className="tabbar" aria-label="底部导航">
      {items.map(item => (
        <button
          key={item.id}
          className={`tabbar-item ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onTabClick(item.id)}
        >
          <StrokeIcon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
