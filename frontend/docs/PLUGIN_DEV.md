# BIJI 插件开发手册

> 面向后续开发者:照着本文即可接入新插件。BIJI 的插件体系是「声明驱动」(管理登记,
> 非二进制动态加载)—— 声明插件存在→可开关→提供渲染/能力入口,核心不改。
>
> 三层对应关系速览:
>
> | 层 | 文件/位置 | 作用 | 样板 |
> | --- | --- | --- | --- |
> | 后端插件清单 | 后端 `biji-core/src/services/plugin.rs` | 内置插件 + 外部 `plugin.json` 扫描,统一开关,能力注册 | `publish-plugin` |
> | 能力接口(后端) | `CapabilityRegistry` + trait(如 `PublishAdapter`) | 声明「我提供这个能力」 | 发布能力 |
> | 前端插件注册表 | 前端 `frontend/src/plugins/registry.tsx` | 渲染入口(view/pane)+ enable 状态 | 发布 / 看板 / 日历 |

---

## ① 插件目录与 `plugin.json` 契约

### 内置插件 vs 外部声明插件(先分清)

| 维度 | 内置插件(项目自带核心能力) | 外部声明插件(用户/第三方扩展登记) |
| --- | --- | --- |
| **定义位置** | 项目源码:_后端_ `biji-core/src/services/plugin.rs` 的 `built_in_plugins()` 硬编码 `vec`;_前端_ `frontend/src/plugins/registry.tsx` 的 `FRONTEND_PLUGINS` 硬编码数组 | 运行时数据目录 `data_dir/plugins/` 下的 `plugin.json`(子目录或同级 `.json`),由 `PluginManager` 启动时扫描并入列表 |
| **`built_in` 标志** | `built_in: Some(true)` | 自动置 `false`(不进 git、不随编译) |
| **来源** | 随项目编译进 git | 用户/第三方放到运行时目录 |
| **示例** | 后端:番茄钟 `pomodoro-plugin` / 云同步 `sync-plugin` / 发布 `publish-plugin`;前端:`publish` / `kanban` / `calendar` | 自建 `hello-plugin` 的 `plugin.json` |

**共同点**:都进**统一插件列表**、走**统一 `toggle` 开关**、在**统一插件管理弹窗**里显示/启停。
**区别只在「定义位置(源码 vs 目录)」和「built_in 标志」**。

> 给开发者的直接结论:
> - **加核心功能**= 写进源码内置(后端 `built_in_plugins()` 加一项 / 前端 `FRONTEND_PLUGINS` 加一项);
> - **加用户可扩展项**= 提供目录 `plugin.json` 声明(登记 + 开关,行为仍需能力/前端入口承载)。

### 目录形态(默认外部插件目录 = 应用数据目录下的 `plugins/`)

插件扫描支持两种形态:

1. **子目录形态**:`plugins/<插件名>/plugin.json`
   ```
   plugins/
   └── hello-plugin/
       └── plugin.json
   ```
2. **同级 JSON 形态**:`plugins/<插件名>.json`
   ```
   plugins/
   └── hello-plugin.json
   ```

目录不存在 / 为空则静默跳过(不报错、不影响启动)。

### 字段契约

`id` / `name` / `version` **必填**,其余可缺省。未知的 `permissions` 值跳过并记日志。

```json
{
  "id": "hello-plugin",
  "name": "你好插件",
  "version": "0.1.0",
  "description": "一句话说明(插件管理展示用)",
  "author": "你的名字",
  "enabled": false,
  "permissions": ["storage", "network"],
  "provides": ["publish"],
  "entry_point": ""
}
```

- `enabled`:默认 `false`(外部插件默认关闭,需用户在插件管理手开)。
- `permissions`:可选枚举 `storage | network | filesystem | clipboard | notification`。
- `provides`:能力 id 列表(见 §③);这是「声明提供能力」的桥梁。
- `entry_point`:预留的动态加载入口(当前克制版尚未做二进制加载,留空即可)。

