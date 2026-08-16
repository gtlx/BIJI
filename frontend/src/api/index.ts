import type { BackendAdapter } from './backend';
import { TauriBackend } from './tauri-adapter';
import { MockBackend } from './mock-adapter';

// 检测是否在 Tauri 环境中
function isTauri(): boolean {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  } catch {
    return false;
  }
}

// 导出全局唯一的后端实例
// 切换后端只需改这里一行代码
export const backend: BackendAdapter = isTauri()
  ? new TauriBackend()
  : new MockBackend();

export type { BackendAdapter } from './backend';
export { TauriBackend } from './tauri-adapter';
export { MockBackend } from './mock-adapter';
