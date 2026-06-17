# HITL 项目文档索引

本文件列出项目中所有文档及其用途。根据你的需求选择相应文档阅读。

---

## 📋 文档地图

### 🚀 快速开始

- **[README.md](../README.md)** - 项目简介和快速启动指南
  - 什么是 HITL
  - 如何运行项目
  - API 概览

- **[01-OVERVIEW.md](01-OVERVIEW.md)** - 项目全景视图
  - HITL 流程概述
  - 系统架构
  - 项目结构
  - 推荐文档阅读路径

---

### 💡 深度学习

#### 想理解 AI 如何工作？

👉 **[02-PROMPT-DESIGN.md](02-PROMPT-DESIGN.md)**

- 提示词设计原则
- 三个 API 端点的 prompt 策略
  - `/api/review`：生成建议（温度 0.3）
  - `/api/apply`：应用修改（温度 0.1）
  - `/api/regenerate`：新建议（温度 0.7）
- Prompt 工程最佳实践
- 常见问题解答

**适合场景**：
- 想改进 AI 建议质量
- 想支持新的模型或语言
- 想理解 prompt 为什么这样写

---

#### 想了解前端怎么实现的？

👉 **[03-FRONTEND.md](03-FRONTEND.md)**

- 8 个关键 State 变量详解
- 进度追踪逻辑
- 四种建议处理方式（接受、拒绝、跳过、编辑）
- 轮换显示（Carousel）
- 错误处理
- 修改历史管理

**适合场景**：
- 想修改 UI 流程
- 想理解状态管理
- 想添加新的交互方式

---

#### 想了解后端怎么实现的？

👉 **[04-BACKEND.md](04-BACKEND.md)**

- 项目结构和启动方式
- 依赖管理（PEP 723）
- CORS 配置
- 数据模型（Pydantic）
- 三个 API 端点的完整实现
  - `/api/health`
  - `/api/review`
  - `/api/apply`
  - `/api/regenerate`
- 错误处理和性能考虑

**适合场景**：
- 想改进后端逻辑
- 想调试 API 问题
- 想支持新的 LLM 引擎

---

#### 想理解设计决策？

👉 **[05-DESIGN-DECISIONS.md](05-DESIGN-DECISIONS.md)**

- 5 个关键设计决策详解
  1. totalSuggestions vs completedSuggestions
  2. 后端 AI 替换 vs 前端 JS 替换
  3. 发送完整文本 vs 只发片段
  4. 三个不同的温度值
  5. Pydantic 数据验证
- 对比方案分析
- 实际例子
- 设计哲学

**适合场景**：
- 想理解为什么这样设计
- 考虑改进现有设计
- 学习系统设计思路

---

---

## 🎯 按角色阅读指南

### 👤 产品经理

需要理解系统能做什么：
1. README.md
2. 01-OVERVIEW.md

**理解点**：HITL 流程、用户体验、API 流程

---

### 💻 前端工程师

需要改进 UI 或交互：
1. 01-OVERVIEW.md
2. 03-FRONTEND.md
3. 05-DESIGN-DECISIONS.md（前两个决策）

**理解点**：状态管理、交互流程、why 不是 JS 替换

---

### 🔧 后端工程师

需要改进 API 或集成新 LLM：
1. 01-OVERVIEW.md
2. 04-BACKEND.md
3. 02-PROMPT-DESIGN.md（相关部分）
4. 05-DESIGN-DECISIONS.md（相关决策）

**理解点**：API 实现、Prompt 策略、参数选择

---

### 🤖 AI/ML 工程师

需要优化 AI 建议质量：
1. 02-PROMPT-DESIGN.md（重点）
2. 05-DESIGN-DECISIONS.md（第 3、4 决策）
3. 04-BACKEND.md（参数部分）

**理解点**：Prompt 设计、温度选择、上下文管理

---

### 📖 新贡献者

第一次接触项目：
1. README.md（快速启动）
2. 01-OVERVIEW.md（整体理解）
3. 选择感兴趣的领域（前端/后端/AI）深入

---

## 🔍 快速查找

### "我想..."

