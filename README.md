# Human-in-the-Loop Demo: AI Writing Assistant

A full-stack demo showcasing **Human-in-the-Loop (HITL)** interaction pattern with AI.

**Frontend:** React (Vite)  
**Backend:** Python (FastAPI)  
**AI Model:** DeepSeek V4 Flash  

## 🎯 What is Human-in-the-Loop?

HITL is a design pattern where AI and humans collaborate:  
- **AI proposes** improvements or decisions  
- **Human reviews, edits, approves, or rejects**  
- **AI incorporates feedback** and learns from human choices  

This demo implements an **AI Writing Assistant** that follows this pattern exactly.

## 🔄 HITL Flow

```
┌───────────┐     ┌───────────┐     ┌───────────┐
│  Human    │────▶│    AI     │────▶│  Human    │
│ writes    │     │ reviews   │     │ accepts/  │
│ text      │     │ text      │     │ rejects   │
└───────────┘     └───────────┘     └───────────┘
                                            │
                    ┌───────────────────────┘
                    ▼
              ┌───────────┐
              │    AI     │
              │ applies   │
              │ changes   │
              └───────────┘
                    │
                    ▼
              (loop back for more review)
```

## 🚀 Quick Start

### 1. Backend (Python)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Runs on http://localhost:8000

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:3000

### 3. Use the App

1. Write or paste text in the editor
2. Click **"Ask AI to Review"** — AI analyzes and suggests improvements
3. For each suggestion:
   - **Accept** — apply the AI's suggestion
   - **Edit & Accept** — modify the suggestion, then apply
   - **New Suggestion** — reject and get a different suggestion
   - **Skip** — ignore this suggestion
4. After processing all suggestions, click **"Ask AI to Review"** again for another pass

## 🏗️ Architecture

```
hitl-demo/
├── backend/
│   ├── app.py              # FastAPI server with DeepSeek integration
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Main React component
│   │   ├── App.css         # Styles
│   │   └── main.jsx        # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js      # Vite config with API proxy
└── README.md
```

## 🔑 API Key

The DeepSeek API key is configured in `backend/app.py`.  
For production, set the `DEEPSEEK_API_KEY` environment variable.

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/review` | AI reviews text, returns suggestions |
| `POST` | `/api/apply` | Human accepts/edits a suggestion, AI applies it |
| `POST` | `/api/regenerate` | Human rejects a suggestion, AI generates new one |

## 🧠 Model

Uses **deepseek-v4-flash** via DeepSeek's OpenAI-compatible API (`https://api.deepseek.com/v1`).
