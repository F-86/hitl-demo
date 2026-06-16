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
Human-in-the-Loop Demo - Backend (FastAPI + DeepSeek)
======================================================
A simple API that powers an AI writing assistant with human review.
The AI proposes edits, the human approves/rejects, and the cycle continues.

Flow:
  1. POST /api/review     - AI reviews user's text and suggests one improvement
  2. POST /api/apply      - Human accepts a suggestion, AI applies it
  3. POST /api/regenerate - Human rejects, AI generates a new suggestion

Uses DeepSeek API (OpenAI-compatible) for all LLM calls.
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

# DeepSeek client (OpenAI-compatible)
client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# ── Request/Response models ──────────────────────────────────────────

class ReviewRequest(BaseModel):
    text: str
    context: str = ""  # optional: what kind of writing this is

class Suggestion(BaseModel):
    id: str          # unique ID for this suggestion
    type: str        # "grammar", "clarity", "style", "brevity"
    original: str    # the original text segment
    suggested: str   # the AI's suggested replacement
    explanation: str # why this change is recommended

class ReviewResponse(BaseModel):
    suggestions: list[Suggestion]

class ApplyRequest(BaseModel):
    text: str
    suggestion_id: str
    accepted: bool
    edited_suggestion: str = ""  # if human edits the suggestion before accepting

class ApplyResponse(BaseModel):
    new_text: str

class RegenerateRequest(BaseModel):
    text: str
    rejected_id: str  # the suggestion being rejected

class RegenerateResponse(BaseModel):
    suggestion: Suggestion


# ── Routes ───────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/api/review", response_model=ReviewResponse)
def review_text(req: ReviewRequest):
    """
    AI reviews the user's text and returns up to 3 suggestions.
    This is the first step in the HITL cycle: AI proposes → human decides.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    context_hint = f" Context: {req.context}." if req.context else ""

    prompt = f"""You are a helpful writing assistant. Review the following text and suggest up to 3 improvements.{context_hint}

For each suggestion, identify:
- The exact original text segment to replace
- Your suggested replacement
- The type of improvement (grammar, clarity, style, or brevity)
- A brief explanation

IMPORTANT: Return your response as valid JSON only, no markdown or other text. Use this exact format:
{{"suggestions": [
  {{"type": "grammar", "original": "exact text to replace", "suggested": "replacement text", "explanation": "why this improves the text"}}
]}}

Text to review:
\"\"\"
{req.text}
\"\"\""""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        import json
        result = json.loads(response.choices[0].message.content)

        # Assign unique IDs to each suggestion
        suggestions = result.get("suggestions", [])
        for i, s in enumerate(suggestions):
            s["id"] = f"sug-{i+1}"

        return ReviewResponse(suggestions=suggestions[:3])

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI review failed: {str(e)}")


@app.post("/api/apply", response_model=ApplyResponse)
def apply_suggestion(req: ApplyRequest):
    """
    Human accepts (or edits-and-accepts) a suggestion.
    AI applies the change and returns the updated text.
    This is step 2 of HITL: human decision → AI executes.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if req.accepted and req.edited_suggestion:
        # Human edited the suggestion before accepting
        replacement = req.edited_suggestion
        instruction = f"""The user accepted a suggestion but modified it.
Replace the relevant part of the text with this edited version: "{replacement}"

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    elif req.accepted:
        instruction = f"""The user accepted suggestion #{req.suggestion_id}.
Replace the relevant part of the text with the accepted suggestion.

Return the full updated text as valid JSON:
{{"new_text": "the complete updated text"}}"""
    else:
        # Rejected - no change needed
        return ApplyResponse(new_text=req.text)

    prompt = f"""Apply the accepted change to the text below.
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
    Human rejects a suggestion and wants a different one.
    AI generates a new, different suggestion for the same text.
    This is step 2b of HITL: human rejects → AI re-proposes.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    prompt = f"""You previously suggested an improvement to this text, but the user rejected it.
Generate a DIFFERENT suggestion this time - focus on a different aspect.

Text:
\"\"\"
{req.text}
\"\"\"

Return valid JSON only:
{{"suggestion": {{"type": "grammar|clarity|style|brevity", "original": "exact text to replace", "suggested": "replacement text", "explanation": "why this improves the text"}}}}"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000,
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
