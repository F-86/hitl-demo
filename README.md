# Human-in-the-Loop 演示：AI 写作助手

一个全栈 Demo，展示 **Human-in-the-Loop（HITL）** 人机协作模式。

**前端:** React (Vite)  
**后端:** Python (FastAPI)，通过 uv 运行  
**AI 模型:** DeepSeek V4 Flash  

## 🎯 什么是 Human-in-the-Loop？

HITL 是一种人机协作的设计模式：

- **AI 提出** 修改建议
- **人类审核、编辑、采纳或拒绝**
- **AI 根据反馈** 执行修改，进入下一轮

这个 Demo 实现了一个完整的 AI 写作助手，严格遵循上述流程。

## 🔄 交互流程

```
┌───────────┐     ┌───────────┐     ┌───────────┐
│  人类     │────▶│    AI     │────▶│  人类     │
│  撰写文本  │     │  审阅文本  │     │ 采纳/拒绝  │
└───────────┘     └───────────┘     └───────────┘
                                            │
                    ┌───────────────────────┘
                    ▼
              ┌───────────┐
              │    AI     │
              │  应用修改  │
              └───────────┘
                    │
                    ▼
              （循环继续）
```

## 🚀 快速开始

### 1. 后端（Python + uv）

```bash
uv run backend/app.py
```

服务运行在 http://localhost:8000

> 依赖声明在 `app.py` 顶部的 PEP 723 元数据中，`uv run` 会自动解析并安装，无需手动 `pip install`。

### 2. 前端（React + pnpm）

```bash
cd frontend
pnpm install
pnpm dev
```

运行在 http://localhost:3000

### 3. 使用方式

1. 在编辑器中输入或粘贴文本
2. 点击 **"Ask AI to Review"** —— AI 分析文本并给出修改建议
3. 对每条建议：
   - **Accept** —— 采纳 AI 建议
   - **Edit & Accept** —— 修改建议后再采纳
   - **New Suggestion** —— 拒绝当前建议，换一条
   - **Skip** —— 跳过这条建议
4. 处理完所有建议后，再次点击 **"Ask AI to Review"** 开始新一轮审阅

## 🏗️ 项目结构

```
hitl-demo/
├── backend/
│   ├── app.py              # FastAPI 服务，集成 DeepSeek
│   └── requirements.txt    # Python 依赖（用于兼容传统 pip 方式）
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # 主 React 组件
│   │   ├── App.css         # 样式
│   │   └── main.jsx        # 入口
│   ├── index.html
│   ├── package.json
│   └── vite.config.js      # Vite 配置（含 API 代理）
└── README.md
```

## 🔑 API Key

DeepSeek API Key 通过环境变量 `DEEPSEEK_API_KEY` 配置。你可以在项目根目录创建 `.env` 文件：

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

> `.env` 已加入 `.gitignore`，不会被提交到仓库。

## 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/review` | AI 审阅文本，返回修改建议 |
| `POST` | `/api/apply` | 人类采纳/编辑建议，AI 应用修改 |
| `POST` | `/api/regenerate` | 人类拒绝建议，AI 重新生成 |

## 🧠 模型

使用 **deepseek-v4-flash**，通过 DeepSeek 的 OpenAI 兼容 API（`https://api.deepseek.com/v1`）。

## 📚 深度文档

完整的技术文档在 `docs/` 目录下：

- **[01-OVERVIEW.md](docs/01-OVERVIEW.md)** - 项目概览和快速入门
- **[02-PROMPT-DESIGN.md](docs/02-PROMPT-DESIGN.md)** - 提示词设计策略（三个 API 的 prompt 详解）
- **[03-FRONTEND.md](docs/03-FRONTEND.md)** - React 前端实现（状态管理、交互逻辑）
- **[04-BACKEND.md](docs/04-BACKEND.md)** - FastAPI 后端实现（三个端点详解）
- **[05-DESIGN-DECISIONS.md](docs/05-DESIGN-DECISIONS.md)** - 关键设计决策（为什么这样做）
