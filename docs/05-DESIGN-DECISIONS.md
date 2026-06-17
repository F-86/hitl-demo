# HITL 关键设计决策

本文档解释项目中的 5 个核心设计决策，为什么这样做，以及备选方案分析。

---

## 决策 1️⃣：为什么分离 totalSuggestions 和 completedSuggestions？

### 决策

使用两个独立的状态变量：
- `totalSuggestions`：初始化后不变
- `completedSuggestions`：随着用户操作递增

而**不是**用 `suggestions.length` 计算进度。

### 对比方案

#### ❌ 方案 A：使用 suggestions.length（错误）

```javascript
const progress = `第 ${currentIndex + 1} / ${suggestions.length}`

// 初始：3 条建议
suggestions = [sug1, sug2, sug3]
显示"第 1 / 3"

// 用户接受第 1 条
suggestions = [sug2, sug3]
现在显示"第 1 / 2"  ← 问题！进度反而减少了
```

**问题**：
- 进度表现反向：应该增加，反而减少
- 用户困惑：为什么总数从 3 变成 2？
- 动态数组的副作用

#### ❌ 方案 B：用数组长度分子分母（错误）

```javascript
const initialLength = suggestions.length
const processed = initialLength - suggestions.length
const progress = `已完成 ${processed} / ${initialLength}`
```

**问题**：
- `initialLength` 需要在组件初始化时捕获
- 如果用户刷新或重新点击"审阅"，逻辑混乱
- 状态管理复杂

#### ✅ 方案 C：分离总数和完成数（正确）

```javascript
const [totalSuggestions, setTotalSuggestions] = useState(0)
const [completedSuggestions, setCompletedSuggestions] = useState(0)

// 初始化（/api/review 返回）
setTotalSuggestions(3)
setCompletedSuggestions(0)

// 处理每条建议
if (accept || skip) {
  setCompletedSuggestions(prev => prev + 1)
}

// 显示
const progress = `已完成 ${completedSuggestions} / ${totalSuggestions}`
```

**优势**：
- ✅ 进度单调递增
- ✅ 清晰的语义
- ✅ 不受 suggestions 数组变化影响
- ✅ 支持拒绝不增加计数

### 为什么拒绝建议时不增加 completedSuggestions？

```javascript
// 拒绝 → 生成新建议
handleReject: 只替换建议，不修改 completedSuggestions

// 接受或跳过 → 该条完成
handleAccept / handleSkip: completedSuggestions += 1
```

**原因**：
- 拒绝 ≠ 完成，用户还在审视
- 鼓励用户找到满意的建议
- 进度表现与用户意图一致

---

## 决策 2️⃣：为什么由后端 AI 执行文本替换？

### 决策

在 `/api/apply` 端点中，由 AI 执行文本替换，而**不是**在前端用 JavaScript 做替换。

### 对比方案

#### ❌ 方案 A：前端替换（错误）

```javascript
// 前端代码
const newText = text.replace(suggestion.original, suggestion.suggested)

// 问题 1：多次出现
const text = "这是好的。这是好的。"
const newText = text.replace("这是好的", "这是完美的")
// 结果："这是完美的。这是完美的。"  ← 两个都被替换了！

// 问题 2：正则特殊字符
const text = "价格: $100"
const newText = text.replace("$100", "$200")
// 失败，因为 $ 是正则特殊字符

// 问题 3：编码问题
const text = "café"  // 重音符
const newText = text.replace("café", "cafe")
// 可能因为 Unicode 编码问题失败
```

**问题总结**：
- 多次出现同一段落时替换错误
- 特殊字符导致失败
- 编码问题
- 没有上下文理解

#### ✅ 方案 B：后端 AI 替换（正确）

```python
prompt = f"""Replace this exact text segment:
"{req.original}"

With this replacement:
"{req.suggested}"

Original text:
\"\"\"{req.text}\"\"\""""
```

