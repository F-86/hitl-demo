# HITL 提示词设计指南

本文档详解三个 API 端点的 prompt 策略，展示如何为 AI 设计有效的指令。

---

## 核心设计原则

### 1. 清晰的角色定义

所有 prompt 都以**角色陈述**开头，让 AI 明确自己的身份和职责：

```python
# 审阅任务
"You are a helpful writing assistant. Review the following text..."

# 替换任务
"Apply the text replacement below..."

# 重新生成任务
"You are a writing assistant. The user rejected a suggestion..."
```

### 2. 结构化的输出格式

明确要求 **JSON 格式输出**，并给出具体的 schema：

```python
# ❌ 不好：模糊的要求
"Return your suggestions in a format"

# ✅ 好：具体的 schema
Return ONLY valid JSON with no markdown or extra text. Use this exact format:
{{"suggestions": [
  {{"type": "grammar", "original": "exact text", "suggested": "replacement", "explanation": "reason"}}
]}}
```

### 3. 约束条件明确

- 最多返回多少条建议
- 不要包含什么内容
- 必须包含什么内容

```python
"Review the following text and suggest up to 3 improvements."
"Return ONLY valid JSON with no markdown or extra text."
"For each suggestion, identify: ... [exact list]"
```

### 4. 上下文保留

发送**完整的原文本**，让 AI 理解语境，做出更好的决策。

---

## API 1: POST /api/review - 生成建议

### 目的

AI 审阅用户文本，返回 2-3 条改进建议。这是 HITL 循环的第一步。

### 完整 Prompt

```python
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
```

### Prompt 分解

| 部分 | 作用 | 说明 |
|------|------|------|
| **角色** | 设定 AI 身份 | "You are a helpful writing assistant" |
| **任务** | 明确工作 | "Review the following text and suggest up to 3 improvements" |
| **上下文** | 提供背景 | `{context_hint}` 可选，如 "通用写作" |
| **输出要求** | 指定每条建议的字段 | type, original, suggested, explanation |
| **格式** | 明确数据结构 | JSON schema |
| **禁止项** | 防止不需要的内容 | "no markdown or extra text" |
| **文本** | 待审阅内容 | `{req.text}` |

### 关键参数

```python
response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": prompt}],
    temperature=0.3,           # 低温度：确保质量，减少随机性
    max_tokens=1000,           # 充足的令牌数
    response_format={"type": "json_object"},  # 强制 JSON
)
```

**为什么这些参数？**

- `temperature=0.3`：生成建议需要质量稳定，不需要过度创意
- `max_tokens=1000`：足够容纳 3 条建议的 JSON
- `response_format=json_object`：保证输出总是有效 JSON

### 示例

**输入**：
```json
{
  "text": "快速的棕色狐狸跳过了懒狗。这是美好的一天。",
  "context": "通用写作"
}
```

**AI 返回**：
```json
{
  "suggestions": [
    {
      "type": "clarity",
      "original": "快速的棕色狐狸跳过了懒狗",
      "suggested": "敏捷的褐色狐狸跳过了懒狗",
      "explanation": "使用更常见的词汇表达"
    },
    {
      "type": "style",
      "original": "这是美好的一天",
      "suggested": "天气晴朗，阳光明媚",
      "explanation": "更具体、更生动的描写"
    }
  ]
}
```

### Prompt 优化建议

如果 AI 生成的建议质量不高，可以优化 prompt：

```python
# 添加更多上下文
context_hint = f"Context: This is {req.context}. The target audience is {req.audience}."

# 明确建议类型的定义
For each suggestion, identify:
- type: one of 'grammar' (语法错误), 'clarity' (表达不清), 'style' (文风改进), 'brevity' (简洁优化)
- original: the exact text segment (must be found verbatim in the text)
- suggested: your proposed replacement
- explanation: why this improves the text

# 要求生成不同类型的建议
Ensure the suggestions cover different improvement areas (not all grammar, for example).

# 指定文本长度要求
The text segment should be 1-10 words, not entire sentences.
```

---

## API 2: POST /api/apply - 应用修改

### 目的

人类接受（或编辑后接受）一条建议，AI 应用文本替换。

### 完整 Prompt

```python
# 情况1：用户接受原始建议
instruction = f"""Replace this exact text segment:
"{req.original}"

With this replacement:
"{req.suggested}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""

# 情况2：用户编辑后接受建议
instruction = f"""Replace this exact text segment:
"{req.original}"

With this edited version:
"{req.edited_suggestion}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""

prompt = f"""Apply the text replacement below.
{instruction}

Original text:
\"\"\"
{req.text}
\"\"\""""
```

### Prompt 分解