**改进建议质量**
→ 02-PROMPT-DESIGN.md 中的"Prompt 优化建议"部分
→ 05-DESIGN-DECISIONS.md 中的温度部分

**支持新 LLM（Claude、GPT-4 等）**
→ 04-BACKEND.md 中的"扩展思路"
→ 02-PROMPT-DESIGN.md 了解 prompt 兼容性

**修改 UI 流程**
→ 03-FRONTEND.md 中的"四种建议处理方式"
→ 05-DESIGN-DECISIONS.md 理解为什么这样设计

**调试 API 问题**
→ 04-BACKEND.md 中的"错误处理"
→ 02-PROMPT-DESIGN.md 了解 JSON 格式要求

**理解为什么这样设计**
→ 05-DESIGN-DECISIONS.md（直接查看相关决策）

**从零开始学 HITL**
→ 01-OVERVIEW.md 整体理解
→ 选择感兴趣的深度文档

---

## 📊 文档属性

| 文档 | 长度 | 难度 | 更新频率 |
|------|------|------|---------|
| README.md | 中 | 低 | 高 |
| 01-OVERVIEW.md | 中 | 低 | 中 |
| 02-PROMPT-DESIGN.md | 长 | 中 | 高 |
| 03-FRONTEND.md | 长 | 中 | 中 |
| 04-BACKEND.md | 长 | 中 | 中 |
| 05-DESIGN-DECISIONS.md | 长 | 高 | 低 |
| HITL_IMPLEMENTATION.md | 非常长 | 中 | 低 |

---

## 🔄 文档关系图

```
README.md
    ↓
01-OVERVIEW.md (核心节点)
    ├─→ 02-PROMPT-DESIGN.md (AI 工程师)
    ├─→ 03-FRONTEND.md (前端工程师)
    ├─→ 04-BACKEND.md (后端工程师)
    └─→ 05-DESIGN-DECISIONS.md (架构师/新贡献者)
```

---

## 💾 文档维护

### 何时更新文档

- ✏️ 添加新功能 → 更新相关文档
- 🐛 修复 bug → 如果原理有变化，更新设计决策
- 🎯 优化 prompt → 更新 02-PROMPT-DESIGN.md
- 🔧 重构代码 → 更新相关实现文档

### 文档优先级（更新频率）

1. **高**：02-PROMPT-DESIGN.md、README.md（AI/模型变化时）
2. **中**：03-FRONTEND.md、04-BACKEND.md（功能变化时）
3. **低**：05-DESIGN-DECISIONS.md、01-OVERVIEW.md（架构不变时）

---

## ✅ 阅读检查清单

读完一份文档后，你应该能回答：

### 读完 01-OVERVIEW.md

- [ ] HITL 的 6 个步骤是什么？
- [ ] 三个 API 端点的作用？
- [ ] 前端和后端分别运行在哪个端口？

### 读完 02-PROMPT-DESIGN.md

- [ ] 为什么 /api/review 的温度是 0.3？
- [ ] /api/apply 的 prompt 为什么要发送完整文本？
- [ ] 如何防止 /api/regenerate 重复生成相同建议？

### 读完 03-FRONTEND.md

- [ ] 为什么要分离 totalSuggestions 和 completedSuggestions？
- [ ] 处理建议的四种方式分别是什么？
- [ ] 拒绝建议时为什么不增加 completedSuggestions？

### 读完 04-BACKEND.md

- [ ] PEP 723 元数据的作用？
- [ ] 为什么用 OpenAI SDK 访问 DeepSeek？
- [ ] 三个 API 的参数和返回值？

### 读完 05-DESIGN-DECISIONS.md

- [ ] 前端替换 vs 后端 AI 替换，哪个更好，为什么？
- [ ] 为什么发送完整文本到 AI？
- [ ] Pydantic 模型相比字典验证的优势？

---

## 🤝 提问和反馈

如果文档有以下问题，请反馈：

- ❓ 内容不清楚、有歧义
- 📌 缺少重要信息
- 🔗 链接断裂或引用错误
- 💡 建议改进的地方

通过 GitHub Issues 或 PR 反馈。