**优势**：
- ✅ AI 理解上下文，知道要替换哪一个
- ✅ 处理特殊字符和编码
- ✅ 支持复杂替换（不仅是简单字符串）
- ✅ 所有修改都通过 AI 验证，保持信任
- ✅ 便于审计和追踪

### 实际例子

```
场景：文本中有重复的段落
原文：
"我认为这个方案很好。
但是我也认为这个方案需要改进。"

建议1：把第一个"这个方案很好"改为"这个方案不错"
建议2：把第二个"这个方案需要改进"改为"这个方案有待改进"

❌ 前端 replace：
text.replace("这个方案很好", "这个方案不错")
→ "我认为这个方案不错。..."  ✓ 第一个正确
text.replace("这个方案需要改进", "这个方案有待改进")
→ "...这个方案有待改进。"  ✓ 第二个也正确

但如果两个操作连续进行，状态管理会混乱

✅ 后端 AI：
POST /api/apply {
  text: "我认为这个方案很好。但是我也认为这个方案需要改进。",
  original: "这个方案很好",
  suggested: "这个方案不错"
}
→ AI 理解上下文，精确替换
→ 返回："我认为这个方案不错。但是我也认为这个方案需要改进。"
```

---

## 决策 3️⃣：为什么发送完整文本到 AI？

### 决策

在 `/api/apply` 和 `/api/regenerate` 中，发送**完整的原文本**，而不仅是要改进的片段。

### 对比方案

#### ❌ 方案 A：只发送片段（错误）

```python
# 请求
POST /api/regenerate {
  "original_segment": "这个方案需要改进",
  "rejected_type": "clarity",
  "rejected_suggestion": "这个方案需要得到改进"
}

# AI 生成的新建议
"这个计划有待完善"  ← 好的，但可能没考虑上下文

# 前面的文本是什么？后面会怎样？
# AI 不知道
```

**问题**：
- 建议可能与前后文不协调
- 没有语境，生成的建议可能不自然
- 无法理解整个文本的风格

#### ✅ 方案 B：发送完整文本（正确）

```python
# 请求
POST /api/regenerate {
  "text": "这是一个句子。这个方案需要改进。还有更多内容。",
  "original_segment": "这个方案需要改进",
  "rejected_type": "clarity",
  "rejected_suggestion": "这个方案需要得到改进"
}

# AI 理解全文，生成更好的建议
"这个方案亟需完善"  ← 考虑了前后句子的风格
```

**优势**：
- ✅ AI 理解整体文本风格
- ✅ 建议与前后文协调
- ✅ 语言表达更自然
- ✅ 避免冗余或矛盾

### 真实对比

假设原文：
```
"我们需要采取行动。
这个方案需要改进。
问题会在一周内解决。"
```

**场景**：用户拒绝了"clarity"类型的建议"这个方案需要得到改进"

❌ **不发送完整文本**：
```
AI 收到：只有"这个方案需要改进"
AI 可能建议："该计划有待完善"（较为正式）

但前后文都很简洁、直接
新建议显得突兀
```

✅ **发送完整文本**：
```
AI 收到：完整文本 + 要改进的片段
AI 理解了整体的直接、简洁风格
AI 建议："这个方案需要优化"（简洁、直接）

与前后文风格一致 ✓
```

---

## 决策 4️⃣：为什么用三个不同的温度值？

### 决策

| 端点 | 温度 |
|------|------|
| /api/review | 0.3 |
| /api/apply | 0.1 |
| /api/regenerate | 0.7 |

### 温度的含义

```
Temperature 范围：0 - 2

0     → 完全确定性，重复性强
0.5   → 平衡创意和一致性
1.0   → 默认，中等随机性
1.5   → 更创意
2.0   → 最大随机性（常常不连贯）
```

### 为什么这个选择？

#### /api/review (0.3)

```python
temperature=0.3  # 相对低温，但不过度
```

**原因**：
- 目标：生成**高质量、一致**的建议
- 3 条建议应该都有良好的实用性
- 不需要过度创意，用户只要相对稳定的建议
- 用户拒绝的概率应该较低

