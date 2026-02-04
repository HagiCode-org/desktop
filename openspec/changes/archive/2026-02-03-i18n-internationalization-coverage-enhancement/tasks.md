# 实施 i18n 国际化翻译覆盖完善

本文档列出了完善国际化翻译覆盖所需的有序任务清单。

## 任务概览

| 阶段 | 任务数 | 预计工作量 | 可并行化 |
|------|--------|------------|----------|
| 1. 审查与规划 | 2 | 30 分钟 | 否 |
| 2. 翻译资源创建 | 3 | 1-1.5 小时 | 是（部分） |
| 3. 代码国际化改造 | 3 | 2-3 小时 | 是（部分） |
| 4. 验证与修复 | 3 | 1 小时 | 否 |
| **总计** | **11** | **4.5-6 小时** | **-** |

---

## 阶段 1: 审查与规划

### Task 1.1: 审查现有硬编码文本

**目标**: 系统性识别所有需要国际化的硬编码文本

**步骤**:
1. 在 `src/renderer/` 目录下搜索所有 `.tsx` 文件中的硬编码英文文本
   - 使用正则表达式模式: `["']([A-Z][a-zA-Z\s]{3,})["']`
   - 排除 React 组件的 `displayName` 属性
2. 重点关注以下文件:
   - `src/renderer/App.tsx` (已知问题: 第 122, 142-144, 158, 169 行)
   - `src/renderer/components/ui/dialog.tsx` (第 47 行 `sr-only` 文本)
   - 其他 UI 组件中的占位符、提示文本
3. 创建一份硬编码文本清单，包括:
   - 文件路径和行号
   - 当前硬编码文本内容
   - 建议的翻译键命名
   - 所属命名空间

**验证标准**:
- 清单包含所有识别出的硬编码文本
- 每项都有明确的翻译键建议

**依赖**: 无

---

### Task 1.2: 设计 UI 命名空间结构

**目标**: 规划新的 `ui` 命名空间用于组件库翻译

**步骤**:
1. 分析 `src/renderer/components/ui/` 目录下的组件
2. 确定需要翻译的元素类型:
   - 无障碍文本 (`sr-only`, `aria-label`)
   - 默认占位符
   - 工具提示
3. 设计翻译键结构:
   ```json
   {
     "dialog": { "close": "Close", ... },
     "button": { "submit": "Submit", ... },
     "alert": { "dismiss": "Dismiss", ... },
     ...
   }
   ```

**验证标准**:
- 翻译键结构清晰、一致
- 覆盖所有 UI 组件的无障碍文本需求

**依赖**: Task 1.1

---

## 阶段 2: 翻译资源创建

### Task 2.1: 创建 `ui.json` 翻译文件

**目标**: 为 UI 组件库创建独立的翻译资源

**步骤**:
1. 创建以下文件:
   - `src/renderer/i18n/locales/zh-CN/ui.json`
   - `src/renderer/i18n/locales/en-US/ui.json`
2. 添加基础翻译键（根据 Task 1.2 的设计）:
   ```json
   {
     "dialog": {
       "close": "关闭"
     },
     "button": {
       "submit": "提交",
       "cancel": "取消"
     },
     "alert": {
       "dismiss": "关闭"
     }
   }
   ```
3. 确保中英文文件的键结构完全一致

**验证标准**:
- 两个文件的 JSON 格式有效
- 键结构一致性通过 diff 验证

**依赖**: Task 1.2

---

### Task 2.2: 补充 `common.json` 缺失的翻译键

**目标**: 为 App.tsx 中的硬编码文本添加翻译

**步骤**:
1. 在 `zh-CN/common.json` 中添加:
   ```json
   {
     "remoteServer": {
       "title": "远程服务器状态",
       "status": {
         "operational": "远程服务器正在运行",
         "notRunning": "远程服务器未运行",
         "connectionFailed": "无法连接到远程服务器"
       },
       "actions": {
         "start": "启动远程服务器",
         "stop": "停止远程服务器"
       }
     }
   }
   ```
2. 在 `en-US/common.json` 中添加对应的英文翻译
3. 验证键结构一致性

**验证标准**:
- JSON 格式有效
- 键在中英文文件中完全一致
- 翻译语义准确

**依赖**: Task 1.1

---

### Task 2.3: 注册 `ui` 命名空间

**目标**: 在 i18n 配置中注册新的命名空间

**步骤**:
1. 编辑 `src/renderer/i18n/config.ts`
2. 修改 `ns` 数组，添加 `'ui'`:
   ```typescript
   ns: ['common', 'components', 'pages', 'ui'],
   ```

**验证标准**:
- 配置文件 TypeScript 类型检查通过
- 应用启动无错误

**依赖**: Task 2.1

---

## 阶段 3: 代码国际化改造

### Task 3.1: 国际化 App.tsx 中的硬编码文本

**目标**: 将 App.tsx 中的所有硬编码文本替换为翻译函数调用

**步骤**:
1. 更新 `useTranslation` 调用，添加必要的命名空间:
   ```typescript
   const { t } = useTranslation(['pages', 'common', 'components']);
   ```
2. 替换第 122 行标题:
   ```tsx
   // Before: Remote Server Status
   // After:
   {t('common.remoteServer.title')}
   ```
3. 替换第 142-144 行状态描述:
   ```tsx
   {serverStatus === 'running' ? t('common.remoteServer.status.operational') :
    serverStatus === 'stopped' ? t('common.remoteServer.status.notRunning') :
    t('common.remoteServer.status.connectionFailed')}
   ```
4. 替换第 158、169 行按钮文本:
   ```tsx
   // Before: Start Remote Server / Stop Remote Server
   // After:
   {t('common.remoteServer.actions.start')}
   {t('common.remoteServer.actions.stop')}
   ```

