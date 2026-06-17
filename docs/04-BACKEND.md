# HITL 后端实现详解

本文档深入讲解 FastAPI 后端的三个核心端点、数据模型和 AI 集成。

---

## 项目结构

```
backend/
├── app.py              # 所有代码都在这个文件中
│   ├── 依赖声明（PEP 723）
│   ├── CORS 中间件
│   ├── DeepSeek 客户端初始化
│   ├── 数据模型（Pydantic）
│   └── 三个 API 路由
└── requirements.txt    # 可选，用于兼容传统 pip
```

---

## 启动应用

### 方式1：使用 uv（推荐）

```bash
uv run backend/app.py
```

uv 会自动：
1. 读取 `app.py` 顶部的 PEP 723 元数据
2. 解析 dependencies 列表
3. 安装依赖到虚拟环境
4. 运行脚本

**优势**：
- 无需 `pip install` 和 `venv`
- 一行命令完成
- 依赖在代码中直观可见

### 方式2：传统 pip

```bash
pip install -r requirements.txt
python backend/app.py
```

---

## 依赖管理

### PEP 723 元数据

```python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "fastapi==0.115.6",
#     "uvicorn==0.34.0",
#     "openai==1.59.3",
#     "python-dotenv==1.0.1",
# ]
# ///
```

| 包 | 版本 | 用途 |
|-----|------|------|
| `fastapi` | 0.115.6 | Web 框架 |
| `uvicorn` | 0.34.0 | ASGI 服务器 |
| `openai` | 1.59.3 | DeepSeek API 客户端（兼容 OpenAI） |
| `python-dotenv` | 1.0.1 | 环境变量管理 |

### 为什么用 OpenAI SDK？

DeepSeek API 与 OpenAI API 兼容，所以可以直接使用 OpenAI SDK：

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1"  # 改为 DeepSeek 的地址
)
```

**对比**：
```python
# OpenAI
client = OpenAI(api_key="sk-...")  # 自动 base_url

# DeepSeek（兼容 OpenAI）
client = OpenAI(
    api_key="sk-...",
    base_url="https://api.deepseek.com/v1"  # 指定服务商地址
)
```

---

## CORS 中间件

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 允许所有源
    allow_credentials=True,
    allow_methods=["*"],           # 允许所有 HTTP 方法
    allow_headers=["*"],           # 允许所有请求头
)
```

**为什么需要？**

- 前端运行在 `http://localhost:3000`
- 后端运行在 `http://localhost:8000`
- 不同端口 = 跨域请求 → 需要 CORS

**生产环境改进**：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://example.com", "http://localhost:3000"],  # 具体域名
    allow_credentials=True,
    allow_methods=["GET", "POST"],  # 只允许必要的方法
    allow_headers=["Content-Type"],
)
```

---

## 数据模型

### 请求/响应模型

使用 Pydantic 定义数据模型，自动验证和转换：

#### ReviewRequest

```python
class ReviewRequest(BaseModel):
    text: str              # 必填：要审阅的文本
    context: str = ""      # 可选：文本类型说明（如"通用写作"、"代码注释"）
```

**示例**：
```json
{
  "text": "快速的棕色狐狸跳过了懒狗。",
  "context": "通用写作"
}
```

#### Suggestion

```python
class Suggestion(BaseModel):
    id: str              # 该建议的唯一 ID（后端生成）
    type: str            # "grammar", "clarity", "style", "brevity"
    original: str        # 原始文本段落
    suggested: str       # AI 建议的替代文本
    explanation: str     # 为什么推荐这个修改
```

**示例**：
```json
{
  "id": "sug-1",
  "type": "clarity",
  "original": "快速的棕色狐狸",
  "suggested": "敏捷的褐色狐狸",
  "explanation": "使用更常见的词汇"
}
```

#### ReviewResponse

```python
class ReviewResponse(BaseModel):
    suggestions: list[Suggestion]
```

#### ApplyRequest

```python
class ApplyRequest(BaseModel):
    text: str                  # 完整文本
    suggestion_id: str         # 建议 ID
    accepted: bool             # 是否接受
    edited_suggestion: str = ""  # 用户编辑后的版本（可选）
    original: str = ""           # 要替换的原文段
    suggested: str = ""          # 建议的替代文本
