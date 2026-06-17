import { useState, useRef, useEffect } from 'react'

const API = '/api'

export default function App() {
  const [text, setText] = useState(
    "快速的棕色狐狸跳过了懒狗。这是美好的一天，鸟儿在唱歌。我想我们应该早点去，但现在太晚了。有许多事情要做，时间不够。"
  )
  const [suggestions, setSuggestions] = useState([])
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0)
  const [totalSuggestions, setTotalSuggestions] = useState(0)
  const [completedSuggestions, setCompletedSuggestions] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState('idle') // idle, reviewing, waiting, done
  const [history, setHistory] = useState([]) // track applied changes

  const textRef = useRef(null)

  // Check backend health on mount
  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.json())
      .then(d => console.log('Backend:', d))
      .catch(() => setError('后端无法连接。请运行: cd backend && python app.py'))
  }, [])

  // ── Step 1: Ask AI to review ──────────────────────────────────────

  const handleReview = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setFeedback('')
    setSuggestions([])
    setStatus('reviewing')

    try {
      const res = await fetch(`${API}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: '通用写作' }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Review failed')
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      setStatus(data.suggestions?.length ? 'waiting' : 'done')
      setCurrentSuggestionIndex(0)
      setTotalSuggestions(data.suggestions?.length || 0)
      setCompletedSuggestions(0)
      setTotalSuggestions(data.suggestions?.length || 0)
      setCompletedSuggestions(0)
      setCurrentSuggestionIndex(0)
      if (!data.suggestions?.length) {
        setFeedback('✨ 没有发现改进之处 — 您的文本很棒！')
      }
    } catch (e) {
      setError(e.message)
      setStatus('idle')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Accept a suggestion ───────────────────────────────────

  const handleAccept = async (suggestion, editedText) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          suggestion_id: suggestion.id,
          accepted: true,
          edited_suggestion: editedText || '',
          original: suggestion.original,
          suggested: suggestion.suggested,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Apply failed')
      const data = await res.json()

      setHistory(prev => [...prev, {
        action: editedText ? '已编辑' : '已接受',
        original: suggestion.original,
        result: editedText || suggestion.suggested,
        explanation: suggestion.explanation,
      }])

      setText(data.new_text)
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
      setCompletedSuggestions(prev => prev + 1)
      setFeedback(`✅ 已接受: "${suggestion.explanation}"`)

      if (suggestions.length <= 1) {
        setStatus('idle')
      } else {
        setCurrentSuggestionIndex(prev => Math.min(prev, suggestions.length - 2))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2b: Reject and get new suggestion ────────────────────────

  const handleReject = async (suggestion) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          original_segment: suggestion.original,
          rejected_type: suggestion.type,
          rejected_suggestion: suggestion.suggested,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Regenerate failed')
      const data = await res.json()

      // Replace the old suggestion with the new one
      setSuggestions(prev =>
        prev.map(s => (s.id === suggestion.id ? { ...data.suggestion, id: suggestion.id } : s))
      )
      setFeedback('🔄 已生成新建议。')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Skip a suggestion (mark as reviewed, no change) ───────

  const handleSkip = (suggestion) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    setCompletedSuggestions(prev => prev + 1)
    setFeedback(`⏭️ 已跳过关于 ${suggestion.type} 的建议。`)

    if (suggestions.length <= 1) {
      setStatus('idle')
    } else {
      setCurrentSuggestionIndex(prev => Math.min(prev, suggestions.length - 2))
    }
  }

  // ── Render helpers ────────────────────────────────────────────────

  const typeColors = {
    grammar: '#e74c3c',
    clarity: '#3498db',
    style: '#9b59b6',
    brevity: '#e67e22',
  }

  const typeLabels = {
    grammar: '📝 语法',
    clarity: '💡 清晰度',
    style: '🎨 风格',
    brevity: '✂️ 简洁度',
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🤖 人类反馈循环演示</h1>
        <p className="subtitle">AI 写作助手 — 由您掌控</p>
      </header>

      <main className="main">
        {/* ── 文本输入区 ── */}
        <section className="text-section">
          <label className="section-label">您的文本</label>
          <textarea
            ref={textRef}
            className="text-editor"
            value={text}
            onChange={e => { setText(e.target.value); setStatus('idle'); setSuggestions([]) }}
            placeholder="在此输入或粘贴您的文本..."
            rows={6}
          />
          <button
            className="btn btn-primary"
            onClick={handleReview}
            disabled={loading || !text.trim()}
          >
            {loading ? '⏳ AI 正在审阅...' : '🔍 请求 AI 审阅'}
          </button>
        </section>

        {/* ── 错误/反馈 ── */}
        {error && <div className="alert alert-error">{error}</div>}
        {feedback && !error && <div className="alert alert-info">{feedback}</div>}

        {/* ── 建议面板 (HITL 步骤) ── */}
        {status === 'waiting' && suggestions.length > 0 && (
          <section className="suggestions-section">
            <h2 className="section-label">
              🤔 AI 建议 (已完成 {completedSuggestions} / {totalSuggestions})
            </h2>

            <SuggestionCard
              suggestion={suggestions[currentSuggestionIndex]}
              index={currentSuggestionIndex}
              typeColors={typeColors}
              typeLabels={typeLabels}
              onAccept={handleAccept}
              onReject={handleReject}
              onSkip={handleSkip}
              disabled={loading}
              totalSuggestions={totalSuggestions}
              completedSuggestions={completedSuggestions}
            />
          </section>
        )}

        {/* ── 历史记录 ── */}
        {history.length > 0 && (
          <section className="history-section">
            <h2 className="section-label">📋 修改历史</h2>
            <ul className="history-list">
              {history.map((h, i) => (
                <li key={i} className="history-item">
                  <span className="history-action">
                    {h.action === '已编辑' ? '✏️ 已编辑' : '✅ 已接受'}:
                  </span>
                  <span className="history-detail"> {h.explanation}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>
          <strong>HITL 工作原理:</strong> AI 提议修改 → 您审查并决定 → AI 从您的选择中学习。
        </p>
      </footer>
    </div>
  )
}

// ── 建议卡片组件 ────────────────────────────────────────

function SuggestionCard({ suggestion, index, typeColors, typeLabels, onAccept, onReject, onSkip, disabled, totalSuggestions, completedSuggestions }) {
  const [editing, setEditing] = useState(false)
  const [editedValue, setEditedValue] = useState(suggestion.suggested)

  return (
    <div className="suggestion-card" style={{ borderLeftColor: typeColors[suggestion.type] || '#666' }}>
      <div className="suggestion-header">
        <span className="suggestion-badge" style={{ background: typeColors[suggestion.type] || '#666' }}>
          {typeLabels[suggestion.type] || suggestion.type}
        </span>
        <span className="suggestion-progress">第 {completedSuggestions + 1} / {totalSuggestions} 条</span>
      </div>

      <div className="suggestion-body">
        <div className="suggestion-row">
          <span className="label">原文:</span>
          <span className="original-text">"{suggestion.original}"</span>
        </div>

        {editing ? (
          <div className="suggestion-row edit-row">
            <span className="label">您的修改:</span>
            <input
              type="text"
              value={editedValue}
              onChange={e => setEditedValue(e.target.value)}
              className="edit-input"
              autoFocus
            />
          </div>
        ) : (
          <div className="suggestion-row">
            <span className="label">建议:</span>
            <span className="suggested-text">"{suggestion.suggested}"</span>
          </div>
        )}

        <p className="explanation">{suggestion.explanation}</p>

        <div className="suggestion-actions">
          {editing ? (
            <>
              <button
                className="btn btn-accept"
                disabled={disabled}
                onClick={() => { onAccept(suggestion, editedValue); setEditing(false) }}
              >
                ✅ 确认修改
              </button>
              <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditedValue(suggestion.suggested) }}>
                取消
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-accept" disabled={disabled} onClick={() => onAccept(suggestion, '')}>
                ✅ 接受
              </button>
              <button className="btn btn-edit" disabled={disabled} onClick={() => setEditing(true)}>
                ✏️ 编辑
              </button>
              <button className="btn btn-reject" disabled={disabled} onClick={() => onReject(suggestion)}>
                🔄 新建议
              </button>
              <button className="btn btn-ghost" disabled={disabled} onClick={() => onSkip(suggestion)}>
                ⏭️ 跳过
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