| 部分 | 作用 | 说明 |
|------|------|------|
| **任务** | 指示 AI 替换 | "Apply the text replacement below" |
| **精确指示** | 明确原文和目标 | "Replace this exact text segment" |
| **输出格式** | 要求完整文本 | JSON with full updated text |
| **原文** | 保留上下文 | 完整的原始文本 |

### 关键参数

```python
response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": prompt}],
    temperature=0.1,           # 超低温度：必须精确替换，0 随意性
    max_tokens=2000,           # 完整文本可能较长
    response_format={"type": "json_object"},
)
```

**为什么这些参数？**

- `temperature=0.1`：替换操作必须精确，不能有创意
- `max_tokens=2000`：返回完整文本，需要更多空间

### 为什么不在前端替换？

❌ **前端替换的问题**：

```javascript
// 可能替换多次或替换错位置
const newText = text.replace(original, suggested)
// 如果 original = "是", 文本中可能有多个"是"
```

✅ **后端 AI 替换的优势**：

1. **理解上下文**：AI 知道要替换哪个具体位置
2. **处理复杂情况**：多次出现同一文本时，AI 能正确识别
3. **一致性**：所有修改都通过 AI 验证，保持信任
4. **安全性**：避免前端计算错误

### 示例

**输入**：
```json
{
  "text": "这是一个句子。这个句子需要改进。还有更多内容。",
  "original": "这个句子需要改进",
  "suggested": "这个句子需要优化",
  "accepted": true
}
```

**AI 返回**：
```json
{
  "new_text": "这是一个句子。这个句子需要优化。还有更多内容。"
}
```

---

## API 3: POST /api/regenerate - 生成新建议

### 目的

用户拒绝了当前建议，AI 生成一个**不同类型**的新建议。

### 完整 Prompt

```python
other_types = [t for t in ["grammar", "clarity", "style", "brevity"] 
               if t != req.rejected_type]

prompt = f"""You are a writing assistant. The user rejected a suggestion and wants a different improvement.

Context: Here is the full text:
{req.text}

The specific segment being reviewed: "{req.original_segment}"

The rejected suggestion (type: {req.rejected_type}): "{req.rejected_suggestion}"

Please provide a DIFFERENT improvement suggestion for this segment. Focus on a different aspect from {req.rejected_type}.
Consider these alternatives: {', '.join(other_types)}

Return ONLY valid JSON with no markdown or extra text:
{{"suggestion": {{"type": "grammar|clarity|style|brevity", "original": "{req.original_segment}", "suggested": "replacement text", "explanation": "why this improves the text"}}}}"""
```

### Prompt 分解

| 部分 | 作用 | 说明 |
|------|------|------|
| **上下文** | 保留背景 | 完整文本和被拒建议 |
| **约束** | 要求差异化 | "DIFFERENT improvement" |
| **方向** | 避免重复 | "different aspect from {type}" |
| **选项** | 列出替代方向 | 其他三种改进类型 |
| **格式** | 单条建议 | `suggestion` 而非 `suggestions` |

### 关键参数

```python
response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": prompt}],
    temperature=0.7,           # 更高的创意度，探索不同想法
    max_tokens=1000,
    response_format={"type": "json_object"},
)
```

**为什么这些参数？**

- `temperature=0.7`：需要创意和多样性，生成与之前不同的想法
- 提高温度的原因：降低重复生成相同建议的风险

### 示例

**输入**：
```json
{
  "text": "这是一个句子。这个句子需要改进。还有更多内容。",
  "original_segment": "这个句子需要改进",
  "rejected_type": "clarity",
  "rejected_suggestion": "这个句子需要得到改进"
}
```

**AI 返回（不同类型）**：
```json
{
  "suggestion": {
    "type": "style",
    "original": "这个句子需要改进",
    "suggested": "这句话有待完善",
    "explanation": "语气更自然，表达更委婉"
  }
}
```

### 防止重复的策略

```python
# 1️⃣ 明确说明被拒内容
"The rejected suggestion (type: {req.rejected_type}): \"{req.rejected_suggestion}\""

# 2️⃣ 要求不同类型
"Focus on a different aspect from {req.rejected_type}"
"Consider these alternatives: {', '.join(other_types)}"

# 3️⃣ 增加温度
temperature=0.7  # 相比 review 的 0.3，更容易生成多样化输出

# 4️⃣ 指定约束
"Please provide a DIFFERENT improvement suggestion"
```

---

## Prompt 工程最佳实践

### 1. 明确的输入/输出格式