```

**注意**：虽然 `suggestion_id` 在当前实现中没用到，但保留了以便扩展。

#### RegenerateRequest

```python
class RegenerateRequest(BaseModel):
    text: str                  # 完整原文
    original_segment: str      # 要改进的段落
    rejected_type: str         # 被拒的建议类型
    rejected_suggestion: str = ""  # 被拒的建议内容
```

---

## 三个核心 API 端点

### 1️⃣ GET /api/health - 健康检查

```python
@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL}
```

**用途**：
- 前端启动时检查后端是否运行
- 返回当前使用的模型名称

**示例响应**：
```json
{
  "status": "ok",
  "model": "deepseek-v4-flash"
}
```

---

### 2️⃣ POST /api/review - 生成初始建议

#### 完整实现

```python
@app.post("/api/review", response_model=ReviewResponse)
def review_text(req: ReviewRequest):
    """
    AI 审阅用户文本并返回最多 3 条建议。
    这是 HITL 循环的第一步：AI 提议 → 人类决策。
    """
    # 1. 验证输入
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    # 2. 构建 context 提示
    context_hint = f"Context: {req.context}. " if req.context else ""
    
    # 3. 构建 prompt
    prompt = f"""You are a helpful writing assistant. Review the following text and suggest up to 3 improvements.
{context_hint}
For each suggestion, identify:
- The exact original text segment to replace
- Your suggested replacement
- The type of improvement: grammar, clarity, style, or brevity
- A brief explanation

Return ONLY valid JSON with no markdown or extra text. Use this exact format:
{{"suggestions": [
  {{"type": "grammar", "original": "exact text", "suggested": "replacement", "explanation": "reason"}}
]}}

Text to review:
{req.text}"""
    
    try:
        # 4. 调用 AI
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        
        # 5. 提取响应
        import json
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise HTTPException(
                status_code=500, 
                detail="AI returned empty response"
            )
        
        # 6. 解析 JSON
        result = json.loads(content)
        
        # 7. 为建议分配 ID
        suggestions = result.get("suggestions", [])
        for i, s in enumerate(suggestions):
            s["id"] = f"sug-{i+1}"
        
        # 8. 返回（最多 3 条）
        return ReviewResponse(suggestions=suggestions[:3])
    
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500, 
            detail=f"AI returned invalid JSON: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"AI review failed: {str(e)}"
        )
```

#### 错误处理

| 错误 | 状态码 | 处理 |
|------|--------|------|
| 空文本 | 400 | 客户端验证失败 |
| 空 AI 响应 | 500 | AI 问题 |
| JSON 解析失败 | 500 | AI 格式问题 |
| 其他异常 | 500 | 通用错误 |

#### 流程图

```
POST /api/review { text, context }
    ↓
验证 text 非空
    ↓
构建 prompt（包含 context）
    ↓
调用 AI
    ├─→ response.choices[0].message.content
    └─→ JSON 解析
    ↓
为建议分配 ID（sug-1, sug-2, ...）
    ↓
返回 ReviewResponse { suggestions: [...] }
    ↓
前端更新：setSuggestions, setTotalSuggestions
```

---

### 3️⃣ POST /api/apply - 应用修改

#### 完整实现

```python
@app.post("/api/apply", response_model=ApplyResponse)
def apply_suggestion(req: ApplyRequest):
    """
    人类接受（或编辑后接受）一个建议。
    AI 应用修改并返回更新后的文本。
    这是 HITL 的第 2 步：人类决策 → AI 执行。
    """
    # 1. 验证输入
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    # 2. 根据是否接受决定操作
    if req.accepted and req.edited_suggestion:
        # 用户编辑了建议后接受
        replacement = req.edited_suggestion
        original_segment = req.original
        instruction = f"""Replace this exact text segment:
"{original_segment}"

With this edited version:
"{replacement}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    
    elif req.accepted:
        # 用户直接接受原始建议
        original_segment = req.original
        replacement = req.suggested
        instruction = f"""Replace this exact text segment:
"{original_segment}"

With this replacement:
"{replacement}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    
    else:
        # 建议被拒绝，不做修改
        return ApplyResponse(new_text=req.text)
    
    # 3. 构建完整 prompt
    prompt = f"""Apply the text replacement below.
{instruction}

Original text:
\"\"\"
{req.text}
\"\"\""""
    
    try:
        # 4. 调用 AI
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,  # 超低：必须精确
            max_tokens=2000,  # 完整文本可能较长
            response_format={"type": "json_object"},
        )
        
        # 5. 解析结果
        import json
        result = json.loads(response.choices[0].message.content)
        return ApplyResponse(new_text=result.get("new_text", req.text))
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply failed: {str(e)}")
```

#### 为什么需要三种情况？

```python
if req.accepted and req.edited_suggestion:
    # 情况1：✏️ 编辑后接受
    # 用户改了建议后再应用
    # 如："敏捷的" → "机敏的"
    
