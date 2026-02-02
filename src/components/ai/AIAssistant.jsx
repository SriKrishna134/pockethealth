// ========================================
// STEP 7: REACT COMPONENT - AI ASSISTANT
// src/components/ai/AIAssistant.jsx
// ========================================

import { useState, useEffect, useRef } from 'react'
import { queryAI, getConversationHistory } from '../../services/aiService'

export default function AIAssistant() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load conversation history on mount
  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const history = await getConversationHistory(5)
      if (history && history.length > 0) {
        const formattedHistory = history.reverse().flatMap(conv => [
          { role: 'user', content: conv.prompt },
          { 
            role: 'assistant', 
            content: conv.response,
            sources: conv.source_doc_ids || []
          }
        ])
        setMessages(formattedHistory)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()
    setInputValue('')
    setError(null)

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Query AI
      const response = await queryAI(userMessage, {
        conversationId,
        topK: 5,
        useVectorSearch: true,
      })

      // Update conversation ID
      if (!conversationId) {
        setConversationId(response.conversationId)
      }

      // Add AI response to chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        tokensUsed: response.tokensUsed,
      }])
    } catch (err) {
      setError(err.message || 'Failed to get response')
      // Add error message to chat
      setMessages(prev => [...prev, {
        role: 'error',
        content: err.message || 'Sorry, I encountered an error. Please try again.',
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const clearConversation = () => {
    setMessages([])
    setConversationId(null)
    setError(null)
  }

  return (
    <div className="ai-assistant-container">
      {/* Header */}
      <div className="assistant-header">
        <div>
          <h2>🤖 PocketHealth AI Assistant</h2>
          <p>Ask questions about your medical records and get intelligent answers</p>
        </div>
        <button onClick={clearConversation} className="clear-btn">
          Clear Chat
        </button>
      </div>

      {/* Messages Container */}
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <h3>Welcome! How can I help you today?</h3>
            <div className="suggestions">
              <button onClick={() => setInputValue("What were my symptoms in my last visit?")}>
                📋 View recent symptoms
              </button>
              <button onClick={() => setInputValue("Summarize my medical history")}>
                📊 Get summary
              </button>
              <button onClick={() => setInputValue("What medications am I currently taking?")}>
                💊 Current medications
              </button>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.role === 'user' && <strong>You:</strong>}
              {message.role === 'assistant' && <strong>AI Assistant:</strong>}
              {message.role === 'error' && <strong>⚠️ Error:</strong>}
              <p>{message.content}</p>

              {/* Show sources if available */}
              {message.sources && message.sources.length > 0 && (
                <div className="sources">
                  <strong>📚 Sources:</strong>
                  <ul>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        {source.title || `Record ${source.id}`}
                        {source.similarity && ` (${(source.similarity * 100).toFixed(0)}% match)`}
                        {source.date && ` - ${new Date(source.date).toLocaleDateString()}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Show token usage for debugging */}
              {message.tokensUsed && (
                <small className="token-info">Tokens used: {message.tokensUsed}</small>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <strong>AI Assistant:</strong>
              <p className="loading">Thinking<span className="dots">...</span></p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-container">
        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me anything about your medical records..."
          disabled={isLoading}
          rows={3}
        />
        <button 
          onClick={handleSendMessage} 
          disabled={!inputValue.trim() || isLoading}
          className="send-btn"
        >
          {isLoading ? 'Sending...' : 'Send →'}
        </button>
      </div>

      {/* Usage Info */}
      <div className="usage-info">
        <small>💡 Tip: Ask specific questions about your medical history, medications, or appointments</small>
      </div>

      <style jsx>{`
        .ai-assistant-container {
          max-width: 800px;
          margin: 0 auto;
          height: calc(100vh - 100px);
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .assistant-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .assistant-header h2 {
          margin: 0;
          font-size: 24px;
        }

        .assistant-header p {
          margin: 5px 0 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .clear-btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .clear-btn:hover {
          background: rgba(255,255,255,0.3);
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f8f9fa;
        }

        .welcome-message {
          text-align: center;
          padding: 40px 20px;
        }

        .welcome-message h3 {
          color: #333;
          margin-bottom: 30px;
        }

        .suggestions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 400px;
          margin: 0 auto;
        }

        .suggestions button {
          background: white;
          border: 2px solid #667eea;
          color: #667eea;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .suggestions button:hover {
          background: #667eea;
          color: white;
        }

        .message {
          margin-bottom: 20px;
          animation: fadeIn 0.3s;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message.user .message-content {
          background: #667eea;
          color: white;
          margin-left: auto;
          max-width: 70%;
        }

        .message.assistant .message-content {
          background: white;
          border: 1px solid #e0e0e0;
          max-width: 85%;
        }

        .message.error .message-content {
          background: #fee;
          border: 1px solid #fcc;
          color: #c00;
          max-width: 85%;
        }

        .message-content {
          padding: 15px;
          border-radius: 12px;
          word-wrap: break-word;
        }

        .message-content strong {
          display: block;
          margin-bottom: 8px;
          font-size: 12px;
          opacity: 0.8;
        }

        .message-content p {
          margin: 0;
          line-height: 1.5;
        }

        .sources {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
          font-size: 13px;
        }

        .sources strong {
          display: block;
          margin-bottom: 6px;
        }

        .sources ul {
          margin: 0;
          padding-left: 20px;
        }

        .sources li {
          margin: 4px 0;
          color: #666;
        }

        .token-info {
          display: block;
          margin-top: 8px;
          color: #999;
          font-size: 11px;
        }

        .loading {
          display: inline-block;
        }

        .dots {
          animation: ellipsis 1.5s infinite;
        }

        @keyframes ellipsis {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
        }

        .input-container {
          padding: 20px;
          background: white;
          border-top: 1px solid #e0e0e0;
        }

        .error-banner {
          background: #fee;
          border: 1px solid #fcc;
          color: #c00;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 10px;
          font-size: 14px;
        }

        textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          resize: none;
          transition: border-color 0.2s;
        }

        textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        textarea:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .send-btn {
          margin-top: 10px;
          width: 100%;
          background: #667eea;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          background: #5568d3;
        }

        .send-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .usage-info {
          padding: 10px 20px;
          background: #f8f9fa;
          border-top: 1px solid #e0e0e0;
          text-align: center;
        }

        .usage-info small {
          color: #666;
        }
      `}</style>
    </div>
  )
}
