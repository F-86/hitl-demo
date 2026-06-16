import { useState, useRef, useEffect } from 'react'

const API = '/api'

export default function App() {
  const [text, setText] = useState(
    "The quick brown fox jump over the lazy dog. Its a beautiful day, and the birds is singing. I think we should of gone earlier, but its too late now. Their are many things to do and not enough time for it."
  )
  const [suggestions, setSuggestions] = useState([])
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
      .catch(() => setError('Backend not reachable. Start it with: cd backend && python app.py'))
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
        body: JSON.stringify({ text, context: 'general writing' }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Review failed')
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      setStatus(data.suggestions?.length ? 'waiting' : 'done')
      if (!data.suggestions?.length) {
        setFeedback('✨ No improvements found — your text looks great!')
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
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Apply failed')
      const data = await res.json()

      setHistory(prev => [...prev, {
        action: editedText ? 'edited' : 'accepted',
        original: suggestion.original,
        result: editedText || suggestion.suggested,
        explanation: suggestion.explanation,
      }])

      setText(data.new_text)
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
      setFeedback(`✅ Accepted: "${suggestion.explanation}"`)
      setStatus(suggestions.length <= 1 ? 'idle' : 'waiting')
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
        body: JSON.stringify({ text, rejected_id: suggestion.id }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Regenerate failed')
      const data = await res.json()

      // Replace the old suggestion with the new one
      setSuggestions(prev =>
        prev.map(s => (s.id === suggestion.id ? { ...data.suggestion, id: suggestion.id } : s))
      )
      setFeedback('🔄 Generated a new suggestion.')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Skip a suggestion (mark as reviewed, no change) ───────

  const handleSkip = (suggestion) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    setFeedback(`⏭️ Skipped suggestion about ${suggestion.type}.`)
    if (suggestions.length <= 1) setStatus('idle')
  }

  // ── Render helpers ────────────────────────────────────────────────

  const typeColors = {
    grammar: '#e74c3c',
    clarity: '#3498db',
    style: '#9b59b6',
    brevity: '#e67e22',
  }

  const typeLabels = {
    grammar: '📝 Grammar',
    clarity: '💡 Clarity',
    style: '🎨 Style',
    brevity: '✂️ Brevity',
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🤖 Human-in-the-Loop Demo</h1>
        <p className="subtitle">AI Writing Assistant — You're in Control</p>
      </header>

      <main className="main">
        {/* ── Text input area ── */}
        <section className="text-section">
          <label className="section-label">Your Text</label>
          <textarea
            ref={textRef}
            className="text-editor"
            value={text}
            onChange={e => { setText(e.target.value); setStatus('idle'); setSuggestions([]) }}
            placeholder="Write or paste your text here..."
            rows={6}
          />
          <button
            className="btn btn-primary"
            onClick={handleReview}
            disabled={loading || !text.trim()}
          >
            {loading ? '⏳ AI is reviewing...' : '🔍 Ask AI to Review'}
          </button>
        </section>

        {/* ── Error / Feedback ── */}
        {error && <div className="alert alert-error">{error}</div>}
        {feedback && !error && <div className="alert alert-info">{feedback}</div>}

        {/* ── Suggestions panel (HITL step) ── */}
        {status === 'waiting' && suggestions.length > 0 && (
          <section className="suggestions-section">
            <h2 className="section-label">
              🤔 AI Suggestions ({suggestions.length} remaining)
            </h2>
            <p className="hint">
              Review each suggestion. <strong>Accept</strong>, <strong>Edit & Accept</strong>,
              or <strong>Reject</strong> for a new one. <strong>Skip</strong> to ignore.
            </p>

            {suggestions.map((sug, idx) => (
              <SuggestionCard
                key={sug.id}
                suggestion={sug}
                index={idx}
                typeColors={typeColors}
                typeLabels={typeLabels}
                onAccept={handleAccept}
                onReject={handleReject}
                onSkip={handleSkip}
                disabled={loading}
              />
            ))}
          </section>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <section className="history-section">
            <h2 className="section-label">📋 Change History</h2>
            <ul className="history-list">
              {history.map((h, i) => (
                <li key={i} className="history-item">
                  <span className="history-action">
                    {h.action === 'edited' ? '✏️ Edited' : '✅ Accepted'}:
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
          <strong>How HITL works:</strong> AI proposes edits → You review & decide → AI learns from your choices.
        </p>
      </footer>
    </div>
  )
}

// ── Suggestion Card Component ────────────────────────────────────────

function SuggestionCard({ suggestion, index, typeColors, typeLabels, onAccept, onReject, onSkip, disabled }) {
  const [editing, setEditing] = useState(false)
  const [editedValue, setEditedValue] = useState(suggestion.suggested)
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="suggestion-card" style={{ borderLeftColor: typeColors[suggestion.type] || '#666' }}>
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <span className="suggestion-badge" style={{ background: typeColors[suggestion.type] || '#666' }}>
          {typeLabels[suggestion.type] || suggestion.type}
        </span>
        <span className="suggestion-num">#{index + 1}</span>
        <span className="expand-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="suggestion-body">
          <div className="suggestion-row">
            <span className="label">Original:</span>
            <span className="original-text">"{suggestion.original}"</span>
          </div>

          {editing ? (
            <div className="suggestion-row edit-row">
              <span className="label">Your Edit:</span>
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
              <span className="label">Suggested:</span>
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
                  ✅ Confirm Edit
                </button>
                <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditedValue(suggestion.suggested) }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-accept" disabled={disabled} onClick={() => onAccept(suggestion, '')}>
                  ✅ Accept
                </button>
                <button className="btn btn-edit" disabled={disabled} onClick={() => setEditing(true)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-reject" disabled={disabled} onClick={() => onReject(suggestion)}>
                  🔄 New Suggestion
                </button>
                <button className="btn btn-ghost" disabled={disabled} onClick={() => onSkip(suggestion)}>
                  ⏭️ Skip
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