elif req.accepted:
    # 情况2：✅ 直接接受
    # 用户接受 AI 原始建议
    
else:
    # 情况3：❌ 拒绝
    # 返回原文不变
    # （虽然前端不会调用，但逻辑完整）
```

#### 流程图

```
POST /api/apply
    ↓
accepted = true 且 editedText 存在？
├─→ Yes: 用 editedText 替换
└─→ No: 用 suggested 替换
    ↓
构建 prompt
    ├─→ "Replace X with Y"
    ├─→ "Original text: [完整文本]"
    └─→ "Return JSON: {new_text: ...}"
    ↓
调用 AI（temperature=0.1 超低温度）
    ↓
解析 JSON
    ↓
返回 ApplyResponse { new_text }
    ↓
前端更新：setText(new_text)
```

---

### 4️⃣ POST /api/regenerate - 生成新建议

#### 完整实现

```python
@app.post("/api/regenerate", response_model=RegenerateResponse)
def regenerate_suggestion(req: RegenerateRequest):
    """
    人类拒绝一个建议并想要不同的建议。
    AI 为特定文本段落生成新的、不同的建议。
    这是 HITL 的第 2b 步：人类拒绝 → AI 重新提议。
    """
    # 1. 验证输入
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if not req.original_segment.strip():
        raise HTTPException(
            status_code=400, 
            detail="Original segment cannot be empty"
        )
    
    # 2. 计算其他可选的改进类型
    other_types = [t for t in ["grammar", "clarity", "style", "brevity"] 
                   if t != req.rejected_type]
    
    # 3. 构建 prompt（明确要求不同的建议）
    prompt = f"""You are a writing assistant. The user rejected a suggestion and wants a different improvement.

Context: Here is the full text:
{req.text}

The specific segment being reviewed: "{req.original_segment}"

The rejected suggestion (type: {req.rejected_type}): "{req.rejected_suggestion}"

Please provide a DIFFERENT improvement suggestion for this segment. Focus on a different aspect from {req.rejected_type}.
Consider these alternatives: {', '.join(other_types)}

Return ONLY valid JSON with no markdown or extra text:
{{"suggestion": {{"type": "grammar|clarity|style|brevity", "original": "{req.original_segment}", "suggested": "replacement text", "explanation": "why this improves the text"}}}}"""
    
    try:
        # 4. 调用 AI
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,  # 更高创意度
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        
        # 5. 提取和验证响应
        import json
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise HTTPException(
                status_code=500, 
                detail="Model returned empty response. Try again or modify your text."
            )
        
        # 6. 解析 JSON
        result = json.loads(content)
        suggestion = result.get("suggestion", {})
        
        # 7. 分配新 ID
        suggestion["id"] = f"sug-new"
        
        # 8. 返回建议（使用 Pydantic 验证）
        return RegenerateResponse(suggestion=Suggestion(**suggestion))
    
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to parse model response: {str(e)}"
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"Regenerate failed: {str(e)}")
```

#### 防止重复生成的策略

```python
# 1️⃣ 明确排除被拒类型
other_types = [t for t in ["grammar", "clarity", "style", "brevity"] 
               if t != req.rejected_type]

# 2️⃣ 在 prompt 中列出替代选项
"Consider these alternatives: {', '.join(other_types)}"

# 3️⃣ 明确要求不同
"Please provide a DIFFERENT improvement suggestion"

# 4️⃣ 提高温度促进多样性
temperature=0.7
```

#### 流程图

```
POST /api/regenerate
    ↓
确定要排除的类型（rejected_type）
    ↓
计算替代类型列表
    ↓
构建 prompt
    ├─→ 包含被拒建议
    ├─→ 包含替代类型列表
    └─→ "请提供不同的改进"
    ↓
调用 AI（temperature=0.7 提高创意度）
    ↓
解析 JSON
    ↓
分配新 ID "sug-new"
    ↓
返回 RegenerateResponse { suggestion }
    ↓
