import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Filter,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'

const STORAGE_KEY = 'game-manager-prototype-games'
const AGE_GROUP_OPTIONS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U19', 'Adult']
const LEAGUE_TYPE_OPTIONS = ['Recreational', 'Competitive', 'Tournament', 'Adult League']
const FIELD_ID_OPTIONS = ['101', '102', '103', '201', '202', '203', '301', '302', '303']
const STATUS_OPTIONS = ['Scheduling Needed', 'Scheduled', 'Completed']
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

const mockGames = [
  {
    id: 'GM-1001',
    date: '2026-05-03',
    time: '09:00',
    ageGroup: 'U12',
    leagueType: 'Recreational',
    fieldId: '101',
    seniorRefsNeeded: 1,
    assistantRefsNeeded: 2,
    status: 'Scheduled',
  },
  {
    id: 'GM-1002',
    date: '2026-05-04',
    time: '13:30',
    ageGroup: 'U16',
    leagueType: 'Competitive',
    fieldId: '201',
    seniorRefsNeeded: 1,
    assistantRefsNeeded: 2,
    status: 'Scheduling Needed',
  },
  {
    id: 'GM-1003',
    date: '2026-05-06',
    time: '18:30',
    ageGroup: 'Adult',
    leagueType: 'Adult League',
    fieldId: '301',
    seniorRefsNeeded: 1,
    assistantRefsNeeded: 2,
    status: 'Completed',
  },
]

const emptyForm = {
  date: '',
  time: '',
  ageGroup: '',
  leagueType: '',
  fieldId: '',
  seniorRefsNeeded: 1,
  assistantRefsNeeded: 2,
  status: 'Scheduled',
}

const defaultFilters = {
  status: 'All',
  date: '',
  leagueType: '',
  ageGroup: '',
}

const statusPills = ['All', 'Scheduling Needed', 'Scheduled', 'Completed']

function normalizeStatus(status) {
  if (status === 'Active') {
    return 'Scheduling Needed'
  }

  return status
}

function normalizeFieldId(game) {
  if (game.fieldId && FIELD_ID_OPTIONS.includes(game.fieldId)) {
    return game.fieldId
  }

  if (!game.location) {
    return ''
  }

  const legacyFieldMap = {
    'Northside Soccer Complex': '101',
    'River Park Field 2': '201',
    'West Stadium': '301',
    'East Training Grounds': '102',
    'Central Field 1': '202',
    'Field-101': '101',
    'Field-102': '102',
    'Field-201': '201',
    'Field-305': '301',
    'Field-410': '202',
  }

  return legacyFieldMap[game.location] ?? ''
}

function getStoredGames() {
  if (typeof window === 'undefined') {
    return mockGames
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return mockGames
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((game) => ({
          ...game,
          status: normalizeStatus(game.status),
          fieldId: normalizeFieldId(game),
        }))
      : mockGames
  } catch {
    return mockGames
  }
}

