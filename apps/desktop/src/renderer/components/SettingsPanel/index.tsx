import React, { useState, useEffect, useCallback } from 'react'
import './styles.css'
import cbIcon from '../../assets/cb-icon.png'

interface RemoteServerConfig {
  id: string
  name: string
  host: string
  port: number
  token?: string
}

interface RemoteConnectionInfo {
  config: RemoteServerConfig
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  nextReconnectAt?: number
}

type TabId = 'remote' | 'notification' | 'about'

const TABS: { id: TabId; label: string }[] = [
  { id: 'remote', label: '远程设备' },
  { id: 'notification', label: '通知' },
  { id: 'about', label: '关于' },
]

const NOTIFICATION_TYPES = [
  { key: 'approval' as const, icon: '🔐', label: '请求授权', desc: '等待用户授权操作' },
  { key: 'error' as const, icon: '❌', label: '执行出错', desc: '命令执行出错' },
  { key: 'input' as const, icon: '💬', label: '等待输入', desc: '等待用户输入' },
  { key: 'done' as const, icon: '✅', label: '任务完成', desc: '任务执行完成' },
]

export function SettingsPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('remote')
  const [remoteServers, setRemoteServers] = useState<RemoteConnectionInfo[]>([])
  const [newServer, setNewServer] = useState({ name: '', host: '', port: '9527', token: '' })
  const [autoCloseConfig, setAutoCloseConfig] = useState<Record<string, number | boolean>>({
    approval: 0, error: 30, input: 15, done: 15,
  })
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    loadRemoteServers()
    loadNotificationConfig()

    window.electronAPI.getAppVersion().then(v => setAppVersion(v)).catch(() => {})

    const unsubscribeNav = window.electronAPI.onNavigateToSettingsTab(
      (_event: unknown, tab: string) => {
        if (tab === 'about') setActiveTab('about')
      }
    )

    const unsubscribe = window.electronAPI.remote.onStateChange(
      (_event: unknown, data) => {
        setRemoteServers(prev =>
          prev.map(s =>
            s.config.id === data.serverId ? { ...s, state: data.state as RemoteConnectionInfo['state'], nextReconnectAt: data.nextReconnectAt } : s
          )
        )
      }
    )
    return () => { unsubscribe(); unsubscribeNav() }
  }, [])

  const loadRemoteServers = useCallback(async () => {
    try {
      const servers = await window.electronAPI.remote.listServers() as RemoteConnectionInfo[]
      setRemoteServers(servers)
    } catch { /* ignore */ }
  }, [])

  const loadNotificationConfig = useCallback(async () => {
    try {
      const config = await window.electronAPI.notification.getConfig() as Record<string, number | boolean>
      setAutoCloseConfig(config)
    } catch { /* ignore */ }
  }, [])

  const handleAutoCloseChange = useCallback((key: string, value: number) => {
    const clamped = Math.max(5, Math.min(300, value))
    const newConfig = { ...autoCloseConfig, [key]: clamped }
    setAutoCloseConfig(newConfig)
    window.electronAPI.notification.setConfig(newConfig)
  }, [autoCloseConfig])

  const handleAutoCloseModeChange = useCallback((key: string, never: boolean) => {
    const newConfig = { ...autoCloseConfig, [key]: never ? 0 : 5 }
    setAutoCloseConfig(newConfig)
    window.electronAPI.notification.setConfig(newConfig)
  }, [autoCloseConfig])

  const handleAddServer = useCallback(async () => {
    if (!newServer.host.trim()) return
    const serverConfig: RemoteServerConfig = {
      id: `rs_${Date.now()}`,
      name: newServer.name.trim() || newServer.host.trim(),
      host: newServer.host.trim(),
      port: parseInt(newServer.port, 10) || 9527,
      token: newServer.token.trim() || undefined,
    }
    await window.electronAPI.remote.addServer(serverConfig as unknown as Record<string, unknown>)
    setNewServer({ name: '', host: '', port: '9527', token: '' })
    loadRemoteServers()
  }, [newServer, loadRemoteServers])

  const handleRemoveServer = useCallback(async (serverId: string) => {
    await window.electronAPI.remote.removeServer(serverId)
    loadRemoteServers()
  }, [loadRemoteServers])

  const handleToggleConnection = useCallback(async (server: RemoteConnectionInfo) => {
    if (server.state === 'connected') {
      await window.electronAPI.remote.disconnect(server.config.id)
    } else {
      await window.electronAPI.remote.connect(server.config.id)
    }
    loadRemoteServers()
  }, [loadRemoteServers])

  const handleClose = useCallback(() => {
    window.electronAPI.closeWindow()
  }, [])

  return (
    <div className="settings-panel">
      <div className="settings-panel__header">
        <span className="settings-panel__title">设置</span>
        <button className="settings-panel__close" onClick={handleClose} title="关闭">
          ×
        </button>
      </div>

      <div className="settings-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-panel__body">
        {activeTab === 'remote' && (
          <section className="settings-section">
            {remoteServers.map((server) => (
              <RemoteServerCard
                key={server.config.id}
                server={server}
                onToggle={handleToggleConnection}
                onRemove={handleRemoveServer}
              />
            ))}

            <div className="remote-server-form">
              <div className="settings-field">
                <span className="settings-field__label">名称</span>
                <input
                  type="text"
                  className="settings-field__input"
                  value={newServer.name}
                  onChange={(e) => setNewServer((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="My Remote"
                />
              </div>
              <div className="remote-server-form__row">
                <div className="settings-field" style={{ flex: 2 }}>
                  <span className="settings-field__label">主机地址</span>
                  <input
                    type="text"
                    className="settings-field__input"
                    value={newServer.host}
                    onChange={(e) => setNewServer((prev) => ({ ...prev, host: e.target.value }))}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="settings-field" style={{ flex: 1 }}>
                  <span className="settings-field__label">端口</span>
                  <input
                    type="number"
                    className="settings-field__input"
                    value={newServer.port}
                    onChange={(e) => setNewServer((prev) => ({ ...prev, port: e.target.value }))}
                    placeholder="9527"
                  />
                </div>
              </div>
              <div className="settings-field">
                <span className="settings-field__label">Token (可选)</span>
                <input
                  type="password"
                  className="settings-field__input"
                  value={newServer.token}
                  onChange={(e) => setNewServer((prev) => ({ ...prev, token: e.target.value }))}
                  placeholder="认证令牌"
                />
              </div>
              <button
                className="remote-server-form__add-btn"
                onClick={handleAddServer}
                disabled={!newServer.host.trim()}
              >
                + 添加服务器
              </button>
            </div>
          </section>
        )}

        {activeTab === 'notification' && (
          <section className="settings-section">
            <h3 className="settings-section__title">通知气泡设置</h3>
            <p className="settings-section__desc">配置状态通知气泡的自动关闭时间</p>
            {NOTIFICATION_TYPES.map(({ key, icon, label, desc }) => {
              const val = autoCloseConfig[key] ?? 0
              const isNever = val === 0
              return (
                <div key={key} className="notification-config-card">
                  <div className="notification-config-card__header">
                    <span className="notification-config-card__icon">{icon}</span>
                    <span className="notification-config-card__label">{label}</span>
                    <label className="notification-config-card__radio">
                      <input
                        type="radio"
                        name={`nc-${key}`}
                        checked={isNever}
                        onChange={() => handleAutoCloseModeChange(key, true)}
                      />
                      <span>永不</span>
                    </label>
                    <label className="notification-config-card__radio">
                      <input
                        type="radio"
                        name={`nc-${key}`}
                        checked={!isNever}
                        onChange={() => handleAutoCloseModeChange(key, false)}
                      />
                      <span>自定义</span>
                    </label>
                  </div>
                  {!isNever && (
                    <div className="notification-config-card__slider-row">
                      <input
                        type="range"
                        className="notification-config-card__slider"
                        min={5}
                        max={300}
                        step={1}
                        value={val as number}
                        onChange={(e) => handleAutoCloseChange(key, parseInt(e.target.value, 10))}
                      />
                      <input
                        type="number"
                        className="notification-config-card__number"
                        min={5}
                        max={300}
                        value={val as number}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v)) handleAutoCloseChange(key, v)
                        }}
                      />
                      <span className="notification-config-card__unit">秒</span>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="notification-config-card">
              <div className="notification-config-card__header">
                <span className="notification-config-card__icon">⚡</span>
                <span className="notification-config-card__label">快速确认</span>
                <span className="notification-config-card__desc">在通知中直接允许普通权限</span>
                <label className="notification-config-card__toggle">
                  <input
                    type="checkbox"
                    checked={!!autoCloseConfig.quickApproval}
                    onChange={(e) => {
                      const newConfig = { ...autoCloseConfig, quickApproval: e.target.checked }
                      setAutoCloseConfig(newConfig)
                      window.electronAPI.notification.setConfig(newConfig)
                    }}
                  />
                  <span>{autoCloseConfig.quickApproval !== false ? '开启' : '关闭'}</span>
                </label>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'about' && (
          <section className="settings-section about-section">
            <img className="about-logo" src={cbIcon} alt="CB" />
            <h2 className="about-title">Coding-Bubble</h2>
            <p className="about-version">v{appVersion}</p>
            <p className="about-desc">AI 编程助手的轻量级伴侣</p>
            <a
              className="about-link"
              href="https://github.com/dmz2922990/Coding-Bubble"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </section>
        )}
      </div>
    </div>
  )
}

function RemoteServerCard({ server, onToggle, onRemove }: {
  server: RemoteConnectionInfo
  onToggle: (server: RemoteConnectionInfo) => void
  onRemove: (id: string) => void
}): React.JSX.Element {
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (server.state !== 'reconnecting' || !server.nextReconnectAt) {
      setCountdown(null)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((server.nextReconnectAt! - Date.now()) / 1000))
      setCountdown(remaining)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [server.state, server.nextReconnectAt])

  const stateText = server.state === 'connected' ? '已连接'
    : server.state === 'connecting' ? '连接中...'
    : server.state === 'reconnecting' ? (countdown !== null ? `重连中... ${countdown}s` : '重连中...')
    : '未连接'

  const btnLabel = server.state === 'connected' ? '断开'
    : server.state === 'reconnecting' ? '立即连接'
    : server.state === 'connecting' ? '连接中' : '连接'

  return (
    <div className="remote-server-card">
      <div className="remote-server-card__info">
        <div className="remote-server-card__header">
          <span className={`remote-server-card__status remote-server-card__status--${server.state}`} />
          <span className="remote-server-card__name">{server.config.name}</span>
        </div>
        <span className="remote-server-card__address">{server.config.host}:{server.config.port}</span>
        <span className="remote-server-card__state">{stateText}</span>
      </div>
      <div className="remote-server-card__actions">
        <button
          className={`remote-server-card__btn remote-server-card__btn--${server.state === 'connected' ? 'disconnect' : 'connect'}`}
          onClick={() => onToggle(server)}
          disabled={server.state === 'connecting'}
          title={btnLabel}
        >
          {btnLabel}
        </button>
        <button
          className="remote-server-card__btn remote-server-card__btn--remove"
          onClick={() => onRemove(server.config.id)}
          title="移除"
        >
          移除
        </button>
      </div>
    </div>
  )
}
