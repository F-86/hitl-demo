# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "fastapi==0.115.6",
#     "uvicorn==0.34.0",
#     "openai==1.59.3",
#     "python-dotenv==1.0.1",
# ]
# ///

"""
人类反馈循环演示 - 后端 (FastAPI + DeepSeek)
=============================================
一个为 AI 写作助手提供支持的简单 API，包含人类审查流程。
AI 提议修改，人类批准/拒绝，循环继续。

流程：
  1. POST /api/review     - AI 审阅用户文本并建议改进
  2. POST /api/apply      - 人类接受建议，AI 应用修改
  3. POST /api/regenerate - 人类拒绝，AI 生成新建议

所有 LLM 调用使用 DeepSeek API (OpenAI 兼容)。
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="HITL Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DeepSeek 客户端 (OpenAI 兼容)
client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# ── 请求/响应模型 ──────────────────────────────────────────

class ReviewRequest(BaseModel):
    text: str
    context: str = ""  # 可选：文本类型说明

class Suggestion(BaseModel):
    id: str          # 该建议的唯一ID
    type: str        # "grammar" (语法), "clarity" (清晰度), "style" (风格), "brevity" (简洁度)
    original: str    # 原始文本段落
    suggested: str   # AI 建议的替代文本
    explanation: str # 为什么推荐这个修改

class ReviewResponse(BaseModel):
    suggestions: list[Suggestion]

class ApplyRequest(BaseModel):
    text: str
    suggestion_id: str
    accepted: bool
    edited_suggestion: str = ""  # 人类在接受前编辑的建议
    original: str = ""  # 要替换的原始文本段落
    suggested: str = ""  # 建议的替代文本

class ApplyResponse(BaseModel):
    new_text: str

class RegenerateRequest(BaseModel):
    text: str  # 完整的原文，用于保留语境
    original_segment: str  # 要改进的原文段落
    rejected_type: str     # 被拒的建议类型 (grammar, clarity, style, brevity)
    rejected_suggestion: str = ""  # 被拒的建议内容

class RegenerateResponse(BaseModel):
    suggestion: Suggestion


# ── 路由 ───────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/api/review", response_model=ReviewResponse)
def review_text(req: ReviewRequest):
    """
    AI 审阅用户文本并返回最多 3 条建议。
    这是 HITL 循环的第一步：AI 提议 → 人类决策。
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    context_hint = f"Context: {req.context}. " if req.context else ""

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
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        import json
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise HTTPException(status_code=500, detail="AI returned empty response")

        result = json.loads(content)

        # 为每个建议分配唯一 ID
        suggestions = result.get("suggestions", [])
        for i, s in enumerate(suggestions):
            s["id"] = f"sug-{i+1}"

        return ReviewResponse(suggestions=suggestions[:3])

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI review failed: {str(e)}")


@app.post("/api/apply", response_model=ApplyResponse)
def apply_suggestion(req: ApplyRequest):
    """
    人类接受（或编辑后接受）一个建议。
    AI 应用修改并返回更新后的文本。
    这是 HITL 的第 2 步：人类决策 → AI 执行。
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if req.accepted and req.edited_suggestion:
        # 人类在接受前编辑了建议
        replacement = req.edited_suggestion
        original_segment = req.original
        instruction = f"""Replace this exact text segment:
"{original_segment}"

With this edited version:
"{replacement}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    elif req.accepted:
        original_segment = req.original
        replacement = req.suggested
        instruction = f"""Replace this exact text segment:
"{original_segment}"

With this replacement:
"{replacement}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    else:
        # 被拒绝 - 无需修改
        return ApplyResponse(new_text=req.text)

    prompt = f"""Apply the text replacement below.
{instruction}

Original text:
\"\"\"
{req.text}
\"\"\""""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        import json
        result = json.loads(response.choices[0].message.content)
        return ApplyResponse(new_text=result.get("new_text", req.text))

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply failed: {str(e)}")


@app.post("/api/regenerate", response_model=RegenerateResponse)
def regenerate_suggestion(req: RegenerateRequest):
    """
    人类拒绝一个建议并想要不同的建议。
    AI 为特定文本段落生成新的、不同的建议。
    这是 HITL 的第 2b 步：人类拒绝 → AI 重新提议。
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if not req.original_segment.strip():
        raise HTTPException(status_code=400, detail="Original segment cannot be empty")

    other_types = [t for t in ["grammar", "clarity", "style", "brevity"] if t != req.rejected_type]

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
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        import json
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise HTTPException(status_code=500, detail="Model returned empty response. Try again or modify your text.")
        result = json.loads(content)
        suggestion = result.get("suggestion", {})
        suggestion["id"] = f"sug-new"

        return RegenerateResponse(suggestion=Suggestion(**suggestion))

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse model response: {str(e)}")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"Regenerate failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