**对比**：
```
temperature=0.1：太冷，建议可能过于保守
温度过低可能导致：
- 重复相同类型的建议
- 不够多样化

temperature=0.3：适中
- 建议质量稳定
- 有一定多样性
- 用户满意度较高
```

#### /api/apply (0.1)

```python
temperature=0.1  # 超低温度，几乎确定性
```

**原因**：
- 目标：**精确执行**文本替换
- 不需要创意，只需要可靠性
- 必须返回正确的修改后文本
- 任何创意都是浪费或错误

**对比**：
```
temperature=0.5 或更高：
- "替换这个文本"可能被创意理解
- AI 可能改变句子的其他部分
- 导致修改不符预期

temperature=0.1：
- AI 只会执行精确指令
- 最小化不必要的修改
```

#### /api/regenerate (0.7)

```python
temperature=0.7  # 更高温度，促进多样性
```

**原因**：
- 目标：生成**不同的**建议
- 用户已经拒绝了一个建议
- 新建议应该走不同的方向
- 需要创意来提供替代方案

**对比**：
```
temperature=0.3（与 review 相同）：
- 生成相似类型的建议
- 可能再次生成"clarity"类型的修改
- 用户再次拒绝的风险高

temperature=0.7：
- 更多样化的想法
- 更可能考虑不同的改进角度
- 用户满意度提升

temperature过高（1.5+）：
- 建议可能不连贯
- 可能修改错了地方
- 过度创意导致误解
```

### 温度对输出的实际影响

假设提示词："为'快速的'提供替代词"

```
temperature=0.1：
  几乎总是："敏捷的"
  
temperature=0.3：
  可能："敏捷的"、"迅速的"
  
temperature=0.7：
  可能："敏捷的"、"迅速的"、"机敏的"、"灵活的"
  
temperature=1.5：
  可能："敏捷的"、"金色的"、"柠檬水"
  ← 开始胡言乱语
```

---

## 决策 5️⃣：为什么用 Pydantic 数据模型？

### 决策

使用 Pydantic 定义请求/响应模型：

```python
class ReviewRequest(BaseModel):
    text: str
    context: str = ""

class Suggestion(BaseModel):
    id: str
    type: str
    original: str
    suggested: str
    explanation: str
```

### 对比方案

#### ❌ 方案 A：不用模型，直接处理字典（错误）

```python
@app.post("/api/review")
def review_text(body: dict):
    text = body.get("text")  # 可能 None
    context = body.get("context", "")
    
    if text is None:
        return {"error": "text required"}
    # 手动验证每个字段...
```

**问题**：
- 无类型检查
- 需要手动验证每个字段
- 错误信息不清楚
- 文档需要手写
- 前端无法自动生成类型定义

#### ❌ 方案 B：用 typing.Dict，手动验证（错误）

```python
from typing import Dict

@app.post("/api/review")
def review_text(body: Dict[str, str]):
    # 仍然需要手动验证
    if "text" not in body:
        raise Exception("Missing text")
    # ...
```

**问题**：
- 仍然需要手动验证
- 类型信息丢失
- FastAPI 无法生成 OpenAPI 文档

#### ✅ 方案 C：用 Pydantic 模型（正确）

```python
class ReviewRequest(BaseModel):
    text: str              # 必填，字符串
    context: str = ""      # 可选，默认空字符串

@app.post("/api/review", response_model=ReviewResponse)
def review_text(req: ReviewRequest):
    # FastAPI 自动：
    # 1. 验证 req.text 非空
    # 2. 验证类型
    # 3. 转换数据
    # 4. 生成 OpenAPI 文档
```

**优势**：
- ✅ 自动验证数据类型和必填字段
- ✅ 清晰的错误信息
- ✅ 自动生成 API 文档（OpenAPI/Swagger）
- ✅ IDE 自动补全（`req.text` 等）
- ✅ 前端可以从 OpenAPI 生成类型定义

### 实际好处

**用户发送错误数据**：

