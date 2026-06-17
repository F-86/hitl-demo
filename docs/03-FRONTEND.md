# HITL 前端实现详解

本文档深入讲解 React 前端的状态管理、交互逻辑和 UI 组件。

---

## 核心状态管理

### 8 个关键 State 变量

**App.jsx** 中定义的所有状态：

```javascript
// 📝 文本和建议
const [text, setText] = useState(initialText)              // 当前文本
const [suggestions, setSuggestions] = useState([])         // 待处理建议列表
const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0)  // 当前显示的建议索引

// 📊 HITL 进度追踪
const [totalSuggestions, setTotalSuggestions] = useState(0)          // 总建议数（不变）
const [completedSuggestions, setCompletedSuggestions] = useState(0)  // 已完成数（递增）

// 🔄 生命周期和反馈
const [status, setStatus] = useState('idle')  // idle | reviewing | waiting | done
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')
const [feedback, setFeedback] = useState('')

// 📋 历史记录
const [history, setHistory] = useState([])  // { action, original, result, explanation }
```

### 状态生命周期图

```
初始化
   ↓
┌─ idle ─┐
│  • text: 用户输入/初始值
│  • suggestions: []
│  • status: 'idle'
└────┬────┘
     │ 用户点击"请求 AI 审阅"
     ↓
  reviewing (加载中)
     │ AI 返回建议
     ↓
  waiting (有建议待处理)
     │ 处理建议（接受/跳过）
     ↓
  done (所有建议已处理)
     │ 用户点击"请求 AI 审阅"或编辑文本
     ↓
  回到 idle 或 reviewing
```

---

## 进度追踪逻辑

### 为什么分离 totalSuggestions 和 completedSuggestions？

**问题**：如果用 `suggestions.length` 计算进度，会出现什么？

```javascript
// ❌ 错误的做法
const progress = `第 ${currentIndex + 1} / ${suggestions.length}`

// 初始状态：3 条建议
显示"第 1 / 3"

// 用户接受第一条，suggestions 变成 2 条
现在显示"第 1 / 2"  ← 问题！进度反而减少了！
```

**解决方案**：分离总数和完成数

```javascript
// ✅ 正确的做法
const progress = `已完成 ${completedSuggestions} / ${totalSuggestions}`

// 初始化
setTotalSuggestions(3)         // 固定值
setCompletedSuggestions(0)      // 初始为 0

// 用户接受第一条
setCompletedSuggestions(prev => prev + 1)
显示"已完成 1 / 3"  ← 进度递增 ✓

// 用户接受第二条
setCompletedSuggestions(prev => prev + 1)
显示"已完成 2 / 3"  ← 继续递增 ✓
```

### 初始化时的重复代码

注意代码中有重复：

```javascript
setTotalSuggestions(data.suggestions?.length || 0)
setCompletedSuggestions(0)
setTotalSuggestions(data.suggestions?.length || 0)  // 重复
setCompletedSuggestions(0)                           // 重复
setCurrentSuggestionIndex(0)                         // 重复
```

可以简化为：

```javascript
const suggestionCount = data.suggestions?.length || 0
setSuggestions(suggestionCount > 0 ? data.suggestions : [])
setTotalSuggestions(suggestionCount)
setCompletedSuggestions(0)
setCurrentSuggestionIndex(0)
```

---

## 四种建议处理方式

### 1️⃣ 接受建议（handleAccept）

```javascript
const handleAccept = async (suggestion, editedText) => {
  setLoading(true)
  setError('')
  
  try {
    // 发送到后端
    const res = await fetch(`${API}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,                              // 当前全文
        suggestion_id: suggestion.id,      // 建议ID
        accepted: true,                    
        edited_suggestion: editedText || '',     // 用户编辑的版本（如果有）
        original: suggestion.original,     // 原文段落
        suggested: suggestion.suggested,   // AI 建议的版本
      }),
    })
    
    if (!res.ok) throw new Error((await res.json()).detail || 'Apply failed')
    const data = await res.json()
    
    // 1. 更新文本
    setText(data.new_text)
    
    // 2. 移除这条建议
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    
    // 3. 增加完成计数
    setCompletedSuggestions(prev => prev + 1)
    
    // 4. 记录到历史
    setHistory(prev => [...prev, {
      action: editedText ? '已编辑' : '已接受',
      original: suggestion.original,
      result: editedText || suggestion.suggested,
      explanation: suggestion.explanation,
    }])
    
    // 5. 显示反馈
    setFeedback(`✅ 已接受: "${suggestion.explanation}"`)
    
    // 6. 如果没有更多建议了，回到 idle
    if (suggestions.length <= 1) {
      setStatus('idle')
    }
  } catch (e) {
    setError(e.message)
  } finally {
    setLoading(false)
  }
}
```

**流程图**：

```
用户点击"接受" / "确认修改"
    ↓