**验证标准**:
- TypeScript 编译无错误
- 界面显示翻译后的文本
- 切换语言时文本正确更新

**依赖**: Task 2.2, Task 2.3

---

### Task 3.2: 国际化 UI 组件库的无障碍文本

**目标**: 本地化 shadcn/ui 组件中的 `sr-only` 和无障碍属性

**步骤**:
1. 修改 `src/renderer/components/ui/dialog.tsx`:
   - 导入 `useTranslation`: `import { useTranslation } from 'react-i18n';`
   - 使用 `t('ui.dialog.close')` 替换硬编码的 "Close"
   - 确保组件通过 `forwardRef` 正确传递翻译上下文
2. 检查其他 UI 组件中的类似模式:
   - `alert.tsx` - 关闭按钮
   - `popover.tsx` / `dropdown-menu.tsx` - 关闭文本
   - `tooltip.tsx` - 任何辅助性文本

**验证标准**:
- 组件仍然正常工作
- 屏幕阅读器能读取本地化的无障碍文本
- 无 TypeScript 类型错误

**依赖**: Task 2.1, Task 2.3

---

### Task 3.3: 审查并修复其他组件的硬编码文本

**目标**: 处理剩余组件中的硬编码文本（如有）

**步骤**:
1. 根据 Task 1.1 的清单，逐个处理剩余文件
2. 对于每个硬编码文本:
   - 在相应的命名空间中添加翻译键（如需要）
   - 使用 `t()` 函数替换硬编码字符串
   - 验证组件仍然正常工作

**验证标准**:
- 所有清单项都已处理
- 控制台无 "Missing translation key" 警告

**依赖**: Task 1.1, Task 2.2, Task 2.3

---

## 阶段 4: 验证与修复

### Task 4.1: 验证翻译资源文件一致性

**目标**: 确保所有语言版本的翻译文件键结构完全一致

**步骤**:
1. 对每个命名空间，使用 diff 工具比较中英文文件:
   ```bash
   diff <(jq -S . src/renderer/i18n/locales/zh-CN/common.json) \
        <(jq -S . src/renderer/i18n/locales/en-US/common.json)
   ```
2. 检查所有四个命名空间: `common`, `components`, `pages`, `ui`
3. 修复发现的不一致问题

**验证标准**:
- diff 输出仅显示翻译值差异，无键缺失或多余
- 所有文件 JSON 格式有效

**依赖**: Task 2.1, Task 2.2, Task 3.1, Task 3.2, Task 3.3

---

### Task 4.2: 语言切换功能测试

**目标**: 全面验证语言切换功能

**步骤**:
1. 启动应用
2. 切换到简体中文:
   - 验证所有界面文本显示为中文
   - 检查 App.tsx 的远程服务器状态卡片
   - 检查包管理和 Web 服务状态卡片
   - 检查设置页面
3. 切换到英文:
   - 验证所有界面文本显示为英文
   - 重复上述检查点
4. 验证动态内容:
   - 启动/停止服务器时，状态文本正确显示
   - 包安装进度文本正确显示

**验证标准**:
- 所有界面元素正确显示对应语言
- 无硬编码英文或中文文本可见
- 切换过程无错误或警告

**依赖**: Task 4.1

---

### Task 4.3: 开发环境验证

**目标**: 验证 i18n 开发工具正常工作

**步骤**:
1. 启动开发环境（`NODE_ENV=development`）
2. 打开浏览器开发者工具，查看控制台
3. 确认:
   - 无 "Missing translation key" 警告
   - 如有翻译键缺失，`missingKeyHandler` 正确记录
4. 尝试临时移除一个翻译键，验证 `saveMissing` 功能:
   - 应在控制台看到警告
   - 开发模式下应该记录缺失的键

**验证标准**:
- 控制台无翻译相关警告（除了故意触发的测试）
- `missingKeyHandler` 功能正常

**依赖**: Task 4.2

---

## 附录: 翻译键命名规范

为了保持一致性，建议遵循以下命名约定:

### 格式
```
<namespace>:<category>.<item>[(.<subitem>)]
```

### 示例
- `common:button.save` - 通用按钮
- `common:status.running` - 状态文本
- `components:remoteServer.title` - 组件标题
- `components:remoteServer.status.operational` - 组件状态描述
- `pages:settings.title` - 页面标题
- `ui:dialog.close` - UI 组件无障碍文本

### 约定
- 使用小驼峰命名法 (camelCase)
- 避免过深的层级（最多 3 层）
- 保持简洁但描述性
- 同类元素使用一致的命名模式

---

## 并行化机会

以下任务可以并行执行以节省时间:

1. **Task 2.1 和 Task 2.2**: 创建不同的翻译文件，互不依赖
2. **Task 3.2 和 Task 3.3**: 处理不同的组件文件，可独立进行
3. **Task 4.1 可以部分与 Task 4.2 重叠**: 早期验证可以在代码改动后立即进行

---

## 阻塞检查点

以下任务如果阻塞，需要立即解决才能继续:

- **Task 1.1**: 如果无法识别所有硬编码文本，后续任务无法完成
- **Task 2.3**: 命名空间注册必须在代码改造前完成
- **Task 3.1**: App.tsx 改造是核心任务，其他任务依赖其模式

---

## 完成标准

当所有任务完成且满足以下条件时，本变更视为完成:

- [x] 所有硬编码文本已替换为翻译函数调用
- [x] 中英文翻译文件键结构一致
- [x] 语言切换功能正常工作
- [x] 控制台无翻译相关警告
- [x] 代码通过 TypeScript 类型检查
- [x] 现有功能不受影响
