import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Download,
  Filter,
  LockKeyhole,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const TOKEN_KEY = 'game-manager-auth-token'
const AGE_GROUP_OPTIONS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U19', 'Adult']
const LEAGUE_TYPE_OPTIONS = ['Recreational', 'Academy', 'OPL', 'ECRL', 'ECNL', 'Adult League']
const FIELD_ID_OPTIONS = ['101', '102', '103', '201', '202', '203', '301', '302', '303']
const STATUS_OPTIONS = ['Scheduling Needed', 'Scheduled', 'Completed']
const AVAILABILITY_OPTIONS = ['Available', 'Not Available']
const TIME_OPTIONS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
]

const emptyGameForm = {
  date: '',
  time: '',
  ageGroup: '',
  leagueType: '',
  fieldId: '',
  seniorRefsNeeded: 1,
  assistantRefsNeeded: 2,
  status: 'Scheduling Needed',
  locked: false,
}

const defaultGameFilters = {
  status: 'All',
  date: '',
  leagueType: '',
  ageGroup: '',
}

const defaultReportFilters = {
  date: '',
  referee: '',
  gameType: '',
  gameId: '',
}

const statusPills = ['All', 'Scheduling Needed', 'Scheduled', 'Completed']

function useRoute() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }, [])

  return { path, navigate }
}

async function apiRequest(path, options = {}, token = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error ?? 'Request failed.')
    error.status = response.status
    throw error
  }

  return data
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatTime(value) {
  const [hours, minutes] = value.split(':')
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function roleLabel(role) {
  if (role === 'admin') {
    return 'Administrator'
  }

  return role.charAt(0).toUpperCase() + role.slice(1)
}

function isScheduler(user) {
  return user.role === 'assignor' || user.role === 'admin'
}

function buildQuery(filters) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value)
    }
  })

  return params.toString()
}

function validateGameForm(form) {
  const required = ['date', 'time', 'ageGroup', 'leagueType', 'fieldId', 'status']
  const missing = required.some((field) => !String(form[field] ?? '').trim())
  const selectedDate = new Date(`${form.date}T00:00:00`)

  if (missing) {
    return 'Please complete all required game fields.'
  }

  if (Number.isNaN(selectedDate.getTime())) {
    return 'Game date must be valid.'
  }

  if (
    !AGE_GROUP_OPTIONS.includes(form.ageGroup) ||
    !LEAGUE_TYPE_OPTIONS.includes(form.leagueType) ||
    !FIELD_ID_OPTIONS.includes(form.fieldId) ||
    !STATUS_OPTIONS.includes(form.status) ||
    !TIME_OPTIONS.includes(form.time)
  ) {
    return 'Please use one of the allowed dropdown options.'
  }

  if (!Number.isInteger(Number(form.seniorRefsNeeded)) || !Number.isInteger(Number(form.assistantRefsNeeded))) {
    return 'Referee counts must be whole numbers.'
  }

  if (Number(form.seniorRefsNeeded) < 1 || Number(form.seniorRefsNeeded) > 2) {
    return 'Senior referees must be between 1 and 2.'
  }

  if (Number(form.assistantRefsNeeded) < 0 || Number(form.assistantRefsNeeded) > 2) {
    return 'Assistant referees must be between 0 and 2.'
  }

  return ''
}

