# Implementation Tasks: 引导流程处理依赖版本不匹配

## Change ID
`onboarding-dependency-version-mismatch-handling`

## Task Overview
本变更需要增强引导流程中对依赖版本不匹配的处理，主要通过 UI 优化和文案改进来提升用户体验。核心逻辑已经正确实现，重点在于用户界面的清晰度和国际化支持。

**核心要求**：引导流程必须一次性展示所有需要处理的依赖（包括缺失和版本不匹配），不能只显示第一个问题或逐步暴露问题。

---

## Phase 1: 国际化文件更新

### Task 1.1: 更新英文文案
**文件**: `src/renderer/i18n/locales/en-US/onboarding.json`

**位置**: `depInstallConfirm` 节点

**操作**: 添加版本不匹配相关的文案

**添加内容**:
```json
"depInstallConfirm": {
  // ... 现有字段 ...
  "versionMismatchNote": "Some dependencies have incorrect versions and need to be upgraded.",
  "mixedMissingMessage": "Detected {{missing}} missing and {{mismatch}} version mismatched dependency",
  "mixedMissingMessage_other": "Detected {{missing}} missing and {{mismatch}} version mismatched dependencies",
  "versionMismatchOnlyMessage": "Detected {{count}} version mismatched dependency",
  "versionMismatchOnlyMessage_other": "Detected {{count}} version mismatched dependencies",
  "upgradeNote": "Version mismatched dependencies will be upgraded to the required version."
}
```

**验收标准**:
- [ ] 所有新增字段已添加到 JSON 文件
- [ ] JSON 格式正确，无语法错误
- [ ] 复数形式处理正确（_other 后缀）

---

### Task 1.2: 更新中文文案
**文件**: `src/renderer/i18n/locales/zh-CN/onboarding.json`

**位置**: `depInstallConfirm` 节点

**操作**: 添加版本不匹配相关的中文文案

**添加内容**:
```json
"depInstallConfirm": {
  // ... 现有字段 ...
  "versionMismatchNote": "部分依赖版本不正确，需要升级。",
  "mixedMissingMessage": "检测到 {{missing}} 个缺失和 {{mismatch}} 个版本不匹配的依赖",
  "mixedMissingMessage_other": "检测到 {{missing}} 个缺失和 {{mismatch}} 个版本不匹配的依赖",
  "versionMismatchOnlyMessage": "检测到 {{count}} 个版本不匹配的依赖",
  "versionMismatchOnlyMessage_other": "检测到 {{count}} 个版本不匹配的依赖",
  "upgradeNote": "版本不匹配的依赖将自动升级到要求的版本。"
}
```

**验收标准**:
- [ ] 所有新增字段已添加到 JSON 文件
- [ ] JSON 格式正确，无语法错误
- [ ] 中文翻译准确自然

---

## Phase 2: UI 组件优化

### Task 2.1: 优化依赖统计和提示信息
**文件**: `src/renderer/components/DependencyManagementCardUnified.tsx`

**位置**: 第 79-112 行（依赖过滤和统计逻辑）

**操作**: 增强统计逻辑，区分缺失和版本不匹配的依赖数量

**修改内容**:
```typescript
// Filter dependencies to only show missing ones for onboarding
const filteredDependencies = context === 'onboarding'
  ? dependencies.filter(dep => !dep.installed || dep.versionMismatch)
  : dependencies;

// 统计缺失和版本不匹配的依赖数量
const missingCount = filteredDependencies.filter(dep => !dep.installed).length;
const mismatchCount = filteredDependencies.filter(dep => dep.installed && dep.versionMismatch).length;

const hasMissingDependencies = filteredDependencies.some(dep => !dep.installed || dep.versionMismatch);

// 获取提示信息函数
const getInstallMessage = () => {
  if (missingCount > 0 && mismatchCount > 0) {
    return t('depInstallConfirm.mixedMissingMessage', {
      missing: missingCount,
      mismatch: mismatchCount
    });
  } else if (mismatchCount > 0) {
    return t('depInstallConfirm.versionMismatchOnlyMessage', { count: mismatchCount });
  } else {
    return t('depInstallConfirm.description', { count: missingCount });
  }
};
```

**验收标准**:
- [ ] 统计逻辑正确区分缺失和版本不匹配
- [ ] 提示信息根据场景动态选择
- [ ] 代码格式化正确
- [ ] **关键验证**：在引导流程上下文中，所有 `!dep.installed || dep.versionMismatch` 的依赖都被包含在 `filteredDependencies` 中

---

### Task 2.2: 更新一键安装区域显示
**文件**: `src/renderer/components/DependencyManagementCardUnified.tsx`

**位置**: 第 228-243 行（一键安装按钮区域）

**操作**: 增强提示信息，添加版本不匹配说明

**修改内容**:
```tsx
{/* One-click install button for all missing dependencies */}
{hasMissingDependencies && installingDeps.size === 0 && (
  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
    <p className="text-sm text-foreground mb-2">
      {getInstallMessage()}
    </p>
    {mismatchCount > 0 && (
      <p className="text-xs text-muted-foreground mb-3">
        {t('depInstallConfirm.upgradeNote')}
      </p>
    )}
    <div className="flex gap-2">
      <button
        onClick={handleInstallAll}
        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        {t('depInstallConfirm.confirm')}
      </button>
    </div>
  </div>
)}
```

**验收标准**:
- [ ] 显示正确的统计信息
- [ ] 版本不匹配时显示额外说明
- [ ] 布局和样式保持一致

---

### Task 2.3: 优化单个依赖安装按钮文案
**文件**: `src/renderer/components/DependencyManagementCardUnified.tsx`

**位置**: 第 196-215 行（安装按钮）

**操作**: 根据依赖状态显示不同的按钮文案