```json
// 用户发送了错误的类型
POST /api/review
{
  "text": 123,           // 应该是字符串
  "context": null
}

❌ 无模型：
需要写 if body.get("text") and isinstance(body["text"], str)
错误处理混乱

✅ Pydantic：
自动返回：
{
  "detail": [
    {
      "loc": ["body", "text"],
      "msg": "str type expected",
      "type": "type_error.string"
    }
  ]
}
```

**生成 API 文档**：

Pydantic 模型自动生成 OpenAPI 文档（Swagger UI），访问 `http://localhost:8000/docs`：

```yaml
ReviewRequest:
  required: [text]
  properties:
    text:
      type: string
      description: "要审阅的文本"
    context:
      type: string
      default: ""
      description: "文本类型说明"
```

---

## 其他设计选择

### A. 为什么建议最多 3 条？

```python
return ReviewResponse(suggestions=suggestions[:3])
```

**为什么 3？**：
- 不太少（1-2 条太少）
- 不太多（5+ 条压倒用户）
- 3 是心理学上的"黄金数字"
- 用户一轮处理 3 条用时适中（1-2 分钟）

**如何改**：
```python
# 配置化
MAX_SUGGESTIONS = int(os.getenv("MAX_SUGGESTIONS", "3"))
return ReviewResponse(suggestions=suggestions[:MAX_SUGGESTIONS])
```

### B. 为什么用 OpenAI SDK 而不是 requests？

```python
# ✅ 使用 OpenAI SDK
from openai import OpenAI
client = OpenAI(
    api_key=key,
    base_url="https://api.deepseek.com/v1"
)
response = client.chat.completions.create(...)

# ❌ 手写 requests
import requests
requests.post(
    "https://api.deepseek.com/v1/chat/completions",
    json={...},
    headers={...}
)
```

**优势**：
- 官方维护，更可靠
- 错误处理完善
- 类型提示
- 支持流式输出

### C. 为什么用 response_format=json_object？

```python
response_format={"type": "json_object"}
```

**作用**：
- DeepSeek/OpenAI 保证输出总是有效 JSON
- 不会混入 markdown 或解释文字
- 减少 JSON 解析失败

**对比**：
```python
# 不指定格式，AI 可能返回：
"""
这是我的建议：
```json
{...}
```
还有额外解释
"""

# 指定 json_object，AI 只返回：
{...}  # 纯 JSON
```

---

## 总结表

| 决策 | 选项 | 原因 | 替代方案 |
|------|------|------|--------|
| 进度追踪 | totalSuggestions + completedSuggestions | 单调递增，清晰 | suggestions.length（错误） |
| 文本替换 | 后端 AI | 精确可靠 | 前端 JS（脆弱） |
| 发送内容 | 完整文本 | 上下文感知 | 只发片段（效果差） |
| /review 温度 | 0.3 | 质量与多样性平衡 | 0.1（过度保守） |
| /apply 温度 | 0.1 | 精确执行 | 0.5+（有偏差） |
| /regenerate 温度 | 0.7 | 促进多样性 | 0.3（容易重复） |
| 数据验证 | Pydantic 模型 | 自动验证+文档 | 手动字典验证 |

---

## 哲学原则

### 1. 🎯 让 AI 做擅长的事

- AI 擅长：理解语意、生成多样化方案、判断上下文
- AI 不擅长：精确字符替换、边界情况处理

**所以**：后端 AI 负责替换，前端不碰文本

### 2. 📈 用户体验的进度反馈

- 进度必须单调递增
- 不能让总数变小
- 用户信心不能减少

**所以**：分离 total 和 completed

### 3. 🔄 完整的语境传递

- 不要丢弃信息
- 让 AI 理解全局
- 减少歧义

**所以**：发送完整文本

### 4. 🎛️ 温度是控制杆

- 不同任务有不同需求
- 温度直接影响输出质量和多样性
- 精细调节温度获得最佳结果

**所以**：review/apply/regenerate 用不同温度

### 5. 🛡️ 自动验证，减少人工

- Pydantic 自动验证
- FastAPI 自动生成文档
- 减少手动处理

**所以**：用类型系统，不写验证代码