前端替换原建议，不改变进度
```

---

## 关键设计细节

### 1. JSON 响应格式

所有端点都强制 JSON 输出：

```python
response_format={"type": "json_object"}
```

**作用**：
- 保证 AI 输出总是有效 JSON
- 不会包含额外的 markdown 或解释
- 客户端可以直接 `json.loads()`

### 2. 文本替换的精确性

**问题**：如何确保替换了正确的文本段？

**方案**：发送完整文本 + 指示 AI 替换

```python
prompt = f"""Replace this exact text segment:
"{req.original}"

With this replacement:
"{req.suggested}"

Original text:
\"\"\"{req.text}\"\"\""""
```

**优势**：
- AI 能看到上下文，避免歧义
- 如果 original 多次出现，AI 能理解要替换哪个
- 结果可靠性高

### 3. 异常处理的层次

```python
try:
    response = client.chat.completions.create(...)  # AI 调用
    content = response.choices[0].message.content     # 提取内容
    result = json.loads(content)                      # 解析 JSON
    # 业务逻辑
    return Response(...)
except json.JSONDecodeError as e:
    # JSON 解析失败
    raise HTTPException(status_code=500, detail=f"Invalid JSON: {str(e)}")
except Exception as e:
    # 其他异常
    raise HTTPException(status_code=500, detail=f"Operation failed: {str(e)}")
```

**处理流程**：
1. 特定错误（JSON、HTTP）特别处理
2. 通用异常统一处理
3. HTTPException 可能重复抛出，需要检查

### 4. 为什么保留 suggestion_id？

```python
class ApplyRequest(BaseModel):
    suggestion_id: str  # 当前未使用
    # ...
```

**当前**：前端不需要它，后端也不使用

**未来可能的用途**：
- 统计哪些建议被接受率最高
- AB 测试不同 prompt 的效果
- 用户反馈收集："这个建议为什么不好？"

---

## 性能考虑

### 1. Token 限制

```python
# /api/review：1000 tokens 足够 3 条建议
max_tokens=1000

# /api/apply：2000 tokens，因为要返回完整文本
max_tokens=2000

# /api/regenerate：1000 tokens
max_tokens=1000
```

### 2. 温度选择的成本影响

```python
temperature=0.3   # /review：快速收敛，少返工
temperature=0.1   # /apply：字符精确，无需返工
temperature=0.7   # /regenerate：可能需要多次尝试
```

### 3. 避免不必要的 AI 调用

前端已处理：
- `loading` 状态防止重复点击
- 验证文本非空

---

## 扩展思路

### 1. 支持多个 AI 引擎

```python
# 在环境变量中配置
AI_ENGINE = os.getenv("AI_ENGINE", "deepseek")  # or "openai", "claude"

if AI_ENGINE == "deepseek":
    client = OpenAI(api_key=..., base_url="https://api.deepseek.com/v1")
elif AI_ENGINE == "openai":
    client = OpenAI(api_key=...)
```

### 2. 添加请求日志

```python
import logging
logger = logging.getLogger(__name__)

@app.post("/api/review")
def review_text(req: ReviewRequest):
    logger.info(f"Review request: text_len={len(req.text)}, context={req.context}")
    # ...
    logger.info(f"Generated {len(suggestions)} suggestions")
```

### 3. 缓存 AI 响应

```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_suggestions(text_hash: str) -> list:
    # 对相同文本的请求返回缓存结果
    pass
```

### 4. 添加费用追踪

```python
def track_usage(response):
    tokens = response.usage.total_tokens
    cost = tokens * COST_PER_TOKEN
    logger.info(f"Used {tokens} tokens, cost: ${cost}")
```

---

## 总结

| 端点 | 方法 | 目的 | 关键参数 |
|------|------|------|---------|
| `/api/health` | GET | 健康检查 | 无 |
| `/api/review` | POST | 生成建议 | text, context |
| `/api/apply` | POST | 应用修改 | text, original, suggested |
| `/api/regenerate` | POST | 新建议 | text, original_segment, rejected_type |

| 端点 | 温度 | 最大 tokens | JSON 强制 |
|------|------|-----------|----------|
| review | 0.3 | 1000 | ✓ |
| apply | 0.1 | 2000 | ✓ |
| regenerate | 0.7 | 1000 | ✓ |

**三个核心原则**：
1. ✅ 发送完整文本保留上下文
2. ✅ 强制 JSON 格式确保可靠性
3. ✅ 合适的温度平衡质量和创意