function nextGameId(games) {
  const maxId = games.reduce((max, game) => {
    const numericId = Number(game.id.replace('GM-', ''))
    return Number.isNaN(numericId) ? max : Math.max(max, numericId)
  }, 1000)

  return `GM-${maxId + 1}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
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

function validateForm(form) {
  const required = ['date', 'time', 'ageGroup', 'leagueType', 'fieldId', 'status']
  const missing = required.some((field) => !String(form[field] ?? '').trim())
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(`${form.date}T00:00:00`)
  const fieldIdLooksValid = FIELD_ID_OPTIONS.includes(form.fieldId)
  const ageGroupLooksValid = AGE_GROUP_OPTIONS.includes(form.ageGroup)
  const leagueLooksValid = LEAGUE_TYPE_OPTIONS.includes(form.leagueType)
  const statusLooksValid = STATUS_OPTIONS.includes(form.status)
  const timeLooksValid = TIME_OPTIONS.includes(form.time)

  if (missing) {
    return 'Please complete all required fields.'
  }

  if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
    return 'Game date must be today or later.'
  }

  if (
    !ageGroupLooksValid ||
    !leagueLooksValid ||
    !fieldIdLooksValid ||
    !statusLooksValid ||
    !timeLooksValid
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

  if (Number(form.seniorRefsNeeded) === 0 && Number(form.assistantRefsNeeded) === 0) {
    return 'At least one referee is required for each game.'
  }

  return ''
}

function App() {
  const [games, setGames] = useState(() => getStoredGames())
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedIds, setSelectedIds] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    // Frontend-only persistence for the prototype. No backend or API is used.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games))
  }, [games])

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => games.some((game) => game.id === id)))
  }, [games])

  const leagueOptions = useMemo(
    () => [...new Set(games.map((game) => game.leagueType))].sort(),
    [games],
  )
  const ageGroupOptions = useMemo(
    () => [...new Set(games.map((game) => game.ageGroup))].sort(),
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

  const stats = useMemo(() => {
    return {
      total: games.length,
      scheduled: games.filter((game) => game.status === 'Scheduled').length,
      schedulingNeeded: games.filter((game) => game.status === 'Scheduling Needed').length,
      completed: games.filter((game) => game.status === 'Completed').length,
    }
  }, [games])

  function resetForm() {
    setEditingId('')
    setForm(emptyForm)
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
    const { name, value } = event.target
    const nextValue =
      name === 'seniorRefsNeeded' || name === 'assistantRefsNeeded' ? Number(value) : value

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

  function handleStatusFilter(status) {
    setFilters((current) => ({
      ...current,
      status,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const error = validateForm(form)

    if (error) {
      setMessage({ type: 'error', text: error })
      return
    }

    if (editingId) {
      setGames((current) =>
        current.map((game) => (game.id === editingId ? { ...game, ...form, id: editingId } : game)),
      )
      setMessage({ type: 'success', text: `Game ${editingId} updated.` })
    } else {
      setGames((current) => [
        ...current,
        {
          ...form,
          id: nextGameId(current),
        },
      ])
      setMessage({ type: 'success', text: 'Game created successfully.' })
    }

    closeModal()
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
    })
    setIsModalOpen(true)
    setMessage({ type: 'success', text: `Editing ${game.id}.` })
  }

  function handleDelete(id) {
    if (!window.confirm(`Delete ${id}?`)) {
      setMessage({ type: 'error', text: 'Delete cancelled.' })
      return
    }

    setGames((current) => current.filter((game) => game.id !== id))
    setMessage({ type: 'success', text: `${id} deleted.` })
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

  function handleBulkDelete() {
    if (selectedIds.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one game first.' })
      return
    }

    if (!window.confirm(`Delete ${selectedIds.length} selected games?`)) {
      setMessage({ type: 'error', text: 'Bulk delete cancelled.' })
      return
    }

    setGames((current) => current.filter((game) => !selectedIds.includes(game.id)))
    setSelectedIds([])
    setMessage({ type: 'success', text: 'Selected games deleted.' })
  }

  const allVisibleSelected =
    filteredGames.length > 0 && filteredGames.every((game) => selectedIds.includes(game.id))

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <p className="page-kicker">Game Management Dashboard</p>

        <section className="hero-panel">
          <div>
            <h1>Game Manager</h1>
            <p>Organize and track your games with reminders</p>
          </div>

          <div className="hero-actions">
            <button type="button" className="create-button" onClick={openCreateModal}>
              <Plus size={24} />
              <span>Create Game</span>
            </button>
          </div>
        </section>

        {message.text ? (
          <div className={`message-banner ${message.type}`}>{message.text}</div>
        ) : null}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-icon blue">
              <CalendarDays size={30} />
            </div>
            <div>
              <p>Total Games</p>
              <strong>{stats.total}</strong>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-icon amber">
              <ClipboardList size={30} />
            </div>
            <div>
              <p>Scheduling Needed</p>
              <strong>{stats.schedulingNeeded}</strong>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-icon green">
              <ShieldCheck size={30} />
            </div>
            <div>
              <p>Scheduled</p>
              <strong>{stats.scheduled}</strong>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-icon gray">
              <CheckSquare size={30} />
            </div>
            <div>
              <p>Completed</p>
              <strong>{stats.completed}</strong>
            </div>
          </article>
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
                  onClick={() => handleStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="secondary-filters">
            <label>
              <span>Date</span>
              <input
                name="date"
                type="date"
                value={filters.date}
                onChange={handleFilterChange}
              />
            </label>

            <label>
              <span>League Type</span>
              <select
                name="leagueType"
                value={filters.leagueType}
                onChange={handleFilterChange}
              >
                <option value="">All</option>
                {leagueOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Age Group</span>
              <select name="ageGroup" value={filters.ageGroup} onChange={handleFilterChange}>
                <option value="">All</option>
                {ageGroupOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="clear-button"
              onClick={() => setFilters(defaultFilters)}
            >
              Clear
            </button>
          </div>
        </section>

        <section className="games-panel">
          <div className="games-toolbar">
            <div>
              <h2>Scheduled Games</h2>
              <p>{filteredGames.length} games shown</p>
            </div>

            <div className="toolbar-actions">
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
                <span>Select visible</span>
              </label>
              <button type="button" className="bulk-delete" onClick={handleBulkDelete}>
                <Trash2 size={16} />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>

          {filteredGames.length === 0 ? (
            <div className="empty-state">
              <CalendarDays size={84} />
              <h3>No games found</h3>
              <p>
                {games.length === 0
                  ? 'Create your first game to get started!'
                  : 'Try changing the filters to see more games.'}
              </p>
            </div>
          ) : (
            <div className="game-list">
              {filteredGames.map((game) => (
                <article key={game.id} className="game-item">
                  <div className="game-item-main">
                    <input
                      className="row-checkbox"
                      type="checkbox"
                      checked={selectedIds.includes(game.id)}
                      onChange={() => toggleSelect(game.id)}
                      aria-label={`Select ${game.id}`}
                    />

                    <div className="game-summary">
                      <div className="game-topline">
                        <strong>{game.id}</strong>
                        <span
                          className={`status-tag ${game.status
                            .toLowerCase()
                            .replace(/\s+/g, '-')}`}
                        >
                          {game.status}
                        </span>
                      </div>

                      <div className="game-meta">
                        <span>{formatDate(game.date)}</span>
                        <span>{formatTime(game.time)}</span>
                        <span>{game.ageGroup}</span>
                        <span>{game.leagueType}</span>
                      </div>

                      <div className="game-detail-grid">
                        <div>
                          <p>Field ID</p>
                          <strong>{game.fieldId}</strong>
                        </div>
                        <div>
                          <p>Senior Refs Needed</p>
                          <strong>{game.seniorRefsNeeded}</strong>
                        </div>
                        <div>
                          <p>Assistant Refs Needed</p>
                          <strong>{game.assistantRefsNeeded}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="game-actions">
                    <button type="button" className="icon-button" onClick={() => handleEdit(game)}>
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => handleDelete(game.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <button type="button" className="floating-bell" aria-label="Notifications">
          <Bell size={28} />
        </button>
      </div>

      {isModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Edit Game' : 'Create Game'}</h3>
                <p>Frontend-only prototype form with local storage persistence.</p>
              </div>
              <button type="button" className="close-button" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            <form className="game-form" onSubmit={handleSubmit}>
              <label>
                <span>Date</span>
                <input
                  name="date"
                  type="date"
                  value={form.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={handleFormChange}
                  required
                />
              </label>

              <label>
                <span>Time</span>
                <select name="time" value={form.time} onChange={handleFormChange} required>
                  <option value="">Select kickoff time</option>
                  {TIME_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatTime(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Age Group / Level</span>
                <select name="ageGroup" value={form.ageGroup} onChange={handleFormChange} required>
                  <option value="">Select age group</option>
                  {AGE_GROUP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>League Type</span>
                <select name="leagueType" value={form.leagueType} onChange={handleFormChange} required>
                  <option value="">Select league type</option>
                  {LEAGUE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wide-field">
                <span>Field ID</span>
                <select name="fieldId" value={form.fieldId} onChange={handleFormChange} required>
                  <option value="">Select field ID</option>
                  {FIELD_ID_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
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
                  onChange={handleFormChange}
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
                  onChange={handleFormChange}
                  required
                />
              </label>

              <label className="wide-field">
                <span>Status</span>
                <select name="status" value={form.status} onChange={handleFormChange} required>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  {editingId ? 'Update Game' : 'Create Game'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
