# HITL（人类反馈循环）实现文档

## 目录
1. [HITL 流程概述](#hitl-流程概述)
2. [架构设计](#架构设计)
3. [前端实现](#前端实现)
4. [后端实现](#后端实现)
5. [状态管理](#状态管理)
6. [数据流](#数据流)
7. [关键设计决策](#关键设计决策)

---

## HITL 流程概述

HITL（Human-in-the-Loop）是一种人机协作的工作流程：

```
┌─────────────────────────────────────────────────┐
│                   HITL 循环周期                   │
└─────────────────────────────────────────────────┘

1️⃣  人类撰写文本
    └─→ 输入或粘贴文本到编辑器

2️⃣  AI 审阅文本
    └─→ 调用 /api/review，AI 返回 2-3 条改进建议

3️⃣  人类审核建议（4 种操作）
    ├─→ ✅ 接受：直接采纳 AI 建议
    ├─→ ✏️  编辑：修改后再采纳
    ├─→ 🔄 新建议：拒绝，AI 重新生成
    └─→ ⏭️  跳过：不处理这条建议

4️⃣  AI 应用修改
    └─→ 调用 /api/apply，返回更新后的文本

5️⃣  继续循环
    └─→ 重复 3-4 步，直到处理完所有建议

6️⃣  新一轮审阅
    └─→ 点击"请求 AI 审阅"重新开始
```

### 核心特点

- **人类主导**：所有修改决策由人类做出，AI 只提议
- **灵活反馈**：接受、编辑、拒绝、跳过四种方式
- **迭代改进**：不满意的建议可要求 AI 重新生成
- **透明进度**：实时显示"已完成 X / Y"的处理进度
- **完整记录**：保留修改历史，展示每条应用的建议

---

## 架构设计

### 系统组成

```
┌──────────────────────────────────────────────────┐
│                  用户浏览器                        │
│  ┌────────────────────────────────────────────┐  │
│  │         React 前端 (Vite)                  │  │
│  │  • App.jsx - 主逻辑                       │  │
│  │  • SuggestionCard - 建议卡片组件           │  │
│  │  • 状态：suggestions, currentIndex 等      │  │
│  └────────────────────────────────────────────┘  │
└────────────┬─────────────────────────────────────┘
             │ HTTP REST API
             │
┌────────────▼─────────────────────────────────────┐
│         FastAPI 后端 (Python)                     │
│  ┌────────────────────────────────────────────┐  │
│  │       /api/review (POST)                   │  │
│  │  输入：{ text, context }                    │  │
│  │  输出：{ suggestions: [...] }              │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │       /api/apply (POST)                    │  │
│  │  输入：{ text, original, suggested, ... }  │  │
│  │  输出：{ new_text }                        │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │    /api/regenerate (POST)                  │  │
│  │  输入：{ text, original_segment, ... }    │  │
│  │  输出：{ suggestion }                      │  │
│  └────────────────────────────────────────────┘  │
└────────────┬─────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────┐
│         DeepSeek API                              │
│  • 文本审阅（生成建议）                            │
│  • 文本替换（应用修改）                            │
│  • 建议重生（新建议生成）                          │
└───────────────────────────────────────────────────┘
```

---

## 前端实现

### 核心状态管理

**App.jsx** 中的关键 state：

```javascript
// 主文本和建议
const [text, setText] = useState(initialText)              // 当前文本
const [suggestions, setSuggestions] = useState([])         // 建议列表
const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0)

// HITL 进度追踪
const [totalSuggestions, setTotalSuggestions] = useState(0)          // 总建议数（不变）
const [completedSuggestions, setCompletedSuggestions] = useState(0)  // 已完成数（递增）

// 生命周期
const [status, setStatus] = useState('idle')  // idle | reviewing | waiting | done
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')
const [feedback, setFeedback] = useState('')

// 历史记录
const [history, setHistory] = useState([])  // { action, original, result, explanation }
```

### 进度追踪逻辑

**关键设计**：`totalSuggestions` 和 `completedSuggestions` 分离

```
初始化时：
  totalSuggestions = 3（AI 返回的建议总数）
  completedSuggestions = 0

每次用户操作（接受、编辑、跳过）：
  completedSuggestions += 1

显示：
  "已完成 {completedSuggestions} / {totalSuggestions}"
  
示例进度变化：
  已完成 0 / 3
  已完成 1 / 3  （接受第一条）
  已完成 2 / 3  （编辑并接受第二条）
  已完成 3 / 3  （跳过第三条）
```

### 四种建议处理方式

#### 1️⃣ 接受（handleAccept）

```javascript
const handleAccept = async (suggestion, editedText) => {
  // 发送到后端
  const res = await fetch('/api/apply', {
    method: 'POST',
    body: JSON.stringify({
      text,                              // 当前全文
      suggestion_id: suggestion.id,      // 建议ID
      accepted: true,                    
      edited_suggestion: editedText,     // 如果用户编辑过
      original: suggestion.original,     // 原文段
      suggested: suggestion.suggested,   // 建议文本
    }),
  })
  
  // 后端返回新文本
  const data = await res.json()
  
  // 更新状态
  setText(data.new_text)                           // 更新文本
  setSuggestions(prev => 
    prev.filter(s => s.id !== suggestion.id)      // 移除已处理的建议
  )
  setCompletedSuggestions(prev => prev + 1)       // 增加完成计数
  
  // 记录修改历史
  setHistory(prev => [...prev, {
    action: editedText ? '已编辑' : '已接受',
    original: suggestion.original,
    result: editedText || suggestion.suggested,
    explanation: suggestion.explanation,
  }])
}
```

#### 2️⃣ 拒绝并重新生成（handleReject）

```javascript
const handleReject = async (suggestion) => {
  // 发送到后端
  const res = await fetch('/api/regenerate', {
    method: 'POST',
    body: JSON.stringify({
      text,                          // 完整原文（保留上下文）
      original_segment: suggestion.original,  // 要改进的段落
      rejected_type: suggestion.type,         // 被拒的类型
      rejected_suggestion: suggestion.suggested,  // 被拒的内容
    }),
  })
  
  // 后端返回新建议
  const data = await res.json()
  
  // 替换建议（不移除，不增加完成数）
  setSuggestions(prev =>
    prev.map(s => 
      s.id === suggestion.id 
        ? { ...data.suggestion, id: suggestion.id }
        : s
    )
  )
}
```

#### 3️⃣ 跳过（handleSkip）

```javascript
const handleSkip = (suggestion) => {
  // 移除建议
  setSuggestions(prev => 
    prev.filter(s => s.id !== suggestion.id)
  )
  
  // 增加完成数（即使没有采纳）
  setCompletedSuggestions(prev => prev + 1)
  
  setFeedback(`⏭️ 已跳过关于 ${suggestion.type} 的建议。`)
}
```

#### 4️⃣ 编辑（在 SuggestionCard 中）

```javascript
// 在卡片中切换编辑模式
const [editing, setEditing] = useState(false)
const [editedValue, setEditedValue] = useState(suggestion.suggested)

// 用户修改文本后调用 onAccept
onClick={() => { 
  onAccept(suggestion, editedValue)  // 传递修改后的文本
  setEditing(false)
}}
```

### 轮换显示（Carousel）

建议采用**单条显示**方式，用户一次处理一条建议：

```javascript
// 显示当前建议
{suggestions.length > 0 && (
  <SuggestionCard
    suggestion={suggestions[currentSuggestionIndex]}  // 当前建议
    onAccept={handleAccept}
    onReject={handleReject}
    onSkip={handleSkip}
    totalSuggestions={totalSuggestions}
    completedSuggestions={completedSuggestions}
  />
)}
```

---

## 后端实现

### 三个核心 API 端点

#### 1️⃣ POST /api/review

**目的**：AI 审阅文本，返回改进建议

**请求**：
```json
{
  "text": "快速的棕色狐狸跳过了懒狗。",
  "context": "通用写作"
}
```

**响应**：
```json
{
  "suggestions": [
    {
      "id": "sug-1",
      "type": "clarity",
      "original": "快速的棕色狐狸跳过了懒狗",
      "suggested": "敏捷的褐色狐狸跳过了懒狗",
      "explanation": "使用更常见的词汇表达"
    },
    {
      "id": "sug-2",
      "type": "grammar",
      "original": "跳过了",
      "suggested": "越过了",
      "explanation": "动词选择更恰当"
    }
  ]
}
```

**实现细节**：

```python
@app.post("/api/review", response_model=ReviewResponse)
def review_text(req: ReviewRequest):
    # 构建 prompt：告诉 AI 要分析文本并返回 2-3 条建议
    prompt = f"""You are a helpful writing assistant. Review the following text...
    Return ONLY valid JSON with no markdown or extra text."""
    
    # 调用 DeepSeek API
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,  # 相对保守，确保质量
        max_tokens=1000,
        response_format={"type": "json_object"},  # 强制 JSON 输出
    )
    
    # 解析并返回
    result = json.loads(response.choices[0].message.content)
    
    # 为每条建议分配唯一 ID
    for i, s in enumerate(result.get("suggestions", [])):
        s["id"] = f"sug-{i+1}"
    
    return ReviewResponse(suggestions=result[:3])  # 最多 3 条
```

#### 2️⃣ POST /api/apply

**目的**：应用人类的决策，返回修改后的文本

**请求**（接受建议）：
```json
{
  "text": "原始全文...",
  "original": "要替换的原文段",
  "suggested": "替代文本"
}
```

**响应**：
```json
{
  "new_text": "修改后的全文..."
}
```

**实现细节**：

```python
@app.post("/api/apply", response_model=ApplyResponse)
def apply_suggestion(req: ApplyRequest):
    if req.accepted:
        # 构建 prompt，让 AI 做精确的文本替换
        instruction = f"""Replace this exact text segment:
"{req.original}"

With this replacement:
"{req.suggested}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
        
        prompt = f"""Apply the text replacement below.
{instruction}

Original text:
\"\"\"{req.text}\"\"\""""
        
        # 调用 AI 执行替换
        response = client.chat.completions.create(...)
        result = json.loads(response.choices[0].message.content)
        
        return ApplyResponse(new_text=result.get("new_text", req.text))
    else:
        # 拒绝了建议，不做修改
        return ApplyResponse(new_text=req.text)
```

**关键设计**：
- 发送完整的原文和原文段，让 AI 做精确替换
- 避免位置索引（可能不准确），用**文本匹配**替换
- 通过 AI 执行替换，保证结果正确

#### 3️⃣ POST /api/regenerate

**目的**：用户拒绝建议，AI 生成新的不同建议

**请求**：
```json
{
  "text": "完整的原文...",
  "original_segment": "要改进的段落",
  "rejected_type": "clarity",
  "rejected_suggestion": "用户不喜欢的建议"
}
```

**响应**：
```json
{
  "suggestion": {
    "id": "sug-new",
    "type": "style",
    "original": "要改进的段落",
    "suggested": "新的建议文本",
    "explanation": "为什么这个建议更好"
  }
}
```

**实现细节**：

```python
@app.post("/api/regenerate", response_model=RegenerateResponse)
def regenerate_suggestion(req: RegenerateRequest):
    # 提示 AI 生成不同类型的建议
    other_types = [t for t in ["grammar", "clarity", "style", "brevity"] 
                   if t != req.rejected_type]
    
    prompt = f"""You are a writing assistant. The user rejected a suggestion.

Context: Here is the full text:
{req.text}

The specific segment: "{req.original_segment}"
The rejected suggestion: "{req.rejected_suggestion}"

Please provide a DIFFERENT suggestion. Focus on: {', '.join(other_types)}
Return ONLY valid JSON..."""
    
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,  # 更高的创意度，生成不同的想法
        response_format={"type": "json_object"},
    )
    
    result = json.loads(response.choices[0].message.content)
    suggestion = result.get("suggestion", {})
    suggestion["id"] = f"sug-new"
    
    return RegenerateResponse(suggestion=Suggestion(**suggestion))
```

**关键设计**：
- 发送**完整文本**而不仅是片段，保留上下文
- 明确要求 AI 生成**不同类型**的建议，避免重复
- 提高 `temperature` 到 0.7，鼓励更多样的想法

---

## 状态管理

### 生命周期状态

```
idle (初始态)
  ↓
  用户输入文本，点击"请求 AI 审阅"
  ↓
reviewing
  ↓
  后端返回建议列表
  ↓
waiting (有建议待处理)
  ↓
  用户处理所有建议
  ↓
done (所有建议已处理)
  ↓
  用户开始新一轮审阅
  ↓
reviewing
  ...
```

### 状态转移逻辑

```javascript
// 开始审阅
const handleReview = async () => {
  setStatus('reviewing')
  // ... AI 调用
  setStatus(data.suggestions?.length ? 'waiting' : 'done')
}

// 处理建议时
const handleAccept = async () => {
  if (suggestions.length <= 1) {
    setStatus('idle')  // 最后一条建议，回到 idle
  }
}

const handleSkip = () => {
  if (suggestions.length <= 1) {
    setStatus('idle')  // 最后一条建议跳过后，回到 idle
  }
}

// 用户修改文本
const handleTextChange = (e) => {
  setText(e.target.value)
  setStatus('idle')    // 重置为 idle
  setSuggestions([])   // 清空建议
}
```

---

## 数据流

### 完整的 HITL 循环数据流

```
┌─────────────────────────────────────────────────────────────┐
│                 第一阶段：用户输入和 AI 审阅                   │
└─────────────────────────────────────────────────────────────┘

用户文本
    ↓
点击"请求 AI 审阅"
    ↓
POST /api/review { text, context }
    ↓
AI 分析文本，生成建议
    ↓
返回 { suggestions: [sug1, sug2, sug3, ...] }
    ↓
前端状态更新：
  - setSuggestions([...])
  - setTotalSuggestions(3)
  - setCompletedSuggestions(0)
  - setStatus('waiting')
    ↓
显示第一条建议卡片


┌─────────────────────────────────────────────────────────────┐
│                    第二阶段：建议处理循环                      │
└─────────────────────────────────────────────────────────────┘

用户选择操作（4 选 1）：

【操作A】接受或编辑
    ↓
POST /api/apply { text, original, suggested, edited_suggestion }
    ↓
AI 应用替换
    ↓
返回 { new_text }
    ↓
前端更新：
  - setText(new_text)
  - setSuggestions(prev => prev.filter(...))
  - setCompletedSuggestions(prev => prev + 1)
  - setHistory([...])
    ↓
显示"已完成 1 / 3"
    ↓
如果还有建议 → 显示下一条
如果没有了 → 显示"所有建议已处理"


【操作B】拒绝并重新生成
    ↓
POST /api/regenerate { text, original_segment, rejected_type, ... }
    ↓
AI 生成新建议
    ↓
返回 { suggestion: {...} }
    ↓
前端更新：
  - setSuggestions(prev => prev.map(...))  // 替换这条建议
  - 不增加 completedSuggestions
    ↓
显示新建议（进度不变）


【操作C】跳过
    ↓
前端直接更新：
  - setSuggestions(prev => prev.filter(...))
  - setCompletedSuggestions(prev => prev + 1)
    ↓
显示"已完成 1 / 3"
    ↓
显示下一条建议


┌─────────────────────────────────────────────────────────────┐
│                     第三阶段：循环结束                        │
└─────────────────────────────────────────────────────────────┘

所有建议处理完毕
    ↓
显示修改历史
    ↓
用户可以：
  - 继续编辑文本
  - 点击"请求 AI 审阅"开始新一轮
```

### 文本替换的精确性

**问题**：如何确保 AI 替换的是正确的文本片段？

**方案**：使用精确的原文段匹配

```python
# ❌ 错误方法：用位置索引
new_text = text[:start_pos] + replacement + text[end_pos:]
# 问题：如果文本编辑过，位置会不准确

# ✅ 正确方法：文本匹配 + AI 确认
instruction = f"""Replace this exact text segment:
"{req.original}"

With this replacement:
"{req.suggested}"

Return the full updated text..."""

# AI 会精确地找到原文段并替换
```

**流程**：
```
前端发送：{ original: "懒狗", suggested: "懒惰的狗" }
  ↓
后端 prompt：Replace "懒狗" with "懒惰的狗"
  ↓
AI 在完整文本中找到"懒狗"并替换
  ↓
返回修改后的完整文本
```

---

## 关键设计决策

### 1️⃣ 为什么要发送完整文本到后端？

**决策**：/api/regenerate 和 /api/apply 都发送完整的 `text` 字段

**原因**：
- **上下文保留**：AI 可以理解这个段落在整个文本中的位置
- **准确替换**：避免歧义，确保替换正确的文本
- **语言连贯性**：AI 可以基于上下文做出更好的改进建议

**示例**：
```
原文全文：
"这是一个句子。这个句子需要改进。还有更多内容。"

如果只发送：
"这个句子需要改进"
→ AI 可能生成："这个句子需要优化"（与上下文无关）

如果发送完整文本：
"这是一个句子。这个句子需要改进。还有更多内容。"
→ AI 可能生成："这个句子需要优化"（考虑了前后句子的风格）
```

### 2️⃣ 为什么用 `totalSuggestions` 和 `completedSuggestions` 两个状态？

**决策**：分离总数和完成数，而不是用 `suggestions.length` 计算进度

**原因**：
- **动态数组问题**：`suggestions` 数组会在用户接受/跳过时变短，导致进度显示混乱
- **用户体验**：进度显示"已完成 2 / 3"更清晰，而不是"还剩 1 / 3"
- **不受操作影响**：无论接受、拒绝、还是跳过，总数都不变

**反面例子**（错误的做法）：
```javascript
// ❌ 不好的做法
const progress = `第 ${currentIndex + 1} / ${suggestions.length}`

初始：3 条建议，显示"第 1 / 3"
用户接受第一条，suggestions 变成 2 条
现在显示"第 1 / 2"  ← 问题！xx 减少了
```

**正确做法**：
```javascript
// ✅ 好的做法
const progress = `已完成 ${completedSuggestions} / ${totalSuggestions}`

初始：setTotalSuggestions(3), setCompletedSuggestions(0)
显示"已完成 0 / 3"

用户接受第一条
显示"已完成 1 / 3"  ← 进度递增

用户接受第二条
显示"已完成 2 / 3"  ← 进度继续递增
```

### 3️⃣ 为什么用 AI 做文本替换而不是前端做？

**决策**：由后端 AI 执行 `/api/apply` 中的文本替换

**原因**：
- **避免位置不匹配**：前端可能因为编码问题出现位置偏差
- **确保准确性**：AI 能理解自然语言的精确性
- **支持复杂替换**：某些建议涉及语法变化，单纯的字符替换不够
- **一致的逻辑**：所有修改都通过 AI 确认，避免信任问题

**对比**：
```javascript
// ❌ 前端做替换（不推荐）
const newText = text.replace(original, suggested)
// 问题：如果 original 在文本中出现多次，会全部替换

// ✅ 后端 AI 做替换（推荐）
POST /api/apply { text, original, suggested }
// AI 理解上下文，精确替换
```

### 4️⃣ 为什么拒绝建议时不增加 `completedSuggestions`？

**决策**：调用 `/api/regenerate` 后，只替换建议，不增加完成计数

**原因**：
- **反映用户意图**：拒绝 ≠ 完成，用户还在审视这个点
- **鼓励新想法**：让用户有机会接受新建议再计为完成
- **清晰的进度**：只有接受或跳过时才计为"完成"

**流程**：
```
显示建议 1："快速的"→"敏捷的"
用户说"不喜欢"，点击"新建议"
  → completedSuggestions 不变（仍为 0）
  → 显示"已完成 0 / 3"

AI 生成新建议："快速的"→"灵活的"
用户接受
  → completedSuggestions += 1
  → 显示"已完成 1 / 3"
```

### 5️⃣ 为什么有单独的 `feedback` 状态？

**决策**：除了 `error` 外，还有 `feedback` 用于正向反馈

**原因**：
- **用户反馈**：让用户知道操作成功了（✅ 已接受、🔄 已生成新建议等）
- **视觉分层**：错误和反馈用不同样式显示
- **操作透明度**：用户能看到后端返回的状态消息

**使用**：
```javascript
setFeedback(`✅ 已接受: "${suggestion.explanation}"`)
setFeedback(`🔄 已生成新建议。`)
setFeedback(`⏭️ 已跳过关于 ${suggestion.type} 的建议。`)
```

---

## 总结

### HITL 流程核心

| 阶段 | 参与者 | 输入 | 输出 |
|------|--------|------|------|
| 1. 审阅 | AI | 用户文本 | 改进建议列表 |
| 2. 决策 | 人类 | 每条建议 | 接受/拒绝/编辑/跳过 |
| 3. 应用 | AI | 用户决策 + 原文 | 修改后的文本 |
| 4. 循环 | 系统 | 修改后的文本 | 返回步骤 1 或继续步骤 2 |

### 三个关键 API

| 端点 | 目的 | 触发时机 |
|------|------|---------|
| /api/review | 生成初始建议 | 用户点击"请求 AI 审阅" |
| /api/apply | 应用用户决策 | 用户接受/编辑建议 |
| /api/regenerate | 生成替代建议 | 用户拒绝当前建议 |

### 前端状态变量

| 变量 | 用途 | 更新时机 |
|------|------|---------|
| `text` | 当前正在编辑的文本 | 用户输入或后端返回 |
| `suggestions` | 待处理的建议列表 | 后端返回或用户操作 |
| `totalSuggestions` | 建议总数（固定） | /api/review 返回时设置一次 |
| `completedSuggestions` | 已处理建议数 | 用户接受/跳过时递增 |
| `status` | 工作流状态 | idle/reviewing/waiting/done |
| `history` | 修改历史 | 用户接受建议时添加 |

### 最佳实践

1. ✅ 发送完整文本到 AI，保留上下文
2. ✅ 用精确的文本匹配做替换，避免位置偏差
3. ✅ 分离 `totalSuggestions` 和 `completedSuggestions`，确保进度准确
4. ✅ 拒绝建议后不增加完成计数，鼓励用户找到满意的建议
5. ✅ 用 AI 执行所有文本修改，保证一致性和准确性
6. ✅ 提供清晰的用户反馈，展示操作结果
7. ✅ 保留修改历史，让用户看到自己的决策过程