> ⚠️ **声明驱动 = 管理登记,不是功能**。扫描 `plugin.json` 只把插件登记进清单并支持启停;
> 插件「真正做什么」由提供的能力 / 前端渲染入口决定。外部插件目前主要是「登记 + 开关」,
> 具体行为仍走内置能力或前端注册表。

插件启用状态:**内置插件**由 `built_in_plugins()` 里的默认值决定;**外部插件**经 DB
`plugin_state` 表幂等持久化(不破坏 `user_version` 门控)。

---

## ② 前端插件接入(`frontend/src/plugins/registry.tsx`)

前端插件 = 给某个**渲染入口**(独立主区视图 view / 分栏面板 pane)挂一个可开关的元信息。
不需要后端参与,前后端插件各自独立开关(插件管理弹窗把二者合并展示)。

### `FrontendPlugin` 接口

```ts
interface FrontendPlugin {
  id: string;                 // 唯一 id(与后端 provides 能力呼应,如 publish ↔ publish-plugin)
  label: string;              // 导航/插件管理显示名
  icon: string;               // icons.tsx STROKE_ICONS 里的图标名
  kind: 'view' | 'pane';      // view=主区全屏视图;pane=分栏面板
  version: string;
  description: string;
  renderView?: (ctx) => ReactNode;  // view 型:渲染主区全屏(收到 onClose / showToast)
  paneId?: PaneId;            // pane 型:关联的分栏面板 id(点击导航打开它)
}
```

### 注册:往 `FRONTEND_PLUGINS` 数组加一项

```ts
// pane 型(分栏面板):
{
  id: 'calendar', label: '日历', icon: 'calendar', kind: 'pane', version: '0.1.0',
  description: '...', paneId: 'calendar',
}
// view 型(全屏视图):
{
  id: 'publish', label: '发布', icon: 'publish', kind: 'view', version: '0.1.0',
  description: '...',
  renderView: ctx => <PublishPanel onClose={ctx.onClose} />,
}
```

> 💡 注意三点:
> 1. **文件必须 `.tsx` 后缀**(含 JSX);`registry.ts` 写 `renderView` JSX 会报 TS1005。
> 2. 对照 `PaneId` 联合类型(`frontend/src/components/pane/types.ts`):若新增分栏面板插件,
>    需同步把面板 id 加进 `PaneId` / `PANE_REGISTRY`。
> 3. **导航去重**:核心导航(`CORE_NAV_ITEMS`)已含的面板(如 calendar)再注册为插件时,
>    App 侧已按核心 nav id 过滤插件导航项,避免出现重复。

### enable 状态机制

- 存储:localStorage `biji.frontend-plugin.enabled`(记录「被显式禁用」的插件 id,未记录=启用)。
- 读取: `isFrontendPluginEnabled(id)` / `getFrontendPlugin(id)` / `getNavPlugins()` /
  `getViewPlugin(id)` / `getFrontendPluginsForManager()`。
- 开关: `setFrontendPluginEnabled(id, enabled)`(会通知所有订阅者,驱动 App 重算导航、
  插件管理重刷列表)。
- 订阅: `subscribeFrontendPlugins(listener)` 返回退订函数(配 React `useEffect` 清理)。
- 面板联动: `getFrontendPluginByPane(paneId)` + `isPaneAddable(paneId)`,决定某分栏面板
  是否进「添加面板」菜单(核心面板恒可加;插件面板仅当其插件启用)。
- 查询入口统一**过滤未启用插件**:关闭 → 导航/渲染/添加面板里即时消失。

---

## ③ 后端插件接入(`CapabilityRegistry` + `provides`)

后端「能力即接口」:**核心定义能力接口 trait**,插件注册时声明「我提供这个能力(id)」,
核心调度只认能力 id,不写死 `match`。

**能力接口 trait**(示例 `PublishAdapter`,定义于 `biji-core/src/publish/` 附近):

```rust
pub trait PublishAdapter {
    fn id(&self) -> &'static str;
    fn detect_info(&self, dir: &Path) -> Option<...>;
    fn get_all_notes_meta(&self) -> Vec<NoteMeta>;
    fn map(&self, note: &NoteMeta) -> ...; // 生成文件/frontmatter
}
// 注意:trait 必须 Send + Sync 才能进 App 共享状态
```

