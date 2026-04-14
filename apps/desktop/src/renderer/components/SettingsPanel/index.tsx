import React, { useState, useEffect, useCallback } from 'react'
import './styles.css'

interface RemoteServerConfig {
  id: string
  name: string
  host: string
  port: number
  token?: string
}

interface RemoteConnectionInfo {
  config: RemoteServerConfig
  state: 'disconnected' | 'connecting' | 'connected'
}

export function SettingsPanel(): React.JSX.Element {
  const [remoteServers, setRemoteServers] = useState<RemoteConnectionInfo[]>([])
  const [newServer, setNewServer] = useState({ name: '', host: '', port: '9527', token: '' })

  useEffect(() => {
    loadRemoteServers()

    // Listen for real-time connection state changes from main process
    const unsubscribe = window.electronAPI.remote.onStateChange(
      (_event: unknown, data: { serverId: string; state: 'disconnected' | 'connecting' | 'connected' }) => {
        setRemoteServers(prev =>
          prev.map(s =>
            s.config.id === data.serverId ? { ...s, state: data.state } : s
          )
        )
      }
    )
    return () => { unsubscribe() }
  }, [])

  const loadRemoteServers = useCallback(async () => {
    try {
      const servers = await window.electronAPI.remote.listServers() as RemoteConnectionInfo[]
      setRemoteServers(servers)
    } catch { /* ignore */ }
  }, [])

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

      <div className="settings-panel__body">
        <section className="settings-section">
          <h3 className="settings-section__title">远程设备</h3>

          {/* Server list */}
          {remoteServers.map((server) => (
            <div key={server.config.id} className="remote-server-card">
              <div className="remote-server-card__info">
                <div className="remote-server-card__header">
                  <span className={`remote-server-card__status remote-server-card__status--${server.state}`} />
                  <span className="remote-server-card__name">{server.config.name}</span>
                </div>
                <span className="remote-server-card__address">
                  {server.config.host}:{server.config.port}
                </span>
                <span className="remote-server-card__state">
                  {server.state === 'connected' ? '已连接' : server.state === 'connecting' ? '连接中...' : '未连接'}
                </span>
              </div>
              <div className="remote-server-card__actions">
                <button
                  className={`remote-server-card__btn remote-server-card__btn--${server.state === 'connected' ? 'disconnect' : 'connect'}`}
                  onClick={() => handleToggleConnection(server)}
                  title={server.state === 'connected' ? '断开' : '连接'}
                >
                  {server.state === 'connected' ? '断开' : '连接'}
                </button>
                <button
                  className="remote-server-card__btn remote-server-card__btn--remove"
                  onClick={() => handleRemoveServer(server.config.id)}
                  title="移除"
                >
                  移除
                </button>
              </div>
            </div>
          ))}

          {/* Add new server form */}
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
      </div>
    </div>
  )
}