```python
# ❌ 不好
"Give me suggestions for this text"

# ✅ 好
"""Suggest exactly 3 improvements. For each, return:
- type: one of 'grammar', 'clarity', 'style', 'brevity'
- original: exact text segment
- suggested: replacement
- explanation: brief reason"""
```

### 2. 使用角色扮演

```python
# ❌ 不好
"Return JSON with suggestions"

# ✅ 好
"You are a professional writing assistant. Review the text carefully..."
```

### 3. 提供上下文

```python
# ❌ 只发送片段
review_text = "需要改进"

# ✅ 发送完整文本
review_text = """这是一个句子。这个句子需要改进。还有更多内容。"""
```

### 4. 明确约束

```python
# ❌ 模糊
"Return suggestions"

# ✅ 明确
"""Return ONLY valid JSON. No markdown, no extra text.
Return up to 3 suggestions.
Each suggestion must have: type, original, suggested, explanation."""
```

### 5. 使用 JSON Schema

```python
# 让 OpenAI 生成有效 JSON
response_format={"type": "json_object"}

# 或在 prompt 中给出完整 schema
"""Return ONLY valid JSON with this structure:
{
  "suggestions": [
    {
      "type": "string",
      "original": "string", 
      "suggested": "string",
      "explanation": "string"
    }
  ]
}"""
```

---

## 温度选择指南

| API | 目的 | 温度 | 原因 |
|-----|------|------|------|
| `/review` | 生成建议 | 0.3 | 需要质量稳定，不需要过度创意 |
| `/apply` | 文本替换 | 0.1 | 必须精确执行，没有创意空间 |
| `/regenerate` | 新建议 | 0.7 | 需要多样性，避免重复 |

---

## 常见问题

### Q1: 为什么 /api/review 限制为 3 条建议？

**A**: 
- 用户体验：3 条建议是最佳平衡点，不会过多也不会过少
- 工作流：用户一次处理 1-3 条，循环次数合理
- 成本：减少 token 消耗

如果要改变，修改 prompt 中的 `up to 3` 和响应处理中的 `[:3]`。

### Q2: 如何提高建议的质量？

**A**: 改进方向：
1. 添加更多上下文（如目标受众、文本类型）
2. 让用户提供前几条建议不满意的原因
3. 在 prompt 中给出"好建议"和"坏建议"的例子
4. 使用 few-shot learning（在 prompt 中给出示例）

### Q3: 如何处理 JSON 解析失败？

**A**: 代码中已有处理：
```python
try:
    result = json.loads(content)
except json.JSONDecodeError as e:
    raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {str(e)}")
```

如果经常失败：
- 检查 prompt 格式
- 增加 `max_tokens`
- 检查是否包含特殊字符导致转义问题

### Q4: 温度 0.7 是否太高了？

**A**: 不会，因为：
1. 只有拒绝时才使用，用户已经过滤了一次
2. /api/regenerate 需要多样性
3. 0.7 仍然相对保守（0-2 范围内）

如果要调整：
- 想要更稳定的建议：改为 0.5
- 想要更创意的建议：改为 0.9

---

## 扩展思路

### 支持多语言

当前 prompt 用英文写给 AI，但处理的是中文文本。可以改进为：

```python
language = "Chinese"  # 从请求中获取
prompt = f"""You are a {language} writing assistant...
返回 JSON 格式..."""
```

### 添加用户偏好

```python
preferences = {
    "tone": "professional",  # 正式、随意、学术等
    "length": "concise",     # 简洁、详细
    "audience": "general"    # 目标受众
}

context_hint = f"""
Tone: {preferences['tone']}
Style: Keep suggestions {preferences['length']}
Audience: {preferences['audience']}"""
```

### Few-shot Learning

在 prompt 中提供几个"好例子"：

```python
examples = """
Example of good suggestion:
- type: clarity
- original: "这个方案有一定的可行性"
- suggested: "这个方案可行"
- explanation: "更简洁，意思不变"

Example of bad suggestion (avoid):
- Too vague: "这段话需要改进"
- Incomplete: 只改动一个字
"""

prompt = f"{examples}\n\nNow review this text: {req.text}"
```

---

## 总结

| API | 角色 | 任务 | 温度 | 关键点 |
|-----|------|------|------|--------|
| /review | 写作助手 | 审阅并生成建议 | 0.3 | 质量稳定，明确格式 |
| /apply | 执行者 | 精确替换文本 | 0.1 | 完整上下文，精确性 |
| /regenerate | 创意者 | 生成替代建议 | 0.7 | 多样性，避免重复 |

**三个原则**：
1. ✅ 完整的原文本（保留上下文）
2. ✅ 明确的输出格式（JSON schema）
3. ✅ 合适的温度（质量 vs 创意的平衡）