**注册与调用**:

1. `built_in_plugins()`(或外部 `plugin.json`)给插件加 `provides: Some(vec!["publish".into()])`。
2. 后端 `CapabilityRegistry::new()` 建注册表,`App` 初始化时 `registry.register(Box::new(AstroAdapter))`。
3. 使用方 `registry.get("publish")` → 命中 `PublishService` 走 adapter;无适配器回退平铺实现。

> ⚠️ 坑:tauri 命令里**锁一次** `core` 取 `capabilities`,勿在持锁期间再 `.lock()`(Mutex 不可重入死锁)。

---

## ④ 前后端对应(以发布为端到端样板)

「发布」是最完整的端到端样板,前后端通过 id 接住:

| 层 | 实现 |
| --- | --- |
| 后端插件 | `biji-core` `publish-plugin`,`provides: ["publish"]`,可开关 |
| 后端能力 | `CapabilityRegistry` + `PublishAdapter` → `PublishService::publish` 走能力 |
| 前端插件 | `registry.tsx` 注册 `publish`(view 型),`getViewPlugin('publish')?.renderView(...)` |
| 前端渲染 | 主区全屏由 `handleNavClick` 查注册表分流(view → 全屏,pane → 开面板) |

导航/渲染分支从注册表生成,不再硬编码 —— 新增类似插件只需各层加一份声明。

---

## ⑤ 内建样板清单 + 新插件接入步骤

### 已内建样板

| 插件 id | 类型 | 位置(文档索引) | 对应能力/渲染 |
| --- | --- | --- | --- |
| `pomodoro-plugin` | 后端内置 | `plugin.rs` | 番茄钟面板(Pane `pomodoro`) |
| `sync-plugin` | 后端内置 | `plugin.rs` | 云同步设置(默认关闭) |
| `publish-plugin` | 后端能力 | `plugin.rs` + `PublishAdapter` + 前端 `publish` view 插件 | 端到端样板 |
| `（前端）kanban` | 前端 pane | `registry.tsx` | 看板面板(Pane `kanban`) |
| `（前端）calendar` | 前端 pane | `registry.tsx` | 日历面板(Pane `calendar`),同时是核心导航 |

### 新插件接入步骤(以「加一个进度追踪面板」为例)

**前端 pane 型插件(最常见)**:

1. `frontend/src/components/pane/types.ts`:把 `progress` 加进 `PaneId` 联合类型 + `PANE_REGISTRY`(zone 视情况 left/main/right)。
2. 新建 `ProgressPane.tsx`(`App.tsx` 的 `renderPane` switch 里加 `case 'progress':` 分发;若要随导航打开,`handleNavClick` 走 pane 插件分支 `togglePane('progress')`)。
3. `registry.tsx` 的 `FRONTEND_PLUGINS` 加 `{ id:'progress', kind:'pane', paneId:'progress', ... }`。
4. 默认布局:需要在右 dock 默认显示 → 从 `right`(defaultLayout 的 openRight)挑;只在「添加面板」恢复 → 放 `hidden`。

**前端 view 型插件(全屏视图)**:

1. `registry.tsx` 加 `{ id:'myview', kind:'view', renderView: ctx => <MyView onClose={ctx.onClose}/> }`。
2. `handleNavClick('myview')` 已由 view 插件分支接管(设 workspaceView=false 全屏);主区渲染查 `getViewPlugin(activeNav)`。

**后端能力插件(如新博客框架适配器)**:

1. 实现 `PublishAdapter` trait(须 Send+Sync),`CapabilityRegistry` 注册实例。
2. `plugin.rs` 把 `provides` 声明好;或外部 `plugin.json` 声明同 id 的 provides。
3. 前端若需要入口,再按前端范式注册对应插件。

> 校验红线:改完前端必须 `npx tsc --noEmit` EXIT=0;改后端走 `ssh arch` 上 `cargo check/test --workspace`。