**修改内容**:
```tsx
{/* Install button for each missing dependency */}
{needsInstall && (
  <button
    onClick={() => handleInstallSingle(dep.key)}
    disabled={installing}
    className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
  >
    {installing ? (
      <>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
        {t('dependencyManagement.actions.installing')}
      </>
    ) : (
      <>
        <Download className="w-4 h-4" />
        {dep.installed && dep.versionMismatch
          ? t('dependencyManagement.actions.upgrade')
          : t('dependencyManagement.actions.install')
        }
      </>
    )}
  </button>
)}
```

**注意**: 需要先在国际化文件中添加 `upgrade` 翻译。

**依赖**: Task 1.1, Task 1.2

**验收标准**:
- [ ] 版本不匹配时显示"升级"按钮
- [ ] 完全缺失时显示"安装"按钮
- [ ] 安装中状态显示加载动画

---

## Phase 3: 国际化补充

### Task 3.1: 添加"升级"按钮文案
**文件**: `src/renderer/i18n/locales/en-US/onboarding.json` 和 `zh-CN/onboarding.json`

**位置**: `dependencyManagement.actions` 节点

**操作**: 添加 upgrade 操作的翻译

**en-US/onboarding.json**:
```json
"dependencyManagement": {
  "actions": {
    // ... 现有字段 ...
    "upgrade": "Upgrade"
  }
}
```

**zh-CN/onboarding.json**:
```json
"dependencyManagement": {
  "actions": {
    // ... 现有字段 ...
    "upgrade": "升级"
  }
}
```

**验收标准**:
- [ ] 英文和中文都已添加 upgrade 字段
- [ ] JSON 格式正确

---

## Phase 4: 验证与测试

### Task 4.1: 单元测试准备
**操作**: 准备测试场景，验证新的统计逻辑

**测试场景**:
1. 只有缺失依赖的场景
2. 只有版本不匹配依赖的场景
3. 混合场景（既有缺失又有版本不匹配）
4. **关键场景**：多个依赖同时有问题（3个缺失 + 2个版本不匹配），验证全部显示

**验证点**:
- [ ] 统计数量正确
- [ ] 提示信息选择正确
- [ ] 复数形式处理正确

---

### Task 4.2: 手动功能测试
**测试步骤**:
1. 启动应用，进入引导流程
2. 检查依赖状态显示
3. 验证提示信息准确性
4. 执行安装/升级操作

**验收标准**:
- [ ] 版本不匹配依赖显示警告图标
- [ ] 提示信息准确反映依赖状态
- [ ] 升级操作能正常执行
- [ ] 完成后所有依赖满足要求
- [ ] **关键验证**：当有多个依赖存在问题时，所有问题都同时显示，无遗漏

---

### Task 4.3: 国际化测试
**测试步骤**:
1. 切换到英文界面
2. 验证所有新增文案显示正确
3. 切换到中文界面
4. 验证所有新增文案显示正确

**验收标准**:
- [ ] 英文界面无遗漏翻译
- [ ] 中文界面无遗漏翻译
- [ ] 复数形式处理正确

---

## Phase 5: 代码审查与合并

### Task 5.1: 自我代码审查
**检查项**:
- [ ] 所有修改符合 TypeScript 语法规范
- [ ] 代码格式符合项目风格
- [ ] 无引入新的 lint 错误
- [ ] 国际化文件 JSON 格式正确
- [ ] 复数形式处理符合 i18n 规范

---

### Task 5.2: 提交变更
**提交信息格式**:
```
feat: handle dependency version mismatch in onboarding

- Add i18n support for version mismatch messages
- Enhance dependency card to distinguish missing vs mismatched
- Add upgrade button text for mismatched dependencies
- Improve install all prompt with detailed status

This change improves user experience during onboarding by
clearly identifying and guiding users to fix version
mismatched dependencies alongside missing ones.

Related: onboarding-dependency-version-mismatch-handling
```

**验收标准**:
- [ ] 提交信息清晰描述变更内容
- [ ] 包含相关 change ID
- [ ] 遵循项目提交信息规范

---

## 任务依赖关系

```
Phase 1: 国际化文件更新
├── Task 1.1 ──────────────┐
├── Task 1.2 ──────────────┤
└─────────────────────────┘
          │
          ▼
Phase 2: UI 组件优化
├── Task 2.1 ──────────────┤
├── Task 2.2 ──────────────┤
└── Task 2.3 ──────────────┤ (依赖 1.x)
          │
          ▼
Phase 3: 国际化补充
└── Task 3.1 ──────────────┘
          │
          ▼
Phase 4: 验证与测试
├── Task 4.1 ──────────────┤
├── Task 4.2 ──────────────┤
└── Task 4.3 ──────────────┘
          │
          ▼
Phase 5: 代码审查与合并
├── Task 5.1 ──────────────┤
└── Task 5.2 ──────────────┘
```

---

## 预估工作量

| 阶段 | 预估时间 |
|------|----------|
| Phase 1: 国际化文件更新 | 10 分钟 |
| Phase 2: UI 组件优化 | 30 分钟 |
| Phase 3: 国际化补充 | 5 分钟 |
| Phase 4: 验证与测试 | 20 分钟 |
| Phase 5: 代码审查与合并 | 10 分钟 |
| **总计** | **75 分钟** |

---

## 回滚计划

如果变更导致问题，可以：
1. 恢复修改的文件到变更前状态
2. 重新构建并发布

回滚步骤：
```bash
git revert <commit-hash>
npm run build:prod
```

受影响的文件清单：
- `src/renderer/components/DependencyManagementCardUnified.tsx`
- `src/renderer/i18n/locales/en-US/onboarding.json`
- `src/renderer/i18n/locales/zh-CN/onboarding.json`