发送 POST /api/apply
    ↓
后端返回 new_text
    ↓
更新 6 个状态：
  ✓ setText(new_text)
  ✓ setSuggestions 过滤
  ✓ setCompletedSuggestions += 1
  ✓ setHistory 记录
  ✓ setFeedback 显示反馈
  ✓ setStatus idle（如果最后一条）
```

### 2️⃣ 拒绝并重新生成（handleReject）

```javascript
const handleReject = async (suggestion) => {
  setLoading(true)
  setError('')
  
  try {
    // 发送到后端
    const res = await fetch(`${API}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,                          // 完整原文（保留上下文）
        original_segment: suggestion.original,  // 要改进的段落
        rejected_type: suggestion.type,         // 被拒的类型（避免重复）
        rejected_suggestion: suggestion.suggested,  // 被拒的内容
      }),
    })
    
    if (!res.ok) throw new Error((await res.json()).detail || 'Regenerate failed')
    const data = await res.json()
    
    // 1. 替换这条建议（用新的替换旧的）
    setSuggestions(prev =>
      prev.map(s => 
        s.id === suggestion.id 
          ? { ...data.suggestion, id: suggestion.id }  // 保持 ID 一致
          : s
      )
    )
    
    // 2. 显示反馈
    setFeedback('🔄 已生成新建议。')
    
    // 注意：不增加 completedSuggestions，因为用户还在审视这一项
  } catch (e) {
    setError(e.message)
  } finally {
    setLoading(false)
  }
}
```

**关键点**：

1. **保持建议 ID**：`id: suggestion.id` 确保轮换显示不受影响
2. **不增加完成计数**：拒绝 ≠ 完成，用户可能接受新建议后再计数
3. **替换而非移除**：同一项位置显示新建议，用户体验连贯

**流程图**：

```
用户点击"新建议"
    ↓
发送 POST /api/regenerate
    ↓
后端返回新建议
    ↓
在原位置替换建议
    ↓
显示"已生成新建议"
    ↓
completedSuggestions 不变
```

### 3️⃣ 跳过建议（handleSkip）

```javascript
const handleSkip = (suggestion) => {
  // 1. 移除这条建议
  setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
  
  // 2. 增加完成计数（即使没有采纳）
  setCompletedSuggestions(prev => prev + 1)
  
  // 3. 显示反馈
  setFeedback(`⏭️ 已跳过关于 ${suggestion.type} 的建议。`)
  
  // 4. 如果没有更多建议了，回到 idle
  if (suggestions.length <= 1) {
    setStatus('idle')
  } else {
    // 5. 否则调整索引（防止超出范围）
    setCurrentSuggestionIndex(prev => Math.min(prev, suggestions.length - 2))
  }
}
```

**为什么跳过要增加计数？**

- 用户已经审视了这条建议，做出了决策（不采纳）
- 进度应该反映"已审视"而非"已采纳"
- 如果不计数，用户永远会看到"已完成 0 / 3"

### 4️⃣ 编辑建议（在 SuggestionCard 中）

```javascript
function SuggestionCard({ suggestion, onAccept, ... }) {
  const [editing, setEditing] = useState(false)
  const [editedValue, setEditedValue] = useState(suggestion.suggested)
  
  return (
    <div>
      {editing ? (
        // 编辑模式
        <>
          <input
            value={editedValue}
            onChange={e => setEditedValue(e.target.value)}
          />
          <button onClick={() => {
            onAccept(suggestion, editedValue)  // 传递编辑后的文本
            setEditing(false)
          }}>
            ✅ 确认修改
          </button>
          <button onClick={() => {
            setEditing(false)
            setEditedValue(suggestion.suggested)  // 恢复原值
          }}>
            取消
          </button>
        </>
      ) : (
        // 查看模式
        <>
          <span>{suggestion.suggested}</span>
          <button onClick={() => setEditing(true)}>
            ✏️ 编辑
          </button>
          <button onClick={() => onAccept(suggestion, '')}>
            ✅ 接受
          </button>
        </>
      )}
    </div>
  )
}
```

**流程**：
1. 用户点击"编辑" → `setEditing(true)`
2. 显示 input，用户修改文本
3. 用户点击"确认修改" → 调用 `onAccept(suggestion, editedValue)`
4. handleAccept 接收到 `editedText` 参数，发送到后端
5. 后端用 `editedText` 替代 `suggestion.suggested`

---

## 轮换显示（Carousel 实现）

### 单条显示模式

```javascript
{status === 'waiting' && suggestions.length > 0 && (
  <SuggestionCard
    suggestion={suggestions[currentSuggestionIndex]}  // 只显示当前建议
    index={currentSuggestionIndex}
    totalSuggestions={totalSuggestions}
    completedSuggestions={completedSuggestions}
    onAccept={handleAccept}
    onReject={handleReject}
    onSkip={handleSkip}
  />
)}
```

### 为什么单条显示？

**优势**：
- ✅ 专注：用户一次只关注一条建议
- ✅ 简洁：UI 不会过度拥挤
- ✅ 清晰：进度显示明确

**vs 全部显示**：
```javascript
// ❌ 全部显示的问题
{suggestions.map((s, i) => (
  <SuggestionCard key={i} suggestion={s} />
))}
// 问题：
// 1. 用户可能一次接受多条，进度计算复杂
// 2. UI 拥挤，特别是建议数多时
// 3. 没有明确的"当前在处理第几条"的概念
```

### 索引调整逻辑

关键问题：**当移除一条建议后，currentIndex 如何调整？**

```javascript
if (suggestions.length <= 1) {
  setStatus('idle')
} else {
  setCurrentSuggestionIndex(prev => Math.min(prev, suggestions.length - 2))
}
```

**示例**：

```
初始：3 条建议，显示第 0 条
suggestions[0]  ← 显示（当前 index = 0）
suggestions[1]
suggestions[2]

用户接受第 0 条，移除后：
suggestions[0]  ← 原来的 suggestions[1]
suggestions[1]  ← 原来的 suggestions[2]

新的 index = Math.min(0, 2 - 2) = Math.min(0, 0) = 0
继续显示新的 suggestions[0]（原来的第二条）✓
```

```
初始：3 条建议，显示第 2 条（最后一条）
suggestions[0]
suggestions[1]
suggestions[2]  ← 显示（当前 index = 2）

用户接受第 2 条，移除后：
suggestions[0]
suggestions[1]

新的 index = Math.min(2, 1 - 2) = Math.min(2, -1) = -1？
不对！应该是 Math.min(prev, suggestions.length - 2)
Math.min(2, 2 - 2) = Math.min(2, 0) = 0
显示 suggestions[0] ✓
```

---

## 完整 HITL 流程动画

```
用户界面                          状态                      后端
─────────────────────────────────────────────────────────────────

输入文本 ─────────────────────→  text = "..."
                                status = idle

点击"请求审阅" ──────────────→  status = reviewing
                                loading = true
                             ┌──→ POST /api/review
                             │
                             └──  收到建议
                             
建议卡片出现 ◄────────────────  status = waiting
                                suggestions = [...]
                                totalSuggestions = 3
                                completedSuggestions = 0
                                loading = false

用户操作（4选1）

【接受】
  显示第1条 ◄──────────────────  currentSuggestionIndex = 0
  
  点击✅接受 ────────────────→  loading = true
                             ┌──→ POST /api/apply
                             │
                             └──  返回新文本
  
  文本更新 ◄──────────────────  text = "新文本"
  进度"1/3"                      completedSuggestions = 1
  显示第2条                       suggestions 长度 -1
  
【编辑】
  点击✏️编辑 ────────────────→  SuggestionCard editing = true
  
  input 出现                      用户修改建议文本
  
  点击确认 ───────────────────→  loading = true
                             ┌──→ POST /api/apply (with editedText)
                             │
                             └──  返回新文本
  
  文本更新 ◄──────────────────  与接受流程相同
  
【拒绝/新建议】
  点击🔄新建议 ────────────────→  loading = true
                             ┌──→ POST /api/regenerate
                             │
                             └──  返回新建议
  
  新建议显示 ◄──────────────────  suggestions 中该条被替换
  进度不变"0/3"                   completedSuggestions 不变
  
【跳过】
  点击⏭️跳过 ─────────────────→  setSuggestions 过滤
  
  进度"1/3" ◄──────────────────  completedSuggestions += 1
  显示第2条（原第3条）             currentSuggestionIndex 调整
```

---

## 错误处理

### 错误类型和处理

```javascript
// 1. 网络错误
try {
  const res = await fetch(...)
  if (!res.ok) {
    throw new Error((await res.json()).detail || 'Request failed')
  }
} catch (e) {
  setError(e.message)  // "connection refused" 等
}

// 2. 后端返回错误
// 后端返回 {detail: "Text cannot be empty"}
if (!res.ok) {
  throw new Error((await res.json()).detail)
}

// 3. 初始化失败
useEffect(() => {
  fetch(`${API}/health`)
    .catch(() => setError('后端无法连接。请运行: cd backend && python app.py'))
}, [])
```

### 显示反馈

```javascript
{error && <div className="alert alert-error">{error}</div>}
{feedback && !error && <div className="alert alert-info">{feedback}</div>}
```

**为什么 `!error`**？不同时显示错误和反馈，错误优先级更高。

---

## 修改历史

### 数据结构

```javascript
const history = [
  {
    action: '已接受' | '已编辑',
    original: "要改进的文本",
    result: "修改后的文本",
    explanation: "为什么做这个改进"
  },
  ...
]
```

### 记录时机

```javascript
// 只有在接受（含编辑）时才记录
setHistory(prev => [...prev, {
  action: editedText ? '已编辑' : '已接受',
  original: suggestion.original,
  result: editedText || suggestion.suggested,
  explanation: suggestion.explanation,
}])

// 拒绝、跳过、新建议都不记录历史
// 因为这些不代表"最终修改决策"
```

### 显示

```javascript
{history.length > 0 && (
  <section>
    <h2>📋 修改历史</h2>
    <ul>
      {history.map((h, i) => (
        <li key={i}>
          <span className="action">
            {h.action === '已编辑' ? '✏️ 已编辑' : '✅ 已接受'}:
          </span>
          <span className="detail"> {h.explanation}</span>
        </li>
      ))}
    </ul>
  </section>
)}
```

---

## 关键优化

### 1. 避免不必要的 API 调用

```javascript
const handleAccept = async (suggestion, editedText) => {
  setLoading(true)  // 防止重复点击
  // ...
  finally {
    setLoading(false)
  }
}

// 在按钮上
<button disabled={loading || !text.trim()}>
  {loading ? '⏳ AI 正在处理...' : '✅ 接受'}
</button>
```

### 2. 及时清除错误

```javascript
const handleAccept = async () => {
  setError('')      // 清除旧错误
  setFeedback('')   // 清除旧反馈
  // ...
  if (!res.ok) {
    setError(...)   // 显示新错误
  }
}
```

### 3. 保存 textRef 但不必使用

```javascript
const textRef = useRef(null)

// 目前还没用到，但可以用于：
// - 自动聚焦
// - 获取光标位置
// - 文本选择操作
```

---

## 总结

| 操作 | 触发 | 状态变化 | 后端调用 | 历史记录 |
|------|------|---------|---------|---------|
| 接受 | ✅ 按钮 | +completedSuggestions | /api/apply | ✓ 记录 |
| 编辑 | ✏️ 按钮 | 同接受 + 用户编辑 | /api/apply | ✓ 记录 |
| 拒绝 | 🔄 按钮 | 替换建议 | /api/regenerate | ✗ 不记录 |
| 跳过 | ⏭️ 按钮 | +completedSuggestions | 无 | ✗ 不记录 |

---

## 常见问题

### Q: 为什么需要 `textRef`？

A: 现在还没用到，但未来可以用于：
- 自动聚焦到文本框
- 获取文本的光标位置
- 选中某个单词进行操作

### Q: 如何添加撤销功能？

A: 扩展 `history` 状态：
```javascript
const [history, setHistory] = useState([])
const handleUndo = () => {
  if (history.length > 0) {
    const lastChange = history[history.length - 1]
    setText(lastChange.beforeText)  // 恢复到修改前
    setHistory(history.slice(0, -1))
  }
}
```

### Q: 为什么 `suggestions.length <= 1` 时设置 `status = idle`？

A: 
- 0 条：没有建议了
- 1 条：用户处理最后一条后，没有下一条了

所以用 `<= 1` 来判断是否应该结束循环。

### Q: 如何支持多个 AI 引擎？

A: 修改 API 端点：
```javascript
const API = `/api/${selectedEngine}`  // /api/deepseek 或 /api/openai
```

或在请求中传递参数：
```javascript
body: JSON.stringify({
  text,
  engine: 'deepseek',
  ...
})
```
