import React, { useCallback, useEffect } from 'react'
import './styles.css'

export function ChatPanel(): React.JSX.Element {
  const handleClose = useCallback(() => {
    window.electronAPI.closeWindow()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClose])

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <div className="chat-panel__title">对话</div>
        <button className="chat-panel__close" onClick={handleClose} title="关闭">×</button>
      </div>

      <div className="chat-panel__content">
        <div className="chat-panel__empty">
          有什么可以帮你的？🐾
        </div>
      </div>
    </div>
  )
}
