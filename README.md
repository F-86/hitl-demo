# Human-in-the-Loop 演示：AI 写作助手

一个全栈 Demo，展示 **Human-in-the-Loop（HITL）** 人机协作模式。

**前端:** React (Vite) + pnpm  
**后端:** Python (FastAPI) + uv  
**AI 模型:** DeepSeek V4 Flash  

---

## 🎯 什么是 Human-in-the-Loop？

HITL 是一种人机协作的设计模式：

1. **AI 提出** 修改建议
2. **人类审核、编辑、采纳或拒绝**
3. **AI 根据反馈** 执行修改
4. **循环继续**

这个 Demo 实现了一个完整的 AI 写作助手，严格遵循上述流程。

---

## 🔄 交互流程

```
1. 人类撰写文本
        ↓
2. 点击 "Ask AI to Review"
        ↓
3. AI 审阅并给出修改建议
        ↓
4. 人类对每条建议做出决策：
   - Accept（采纳）
   - Edit & Accept（编辑后采纳）
   - New Suggestion（换建议）
   - Skip（跳过）
        ↓
5. 处理完所有建议
        ↓
6. 可再次审阅，进入下一轮
```

---

## 🚀 快速开始

### 前置要求
- Python 3.10+
- Node.js 18+
- DeepSeek API Key（[获取](https://www.deepseek.com/)）

### 1. 配置 API Key

在项目根目录创建 `.env` 文件：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

> `.env` 已加入 `.gitignore`，不会被提交到仓库。

### 2. 运行后端（Python + FastAPI）

```bash
uv run backend/app.py
```

- 服务运行在 `http://localhost:8000`
- 依赖通过 PEP 723 元数据自动解析，`uv run` 无需手动 `pip install`

### 3. 运行前端（React + Vite）

```bash
cd frontend
pnpm install
pnpm dev
```

- 运行在 `http://localhost:3000`
- Vite 配置已代理 `/api/` 请求到后端

### 4. 使用

1. 在编辑器中输入或粘贴文本
2. 点击 **"Ask AI to Review"** —— AI 分析文本并给出修改建议
3. 对每条建议做出决策：
   - **Accept** —— 采纳建议
   - **Edit & Accept** —— 修改后采纳
   - **New Suggestion** —— 换一条建议
   - **Skip** —— 跳过这条
4. 处理完所有建议后，再次点击 **"Ask AI to Review"** 开始新一轮

---

## 📁 项目结构

```
hitl-demo/
├── backend/
│   ├── app.py                 # FastAPI 服务
│   └── requirements.txt       # Python 依赖（备用）
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # 主 React 组件
│   │   ├── App.css            # 样式
│   │   └── main.jsx           # 入口
│   ├── index.html
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── vite.config.js         # Vite 配置
├── docs/
│   ├── INDEX.md               # 文档导航
│   ├── 01-OVERVIEW.md         # 项目概览
│   ├── 02-PROMPT-DESIGN.md    # 提示词设计
│   ├── 03-FRONTEND.md         # 前端实现
│   ├── 04-BACKEND.md          # 后端实现
│   └── 05-DESIGN-DECISIONS.md # 设计决策
├── .env.example               # API Key 示例
├── .gitignore
└── README.md                  # 这个文件
```

---

## 📡 API 接口

| 方法 | 路径 | 说明 | 
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/review` | AI 审阅文本，返回修改建议 |
| `POST` | `/api/apply` | 采纳建议，AI 应用修改 |
| `POST` | `/api/regenerate` | 拒绝建议，AI 重新生成 |

---

## 🔍 深度文档

详细的技术文档在 `docs/` 目录下：

### 📖 文档导航
- **[docs/INDEX.md](docs/INDEX.md)** - 文档索引和阅读路径

### 📚 核心文档
- **[docs/01-OVERVIEW.md](docs/01-OVERVIEW.md)** - 项目概览和架构
  - HITL 流程详解
  - 系统架构图
  - 前后端交互
  
- **[docs/02-PROMPT-DESIGN.md](docs/02-PROMPT-DESIGN.md)** - 提示词设计（AI/ML 工程师必读）
  - 三个 API 端点的 Prompt 策略
  - 温度参数选择（0.3 / 0.1 / 0.7）
  - Prompt 优化建议
  - JSON 格式约束
  
- **[docs/03-FRONTEND.md](docs/03-FRONTEND.md)** - React 前端实现
  - 8 个关键 State 变量详解
  - 进度追踪逻辑
  - 四种建议处理方式
  - 错误处理和边界情况
  
- **[docs/04-BACKEND.md](docs/04-BACKEND.md)** - FastAPI 后端实现
  - PEP 723 依赖声明
  - Pydantic 数据模型
  - 三个核心端点实现
  - 错误处理和性能优化
  
- **[docs/05-DESIGN-DECISIONS.md](docs/05-DESIGN-DECISIONS.md)** - 关键设计决策
  - 5 个核心决策的对比分析
  - 为什么选择这样的架构
  - 替代方案和权衡

---

## 🧠 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 18+ |
| 构建工具 | Vite | 5+ |
| 包管理 | pnpm | 8+ |
| 后端框架 | FastAPI | 0.100+ |
| Python 工具 | uv | 最新 |
| 模型 | DeepSeek V4 Flash | - |

---

## 💡 关键特性

- ✅ **完整的 HITL 流程** - 从审阅到应用的完整循环
- ✅ **AI 驱动的文本修改** - 利用 DeepSeek 进行智能建议
- ✅ **灵活的用户交互** - 接受、编辑、拒绝、跳过等多种选择
- ✅ **进度追踪** - 清晰展示建议处理进度
- ✅ **错误处理** - 网络异常、API 失败等完整覆盖
- ✅ **修改历史** - 支持撤销操作

---

## 🔧 故障排查

### 后端无法启动
```bash
# 检查 Python 版本
python --version

# 清除 uv 缓存
uv cache clean

# 重新运行
uv run backend/app.py
```

### 前端无法连接后端
- 确保后端运行在 `localhost:8000`
- 检查 `frontend/vite.config.js` 中的代理配置
- 查看浏览器控制台的网络错误信息

### API 返回错误
- 检查 `.env` 文件中的 `DEEPSEEK_API_KEY` 是否正确
- 访问 `http://localhost:8000/api/health` 验证后端状态

---

## 📖 学习路径

### 快速了解
1. 阅读本 README（5 min）
2. 运行 Quick Start（10 min）
3. 在 UI 中尝试功能（5 min）

### 深入理解
1. **想理解架构？** → [docs/01-OVERVIEW.md](docs/01-OVERVIEW.md)
2. **想改进 AI？** → [docs/02-PROMPT-DESIGN.md](docs/02-PROMPT-DESIGN.md)
3. **想修改前端？** → [docs/03-FRONTEND.md](docs/03-FRONTEND.md)
4. **想改进后端？** → [docs/04-BACKEND.md](docs/04-BACKEND.md)
5. **想理解设计？** → [docs/05-DESIGN-DECISIONS.md](docs/05-DESIGN-DECISIONS.md)

### 按角色
- **产品经理** → README + 01-OVERVIEW
- **前端工程师** → 01-OVERVIEW + 03-FRONTEND + 05-DESIGN-DECISIONS
- **后端工程师** → 01-OVERVIEW + 04-BACKEND + 02-PROMPT-DESIGN
- **AI/ML 工程师** → 02-PROMPT-DESIGN + 05-DESIGN-DECISIONS + 04-BACKEND

---

## 🤝 贡献

有任何问题或改进建议，欢迎通过 GitHub Issues 反馈。

---

## 📝 许可证

MIT License