function App() {
  const { path, navigate } = useRoute()
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) ?? '')
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [dataVersion, setDataVersion] = useState(0)

  useEffect(() => {
    let ignore = false

    async function loadSession() {
      if (!token) {
        setAuthChecked(true)
        return
      }

      try {
        const data = await apiRequest('/api/auth/me', {}, token)

        if (!ignore) {
          setUser(data.user)
        }
      } catch {
        window.localStorage.removeItem(TOKEN_KEY)
        setToken('')
        setUser(null)
      } finally {
        if (!ignore) {
          setAuthChecked(true)
        }
      }
    }

    loadSession()
    return () => {
      ignore = true
    }
  }, [token])

  useEffect(() => {
    if (!token || !user) {
      return undefined
    }

    let ignore = false

    async function loadNotifications() {
      try {
        const data = await apiRequest('/api/notifications', {}, token)

        if (!ignore) {
          setNotifications(data.notifications)
        }
      } catch {
        if (!ignore) {
          setNotifications([])
        }
      }
    }

    loadNotifications()
    return () => {
      ignore = true
    }
  }, [token, user])

  useEffect(() => {
    if (!token || !user) {
      return undefined
    }

    const events = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`)

    events.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data)
      setNotifications((current) => [{ ...notification, read: false }, ...current])

      if (notification.type.startsWith('game') || notification.type.startsWith('availability')) {
        setDataVersion((current) => current + 1)
      }

      if (window.Notification?.permission === 'granted') {
        new window.Notification(notification.title, { body: notification.body })
      }
    })

    return () => events.close()
  }, [token, user])

  useEffect(() => {
    if (!user || (path !== '/' && path !== '/login' && path !== '/register')) {
      return
    }

    navigate(user.role === 'referee' ? '/availability' : '/games')
  }, [navigate, path, user])

  function handleAuthSuccess(data) {
    window.localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
    navigate(data.user.role === 'referee' ? '/availability' : '/games')
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setUser(null)
    navigate('/login')
  }

  async function markAllNotificationsRead() {
    await apiRequest('/api/notifications/read-all', { method: 'POST' }, token)
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
  }

  if (!authChecked) {
    return (
      <main className="auth-page">
        <div className="auth-card loading-card">Loading NYSA Referee Staff...</div>
      </main>
    )
  }

  if (!user) {
    return (
      <AuthPage
        mode={path === '/register' ? 'register' : 'login'}
        navigate={navigate}
        onAuthSuccess={handleAuthSuccess}
      />
    )
  }

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const fallbackPath = user.role === 'referee' ? '/availability' : '/games'
  const allowedPaths = isScheduler(user)
    ? ['/games', '/monitor', '/notifications']
    : ['/games', '/availability', '/notifications']
  const currentPath = allowedPaths.includes(path) ? path : fallbackPath

  return (
    <AppFrame
      currentPath={currentPath}
      navigate={navigate}
      onLogout={handleLogout}
      unreadCount={unreadCount}
      user={user}
    >
      {currentPath === '/notifications' ? (
        <NotificationsPage
          notifications={notifications}
          onMarkAllRead={markAllNotificationsRead}
        />
      ) : null}

      {currentPath === '/games' ? (
        <GamesDashboard
          dataVersion={dataVersion}
          token={token}
          user={user}
        />
      ) : null}

      {currentPath === '/availability' ? (
        <RefereeAvailabilityPage
          dataVersion={dataVersion}
          token={token}
        />
      ) : null}

      {currentPath === '/monitor' ? (
        <AssignorMonitorPage
          dataVersion={dataVersion}
          token={token}
        />
      ) : null}
    </AppFrame>
  )
}

function AuthPage({ mode, navigate, onAuthSuccess }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'referee' })
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage({ type: '', text: '' })

    try {
      const data = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        body: isRegister
          ? form
          : {
              email: form.email,
              password: form.password,
            },
      })
      onAuthSuccess(data)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="page-kicker">Norman Youth Soccer Association</p>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-subtitle">
          {isRegister
            ? 'Register as a referee, assignor, or administrator to use the availability system.'
            : 'Sign in to manage game schedules and referee availability.'}
        </p>

        {message.text ? (
          <div className={`message-banner ${message.type}`}>{message.text}</div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister ? (
            <label>
              <span>Name</span>
              <input name="name" value={form.name} onChange={handleChange} required />
            </label>
          ) : null}

          <label>
            <span>Email</span>
            <input name="email" type="email" value={form.email} onChange={handleChange} required />
          </label>

          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              minLength="8"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          {isRegister ? (
            <label>
              <span>Role</span>
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="referee">Referee</option>
                <option value="assignor">Assignor</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
          ) : null}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => navigate(isRegister ? '/login' : '/register')}
        >
          {isRegister ? 'I already have an account' : 'Create a new account'}
        </button>
      </section>
    </main>
  )
}

function AppFrame({ children, currentPath, navigate, onLogout, unreadCount, user }) {
  const tabs = isScheduler(user)
    ? [
        { path: '/games', label: 'General View' },
        { path: '/monitor', label: 'Assignor View' },
        { path: '/notifications', label: 'Notifications' },
      ]
    : [
        { path: '/games', label: 'Games' },
        { path: '/availability', label: 'Referee View' },
        { path: '/notifications', label: 'Notifications' },
      ]

  async function requestBrowserNotifications() {
    if (!window.Notification || window.Notification.permission === 'granted') {
      return
    }

    await window.Notification.requestPermission()
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="app-nav">
          <div>
            <p className="page-kicker">NYSA Referee Staff</p>
            <strong>Availability Optimization</strong>
          </div>

          <nav className="route-tabs" aria-label="Primary">
            {tabs.map((tab) => (
              <button
                key={tab.path}
                type="button"
                className={currentPath === tab.path ? 'active' : ''}
                onClick={() => navigate(tab.path)}
              >
                {tab.label}
                {tab.path === '/notifications' && unreadCount > 0 ? <span>{unreadCount}</span> : null}
              </button>
            ))}
          </nav>

          <div className="account-menu">
            <button type="button" className="secondary-button compact-button" onClick={requestBrowserNotifications}>
              <Bell size={17} />
              Alerts
            </button>
            <div>
              <strong>{user.name}</strong>
              <span>{roleLabel(user.role)} | {user.email}</span>
            </div>
            <button type="button" className="icon-button" onClick={onLogout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {children}

        <button
          type="button"
          className="floating-bell"
          aria-label="Notifications"
          onClick={() => navigate('/notifications')}
        >
          <Bell size={28} />
          {unreadCount > 0 ? <span>{unreadCount}</span> : null}
        </button>
      </div>
    </main>
  )
}

function GamesDashboard({ dataVersion, token, user }) {
  const canManageGames = isScheduler(user)
  const [games, setGames] = useState([])
  const [filters, setFilters] = useState(defaultGameFilters)
  const [selectedIds, setSelectedIds] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(emptyGameForm)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  async function refreshGames() {
    setIsLoading(true)

    try {
      const data = await apiRequest('/api/games', {}, token)
      setGames(data.games)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadGames() {
      try {
        const data = await apiRequest('/api/games', {}, token)

        if (!ignore) {
          setGames(data.games)
        }
      } catch (error) {
        if (!ignore) {
          setMessage({ type: 'error', text: error.message })
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    loadGames()
    return () => {
      ignore = true
    }
  }, [dataVersion, token])

  const leagueOptions = useMemo(
    () => [...new Set([...LEAGUE_TYPE_OPTIONS, ...games.map((game) => game.leagueType)])].sort(),
    [games],
  )
  const ageGroupOptions = useMemo(
    () => [...new Set([...AGE_GROUP_OPTIONS, ...games.map((game) => game.ageGroup)])].sort(),
    [games],
  )

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const matchesStatus = filters.status === 'All' || game.status === filters.status
      const matchesDate = !filters.date || game.date === filters.date
      const matchesLeague = !filters.leagueType || game.leagueType === filters.leagueType
      const matchesAge = !filters.ageGroup || game.ageGroup === filters.ageGroup
      return matchesStatus && matchesDate && matchesLeague && matchesAge
    })
  }, [filters, games])

  const sortedGames = useMemo(() => {
    return [...filteredGames].sort((leftGame, rightGame) => {
      const leftDateTime = new Date(`${leftGame.date}T${leftGame.time}`)
      const rightDateTime = new Date(`${rightGame.date}T${rightGame.time}`)
      return leftDateTime - rightDateTime
    })
  }, [filteredGames])

  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const endOfWeekWindow = new Date(today)
    endOfWeekWindow.setDate(endOfWeekWindow.getDate() + 6)

    return {
      gamesThisWeek: games.filter((game) => {
        const gameDate = new Date(`${game.date}T00:00:00`)
        return gameDate >= today && gameDate <= endOfWeekWindow
      }).length,
      needingRefs: games.filter((game) => game.availabilitySummary?.stillNeeded > 0).length,
      locked: games.filter((game) => game.locked).length,
      responses: games.reduce((total, game) => total + (game.availabilitySummary?.responseCount ?? 0), 0),
    }
  }, [games])

  function resetForm() {
    setEditingId('')
    setForm(emptyGameForm)
  }

  function closeModal() {
    setIsModalOpen(false)
    resetForm()
  }

  function openCreateModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function handleFormChange(event) {
    const { checked, name, type, value } = event.target
    const nextValue =
      name === 'seniorRefsNeeded' || name === 'assistantRefsNeeded'
        ? Number(value)
        : type === 'checkbox'
          ? checked
          : value

    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }))
  }

  function handleFilterChange(event) {
    const { name, value } = event.target
    setFilters((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const error = validateGameForm(form)

    if (error) {
      setMessage({ type: 'error', text: error })
      return
    }

    setIsSaving(true)

    try {
      if (editingId) {
        const data = await apiRequest(
          `/api/games/${encodeURIComponent(editingId)}`,
          {
            method: 'PUT',
            body: form,
          },
          token,
        )
        setGames((current) => current.map((game) => (game.id === editingId ? data.game : game)))
        setMessage({ type: 'success', text: `Game ${editingId} updated.` })
      } else {
        const data = await apiRequest(
          '/api/games',
          {
            method: 'POST',
            body: form,
          },
          token,
        )
        setGames((current) => [...current, data.game])
        setMessage({ type: 'success', text: 'Game created successfully.' })
      }

      closeModal()
    } catch (submitError) {
      setMessage({ type: 'error', text: submitError.message })
    } finally {
      setIsSaving(false)
    }
  }

  function handleEdit(game) {
    setEditingId(game.id)
    setForm({
      date: game.date,
      time: game.time,
      ageGroup: game.ageGroup,
      leagueType: game.leagueType,
      fieldId: game.fieldId,
      seniorRefsNeeded: game.seniorRefsNeeded,
      assistantRefsNeeded: game.assistantRefsNeeded,
      status: game.status,
      locked: game.locked,
    })
    setIsModalOpen(true)
  }

  async function handleLockToggle(game) {
    try {
      const data = await apiRequest(
        `/api/games/${encodeURIComponent(game.id)}/lock`,
        {
          method: 'POST',
          body: { locked: !game.locked },
        },
        token,
      )
      setGames((current) => current.map((item) => (item.id === game.id ? data.game : item)))
      setMessage({ type: 'success', text: `${game.id} ${data.game.locked ? 'locked' : 'reopened'}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete ${id} and its availability responses?`)) {
      setMessage({ type: 'error', text: 'Delete cancelled.' })
      return
    }

    try {
      await apiRequest(`/api/games/${encodeURIComponent(id)}`, { method: 'DELETE' }, token)
      setGames((current) => current.filter((game) => game.id !== id))
      setMessage({ type: 'success', text: `${id} deleted.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  function toggleSelect(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleAllVisible() {
    const visibleIds = filteredGames.map((game) => game.id)
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    )
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one game first.' })
      return
    }

    if (!window.confirm(`Delete ${selectedIds.length} selected games and their availability responses?`)) {
      setMessage({ type: 'error', text: 'Bulk delete cancelled.' })
      return
    }

    try {
      await apiRequest(
        '/api/games/bulk-delete',
        {
          method: 'POST',
          body: { ids: selectedIds },
        },
        token,
      )
      setGames((current) => current.filter((game) => !selectedIds.includes(game.id)))
      setSelectedIds([])
      setMessage({ type: 'success', text: 'Selected games deleted.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const allVisibleSelected =
    filteredGames.length > 0 && filteredGames.every((game) => selectedIds.includes(game.id))

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="page-kicker">General View</p>
          <h1 className="hero-title">NYSA Game Schedule</h1>
          <p>
            {canManageGames
              ? 'Create and manage weekly games, referee requirements, and assignment locks.'
              : 'Review upcoming games before submitting your availability.'}
          </p>
        </div>

        {canManageGames ? (
          <div className="hero-actions">
            <button type="button" className="create-button" onClick={openCreateModal}>
              <Plus size={24} />
              <span>Create Game</span>
            </button>
          </div>
        ) : null}
      </section>

      {message.text ? (
        <div className={`message-banner ${message.type}`}>{message.text}</div>
      ) : null}

      <section className="stats-grid">
        <StatCard icon={<CalendarDays size={30} />} tone="blue" label="Games This Week" value={stats.gamesThisWeek} />
        <StatCard icon={<ClipboardList size={30} />} tone="amber" label="Need Referees" value={stats.needingRefs} />
        <StatCard icon={<LockKeyhole size={30} />} tone="green" label="Locked Games" value={stats.locked} />
        <StatCard icon={<Users size={30} />} tone="gray" label="Availability Responses" value={stats.responses} />
      </section>

      <section className="filter-panel">
        <div className="filter-row">
          <div className="filter-label">
            <Filter size={28} />
            <span>Filter:</span>
          </div>

          <div className="status-pills">
            {statusPills.map((status) => (
              <button
                key={status}
                type="button"
                className={filters.status === status ? 'active' : ''}
                onClick={() => setFilters((current) => ({ ...current, status }))}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="secondary-filters">
          <label>
            <span>Date</span>
            <input name="date" type="date" value={filters.date} onChange={handleFilterChange} />
          </label>

          <label>
            <span>League Type</span>
            <select name="leagueType" value={filters.leagueType} onChange={handleFilterChange}>
              <option value="">All</option>
              {leagueOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Age Group</span>
            <select name="ageGroup" value={filters.ageGroup} onChange={handleFilterChange}>
              <option value="">All</option>
              {ageGroupOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <button type="button" className="clear-button" onClick={() => setFilters(defaultGameFilters)}>
            Clear
          </button>
        </div>
      </section>

      <section className="games-panel">
        <div className="games-toolbar">
          <div>
            <h2>Scheduled Games</h2>
            <p>{isLoading ? 'Loading games...' : `${sortedGames.length} games shown`}</p>
          </div>

          <div className="toolbar-actions">
            <button type="button" className="secondary-button" onClick={refreshGames}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>

            {canManageGames ? (
              <>
                <label className="select-all">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  <span>Select visible</span>
                </label>
                <button type="button" className="bulk-delete" onClick={handleBulkDelete}>
                  <Trash2 size={16} />
                  <span>Delete Selected</span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="game-list">
          {canManageGames ? (
            <button type="button" className="add-game-tile" onClick={openCreateModal}>
              <Plus size={30} />
              <span>Add a game</span>
            </button>
          ) : null}

          {sortedGames.map((game) => (
            <article key={game.id} className="game-item">
              <div className="game-card-body">
                <div className="game-card-top">
                  {canManageGames ? (
                    <label className="game-select">
                      <input
                        className="row-checkbox"
                        type="checkbox"
                        checked={selectedIds.includes(game.id)}
                        onChange={() => toggleSelect(game.id)}
                        aria-label={`Select ${game.id}`}
                      />
                      <span>Select</span>
                    </label>
                  ) : (
                    <span className={`lock-badge ${game.locked ? 'locked' : ''}`}>
                      {game.locked ? 'Locked' : 'Open'}
                    </span>
                  )}

                  {canManageGames ? (
                    <div className="game-actions">
                      <button type="button" className="icon-button" onClick={() => handleLockToggle(game)} aria-label={game.locked ? 'Reopen game' : 'Lock game'}>
                        {game.locked ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}
                      </button>
                      <button type="button" className="icon-button" onClick={() => handleEdit(game)} aria-label="Edit game">
                        <Pencil size={18} />
                      </button>
                      <button type="button" className="icon-button danger" onClick={() => handleDelete(game.id)} aria-label="Delete game">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="game-summary">
                  <div className="game-topline">
                    <strong>{game.id}</strong>
                    <span className={`lock-badge ${game.locked ? 'locked' : ''}`}>
                      {game.locked ? 'Locked' : 'Open'}
                    </span>
                  </div>

                  <p className="game-subtitle">
                    {formatDate(game.date)} at {formatTime(game.time)}
                  </p>

                  <div className="game-meta">
                    <span>{game.ageGroup}</span>
                    <span>{game.leagueType}</span>
                    <span>Field {game.fieldId}</span>
                  </div>

                  <div className="game-detail-grid">
                    <div>
                      <p>Status</p>
                      <span className={`status-tag ${game.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {game.status}
                      </span>
                    </div>
                    <div>
                      <p>Available</p>
                      <strong>{game.availabilitySummary?.availableCount ?? 0}</strong>
                    </div>
                    <div>
                      <p>Still Needed</p>
                      <strong>{game.availabilitySummary?.stillNeeded ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="game-card-footer">
                {game.seniorRefsNeeded + game.assistantRefsNeeded} referee slots required
              </div>
            </article>
          ))}

          {!isLoading && sortedGames.length === 0 ? (
            <div className="empty-state grid-empty-state">
              <CalendarDays size={64} />
              <h3>No games found</h3>
              <p>Try changing the filters to see more games.</p>
            </div>
          ) : null}
        </div>
      </section>

      {isModalOpen ? (
        <GameModal
          editingId={editingId}
          form={form}
          isSaving={isSaving}
          onChange={handleFormChange}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}
    </>
  )
}

function StatCard({ icon, label, tone, value }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

function GameModal({ editingId, form, isSaving, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3>{editingId ? 'Edit Game' : 'Create Game'}</h3>
            <p>Assignor-controlled schedule fields from the requirements document.</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="game-form" onSubmit={onSubmit}>
          <label>
            <span>Date</span>
            <input name="date" type="date" value={form.date} onChange={onChange} required />
          </label>

          <label>
            <span>Time</span>
            <select name="time" value={form.time} onChange={onChange} required>
              <option value="">Select kickoff time</option>
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>{formatTime(option)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Level / Age Group</span>
            <select name="ageGroup" value={form.ageGroup} onChange={onChange} required>
              <option value="">Select age group</option>
              {AGE_GROUP_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label>
            <span>League Type</span>
            <select name="leagueType" value={form.leagueType} onChange={onChange} required>
              <option value="">Select league type</option>
              {LEAGUE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="wide-field">
            <span>Field ID</span>
            <select name="fieldId" value={form.fieldId} onChange={onChange} required>
              <option value="">Select field ID</option>
              {FIELD_ID_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Senior Refs Needed</span>
            <input
              name="seniorRefsNeeded"
              type="number"
              min="1"
              max="2"
              step="1"
              value={form.seniorRefsNeeded}
              onChange={onChange}
              required
            />
          </label>

          <label>
            <span>Assistant Refs Needed</span>
            <input
              name="assistantRefsNeeded"
              type="number"
              min="0"
              max="2"
              step="1"
              value={form.assistantRefsNeeded}
              onChange={onChange}
              required
            />
          </label>

          <label>
            <span>Status</span>
            <select name="status" value={form.status} onChange={onChange} required>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="check-field">
            <input name="locked" type="checkbox" checked={form.locked} onChange={onChange} />
            <span>Lock referee availability changes</span>
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Update Game' : 'Create Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RefereeAvailabilityPage({ dataVersion, token }) {
  const [games, setGames] = useState([])
  const [availability, setAvailability] = useState([])
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    setIsLoading(true)

    try {
      const [gameData, availabilityData] = await Promise.all([
        apiRequest('/api/games', {}, token),
        apiRequest('/api/availability', {}, token),
      ])
      setGames(gameData.games)
      setAvailability(availabilityData.availability)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadInitialData() {
      try {
        const [gameData, availabilityData] = await Promise.all([
          apiRequest('/api/games', {}, token),
          apiRequest('/api/availability', {}, token),
        ])

        if (!ignore) {
          setGames(gameData.games)
          setAvailability(availabilityData.availability)
        }
      } catch (error) {
        if (!ignore) {
          setMessage({ type: 'error', text: error.message })
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    loadInitialData()
    return () => {
      ignore = true
    }
  }, [dataVersion, token])

  const availabilityByGame = useMemo(() => {
    return new Map(availability.map((record) => [record.gameId, record]))
  }, [availability])

  const upcomingGames = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return games
      .filter((game) => new Date(`${game.date}T00:00:00`) >= today)
      .sort((left, right) => new Date(`${left.date}T${left.time}`) - new Date(`${right.date}T${right.time}`))
  }, [games])

  async function submitAvailability(game, status) {
    const existing = availabilityByGame.get(game.id)

    try {
      if (existing) {
        const data = await apiRequest(
          `/api/availability/${encodeURIComponent(existing.id)}`,
          {
            method: 'PUT',
            body: { status },
          },
          token,
        )
        setAvailability((current) => current.map((record) => (record.id === existing.id ? data.availability : record)))
        setMessage({ type: 'success', text: `Availability for ${game.id} updated.` })
      } else {
        const data = await apiRequest(
          '/api/availability',
          {
            method: 'POST',
            body: { gameId: game.id, status },
          },
          token,
        )
        setAvailability((current) => [...current, data.availability])
        setMessage({ type: 'success', text: `Availability for ${game.id} submitted.` })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function deleteAvailability(record) {
    if (!window.confirm(`Delete your response for ${record.gameId}?`)) {
      return
    }

    try {
      await apiRequest(`/api/availability/${encodeURIComponent(record.id)}`, { method: 'DELETE' }, token)
      setAvailability((current) => current.filter((item) => item.id !== record.id))
      setMessage({ type: 'success', text: `Availability for ${record.gameId} deleted.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="page-kicker">Referee View</p>
          <h1 className="hero-title">Submit Availability</h1>
          <p>Mark yourself Available or Not Available for upcoming games. Edited responses are marked with *.</p>
        </div>

        <div className="hero-actions">
          <button type="button" className="secondary-button" onClick={loadData}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </section>

      {message.text ? <div className={`message-banner ${message.type}`}>{message.text}</div> : null}

      <section className="games-panel">
        <div className="games-toolbar">
          <div>
            <h2>Upcoming Games</h2>
            <p>{isLoading ? 'Loading games...' : `${upcomingGames.length} games available`}</p>
          </div>
        </div>

        <div className="availability-list">
          {upcomingGames.map((game) => {
            const record = availabilityByGame.get(game.id)
            const disabled = game.locked

            return (
              <article key={game.id} className="availability-card">
                <div className="availability-card-main">
                  <div>
                    <div className="game-topline">
                      <strong>{game.id}</strong>
                      <span className={`lock-badge ${game.locked ? 'locked' : ''}`}>
                        {game.locked ? 'Locked' : 'Open'}
                      </span>
                    </div>
                    <p className="game-subtitle">
                      {formatDate(game.date)} at {formatTime(game.time)} | Field {game.fieldId}
                    </p>
                    <div className="game-meta">
                      <span>{game.ageGroup}</span>
                      <span>{game.leagueType}</span>
                      <span>{game.availabilitySummary?.stillNeeded ?? 0} referee slots still needed</span>
                    </div>
                  </div>

                  <div className="availability-response">
                    <p>My Response</p>
                    <strong>
                      {record ? record.status : 'No response'}
                      {record?.modified ? ' *' : ''}
                    </strong>
                    {record ? <span>Updated {formatDateTime(record.updatedAt)}</span> : null}
                  </div>
                </div>

                <div className="availability-actions">
                  {AVAILABILITY_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={record?.status === status ? 'primary-button' : 'secondary-button'}
                      disabled={disabled}
                      onClick={() => submitAvailability(game, status)}
                    >
                      {status}
                    </button>
                  ))}

                  {record ? (
                    <button type="button" className="bulk-delete" disabled={disabled} onClick={() => deleteAvailability(record)}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}

          {!isLoading && upcomingGames.length === 0 ? (
            <div className="empty-state">
              <CalendarDays size={64} />
              <h3>No upcoming games</h3>
              <p>The assignor has not entered games that need availability yet.</p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}

function AssignorMonitorPage({ dataVersion, token }) {
  const [games, setGames] = useState([])
  const [availability, setAvailability] = useState([])
  const [filters, setFilters] = useState(defaultReportFilters)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isLoading, setIsLoading] = useState(true)

  async function loadData(nextFilters = filters) {
    setIsLoading(true)

    try {
      const query = buildQuery(nextFilters)
      const [gameData, availabilityData] = await Promise.all([
        apiRequest('/api/games', {}, token),
        apiRequest(`/api/availability${query ? `?${query}` : ''}`, {}, token),
      ])
      setGames(gameData.games)
      setAvailability(availabilityData.availability)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadInitialData() {
      try {
        const query = buildQuery(filters)
        const [gameData, availabilityData] = await Promise.all([
          apiRequest('/api/games', {}, token),
          apiRequest(`/api/availability${query ? `?${query}` : ''}`, {}, token),
        ])

        if (!ignore) {
          setGames(gameData.games)
          setAvailability(availabilityData.availability)
        }
      } catch (error) {
        if (!ignore) {
          setMessage({ type: 'error', text: error.message })
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    loadInitialData()
    return () => {
      ignore = true
    }
  }, [dataVersion, filters, token])

  const gameOptions = useMemo(() => {
    return [...games].sort((left, right) => new Date(`${left.date}T${left.time}`) - new Date(`${right.date}T${right.time}`))
  }, [games])

  const gameReport = useMemo(() => {
    return gameOptions.map((game) => ({
      game,
      records: availability.filter((record) => record.gameId === game.id),
    }))
  }, [availability, gameOptions])

  function handleFilterChange(event) {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  async function updateAvailability(record, status) {
    try {
      const data = await apiRequest(
        `/api/availability/${encodeURIComponent(record.id)}`,
        {
          method: 'PUT',
          body: { status },
        },
        token,
      )
      setAvailability((current) => current.map((item) => (item.id === record.id ? data.availability : item)))
      setMessage({ type: 'success', text: `${record.refereeName}'s response updated.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function deleteAvailability(record) {
    if (!window.confirm(`Delete ${record.refereeName}'s response for ${record.gameId}?`)) {
      return
    }

    try {
      await apiRequest(`/api/availability/${encodeURIComponent(record.id)}`, { method: 'DELETE' }, token)
      setAvailability((current) => current.filter((item) => item.id !== record.id))
      setMessage({ type: 'success', text: 'Availability response deleted.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function sendReminders() {
    try {
      const data = await apiRequest('/api/notifications/reminders', { method: 'POST' }, token)
      setMessage({ type: 'success', text: `Reminder emails queued for ${data.sentCount} referees.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  function exportCsv() {
    const query = buildQuery(filters)
    const url = `/api/reports/availability.csv?token=${encodeURIComponent(token)}${query ? `&${query}` : ''}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="page-kicker">Assignor View</p>
          <h1 className="hero-title">Availability Monitoring</h1>
          <p>Review, filter, edit, and export referee availability responses from one dashboard.</p>
        </div>

        <div className="hero-actions">
          <button type="button" className="secondary-button" onClick={sendReminders}>
            <Mail size={18} />
            Send Reminders
          </button>
          <button type="button" className="create-button" onClick={exportCsv}>
            <Download size={22} />
            Export CSV
          </button>
        </div>
      </section>

      {message.text ? <div className={`message-banner ${message.type}`}>{message.text}</div> : null}

      <section className="filter-panel">
        <div className="filter-row">
          <div className="filter-label">
            <Filter size={28} />
            <span>Report Filters:</span>
          </div>
        </div>

        <div className="secondary-filters report-filters">
          <label>
            <span>Game Date</span>
            <input name="date" type="date" value={filters.date} onChange={handleFilterChange} />
          </label>
          <label>
            <span>Referee Name</span>
            <input name="referee" value={filters.referee} onChange={handleFilterChange} placeholder="Search referee" />
          </label>
          <label>
            <span>Game Type</span>
            <select name="gameType" value={filters.gameType} onChange={handleFilterChange}>
              <option value="">All</option>
              {LEAGUE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Specific Game</span>
            <select name="gameId" value={filters.gameId} onChange={handleFilterChange}>
              <option value="">All games</option>
              {gameOptions.map((game) => (
                <option key={game.id} value={game.id}>{game.id} | {game.date}</option>
              ))}
            </select>
          </label>
          <button type="button" className="clear-button" onClick={() => setFilters(defaultReportFilters)}>
            Clear
          </button>
          <button type="button" className="secondary-button" onClick={() => loadData()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <section className="monitor-grid">
        <div className="report-panel">
          <div className="games-toolbar">
            <div>
              <h2>Availability Responses</h2>
              <p>{isLoading ? 'Loading records...' : `${availability.length} responses shown`}</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Referee</th>
                  <th>Game</th>
                  <th>Availability</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {availability.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.refereeName}</strong>
                      <span>{record.refereeEmail}</span>
                    </td>
                    <td>
                      <strong>{record.gameId}</strong>
                      <span>{record.game ? `${record.game.date} | ${record.game.leagueType}` : 'Unknown game'}</span>
                    </td>
                    <td>
                      <select value={record.status} onChange={(event) => updateAvailability(record, event.target.value)}>
                        {AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      {record.modified ? <span className="modified-mark">*</span> : null}
                    </td>
                    <td>{formatDateTime(record.updatedAt)}</td>
                    <td>
                      <button type="button" className="icon-button danger" onClick={() => deleteAvailability(record)} aria-label="Delete availability">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

                {!isLoading && availability.length === 0 ? (
                  <tr>
                    <td colSpan="5">No availability responses match the current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-panel">
          <div className="games-toolbar">
            <div>
              <h2>Game Reports</h2>
              <p>Game-level coverage summary</p>
            </div>
          </div>

          <div className="game-report-list">
            {gameReport.map(({ game, records }) => (
              <article key={game.id} className="game-report-card">
                <div>
                  <strong>{game.id}</strong>
                  <p>{formatDate(game.date)} at {formatTime(game.time)} | {game.leagueType}</p>
                </div>
                <div className="report-counts">
                  <span>{game.availabilitySummary?.availableCount ?? 0} available</span>
                  <span>{game.availabilitySummary?.stillNeeded ?? 0} still needed</span>
                  <span>{records.length} filtered responses</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function NotificationsPage({ notifications, onMarkAllRead }) {
  return (
    <section className="notifications-panel">
      <div className="games-toolbar">
        <div>
          <h2>Notifications</h2>
          <p>{notifications.length} recent system events</p>
        </div>

        <button type="button" className="secondary-button" onClick={onMarkAllRead}>
          Mark All Read
        </button>
      </div>

      <div className="notification-list">
        {notifications.map((notification) => (
          <article
            key={notification.id}
            className={`notification-item ${notification.read ? '' : 'unread'}`}
          >
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
            </div>
            <time>{formatDateTime(notification.createdAt)}</time>
          </article>
        ))}

        {notifications.length === 0 ? (
          <div className="empty-state">
            <Bell size={60} />
            <h3>No notifications yet</h3>
            <p>Game, availability, and reminder events will appear here.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default App
