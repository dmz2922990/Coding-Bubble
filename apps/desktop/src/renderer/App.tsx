import React from 'react'
import { FloatingBall } from './components/FloatingBall'
import { ChatPanel } from './components/ChatPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { NotificationWindow } from './components/NotificationWindow'

const view = new URLSearchParams(window.location.search).get('view')

function App(): React.JSX.Element {
  if (view === 'panel') return <ChatPanel />
  if (view === 'settings') return <SettingsPanel />
  if (view === 'notification') return <NotificationWindow />
  return <FloatingBall />
}

export default App
