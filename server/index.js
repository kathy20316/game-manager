import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const legacyDbPath = path.join(rootDir, 'data', 'db.json')
const distDir = path.join(rootDir, 'dist')
loadEnvFile(path.join(rootDir, '.env'))
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 5174)
const tokenSecret = process.env.AUTH_SECRET ?? 'game-manager-local-dev-secret'
const databaseUrl = process.env.DATABASE_URL
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    })
  : null
let dbReady = false

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '')

    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

const AGE_GROUP_OPTIONS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U19', 'Adult']
const LEAGUE_TYPE_OPTIONS = ['Recreational', 'Academy', 'OPL', 'ECRL', 'ECNL', 'Adult League']
const FIELD_ID_OPTIONS = ['101', '102', '103', '201', '202', '203', '301', '302', '303']
const STATUS_OPTIONS = ['Scheduling Needed', 'Scheduled', 'Completed']
const AVAILABILITY_OPTIONS = ['Available', 'Not Available']
const ROLE_OPTIONS = ['referee', 'assignor', 'admin']
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

const seedGames = [
  {
    id: 'GM-1001',
    date: '2026-05-03',
    time: '09:00',
    ageGroup: 'U12',
    leagueType: 'Recreational',
    fieldId: '101',
    seniorRefsNeeded: 1,
    assistantRefsNeeded: 2,
    status: 'Scheduling Needed',
    locked: false,
  },
  {
    id: 'GM-1002',
    date: '2026-05-04',
    time: '13:30',
    ageGroup: 'U16',
    leagueType: 'OPL',
    fieldId: '201',
    seniorRefsNeeded: 1,
    assistantRefsNeeded: 2,
    status: 'Scheduling Needed',
    locked: false,
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
    status: 'Scheduled',
    locked: true,
  },
]

const notificationClients = new Set()

function createInitialDb() {
  return {
    users: [],
    games: seedGames,
    availability: [],
    notifications: [
      {
        id: `N-${Date.now()}`,
        type: 'system',
        title: 'NYSA referee system is online',
        body: 'Game schedules, role access, and availability tracking are ready.',
        createdAt: new Date().toISOString(),
        readBy: [],
      },
    ],
  }
}

async function ensureDb() {
  if (dbReady) {
    return
  }

  if (!pool) {
    throw new Error('DATABASE_URL is required. Create a PostgreSQL database and set DATABASE_URL before starting the server.')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      age_group TEXT NOT NULL,
      league_type TEXT NOT NULL,
      field_id TEXT NOT NULL,
      senior_refs_needed INTEGER NOT NULL,
      assistant_refs_needed INTEGER NOT NULL,
      status TEXT NOT NULL,
      locked BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS availability (
      id TEXT PRIMARY KEY,
      referee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      modified BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (referee_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      read_by TEXT[] NOT NULL DEFAULT '{}'
    );
  `)

  await seedPostgresIfEmpty()
  dbReady = true
}

function normalizeDb(db) {
  const normalized = {
    users: Array.isArray(db.users) ? db.users : [],
    games: Array.isArray(db.games) ? db.games : seedGames,
    availability: Array.isArray(db.availability) ? db.availability : [],
    notifications: Array.isArray(db.notifications) ? db.notifications : [],
  }

  normalized.users = normalized.users.map((user, index) => ({
    ...user,
    role: ROLE_OPTIONS.includes(user.role) ? user.role : index === 0 ? 'assignor' : 'referee',
  }))

  normalized.games = normalized.games.map((game) => ({
    ...game,
    leagueType: LEAGUE_TYPE_OPTIONS.includes(game.leagueType) ? game.leagueType : 'Recreational',
    locked: Boolean(game.locked),
  }))

  normalized.availability = normalized.availability.map((record) => ({
    ...record,
    modified: Boolean(record.modified),
  }))

  return normalized
}

async function seedPostgresIfEmpty() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM games) AS games,
      (SELECT COUNT(*)::int FROM notifications) AS notifications
  `)
  const counts = rows[0]

  if (counts.users > 0 || counts.games > 0 || counts.notifications > 0) {
    return
  }

  const initialDb = existsSync(legacyDbPath)
    ? JSON.parse(await readFile(legacyDbPath, 'utf8'))
    : createInitialDb()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await persistDbSnapshot(client, normalizeDb(initialDb))
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function readDb() {
  await ensureDb()
  const [usersResult, gamesResult, availabilityResult, notificationsResult] = await Promise.all([
    pool.query(`
      SELECT id, name, email, role, password_hash AS "passwordHash", created_at AS "createdAt"
      FROM users
      ORDER BY created_at ASC
    `),
    pool.query(`
      SELECT
        id,
        date,
        time,
        age_group AS "ageGroup",
        league_type AS "leagueType",
        field_id AS "fieldId",
        senior_refs_needed AS "seniorRefsNeeded",
        assistant_refs_needed AS "assistantRefsNeeded",
        status,
        locked
      FROM games
      ORDER BY date ASC, time ASC, id ASC
    `),
    pool.query(`
      SELECT
        id,
        referee_id AS "refereeId",
        game_id AS "gameId",
        status,
        submitted_at AS "submittedAt",
        updated_at AS "updatedAt",
        modified
      FROM availability
      ORDER BY updated_at DESC
    `),
    pool.query(`
      SELECT id, type, title, body, created_at AS "createdAt", read_by AS "readBy"
      FROM notifications
      ORDER BY created_at DESC
      LIMIT 80
    `),
  ])

  return normalizeDb({
    users: usersResult.rows.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
    games: gamesResult.rows,
    availability: availabilityResult.rows.map((record) => ({
      ...record,
      submittedAt: record.submittedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
    notifications: notificationsResult.rows.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      readBy: notification.readBy ?? [],
    })),
  })
}

async function persistDbSnapshot(client, db) {
  const normalized = normalizeDb(db)

  await client.query('DELETE FROM availability')
  await client.query('DELETE FROM notifications')
  await client.query('DELETE FROM games')
  await client.query('DELETE FROM users')

  for (const user of normalized.users) {
    await client.query(
      `
        INSERT INTO users (id, name, email, role, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [user.id, user.name, user.email, user.role, user.passwordHash, user.createdAt],
    )
  }

  for (const game of normalized.games) {
    await client.query(
      `
        INSERT INTO games (
          id,
          date,
          time,
          age_group,
          league_type,
          field_id,
          senior_refs_needed,
          assistant_refs_needed,
          status,
          locked
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        game.id,
        game.date,
        game.time,
        game.ageGroup,
        game.leagueType,
        game.fieldId,
        game.seniorRefsNeeded,
        game.assistantRefsNeeded,
        game.status,
        game.locked,
      ],
    )
  }

  for (const record of normalized.availability) {
    await client.query(
      `
        INSERT INTO availability (
          id,
          referee_id,
          game_id,
          status,
          submitted_at,
          updated_at,
          modified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        record.id,
        record.refereeId,
        record.gameId,
        record.status,
        record.submittedAt,
        record.updatedAt,
        record.modified,
      ],
    )
  }

  for (const notification of normalized.notifications) {
    await client.query(
      `
        INSERT INTO notifications (id, type, title, body, created_at, read_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        notification.id,
        notification.type,
        notification.title,
        notification.body,
        notification.createdAt,
        notification.readBy ?? [],
      ],
    )
  }
}

async function writeDb(db) {
  await ensureDb()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await persistDbSnapshot(client, db)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(payload))
}

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...headers,
  })
  res.end(text)
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message })
}

async function readBody(req) {
  let body = ''

  for await (const chunk of req) {
    body += chunk

    if (body.length > 1_000_000) {
      throw new Error('Request body is too large.')
    }
  }

  return body ? JSON.parse(body) : {}
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sign(value) {
  return createHmac('sha256', tokenSecret).update(value).digest('base64url')
}

function createToken(user) {
  const payload = base64Url({
    userId: user.id,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  })

  return `${payload}.${sign(payload)}`
}

function readToken(req, url) {
  const header = req.headers.authorization ?? ''

  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length)
  }

  return url.searchParams.get('token')
}

async function authenticate(req, url) {
  const token = readToken(req, url)

  if (!token) {
    return null
  }

  const [payload, signature] = token.split('.')
  const expected = sign(payload ?? '')

  if (!payload || !signature || expected.length !== signature.length) {
    return null
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

  if (!parsed.exp || parsed.exp < Date.now()) {
    return null
  }

  const db = await readDb()
  const user = db.users.find((item) => item.id === parsed.userId)

  return user ? sanitizeUser(user) : null
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  }
}

function requireRole(user, roles) {
  return roles.includes(user.role)
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function nextGameId(games) {
  const maxId = games.reduce((max, game) => {
    const numericId = Number(String(game.id).replace('GM-', ''))
    return Number.isNaN(numericId) ? max : Math.max(max, numericId)
  }, 1000)

  return `GM-${maxId + 1}`
}

function validateGame(form) {
  const required = ['date', 'time', 'ageGroup', 'leagueType', 'fieldId', 'status']
  const missing = required.some((field) => !String(form[field] ?? '').trim())
  const selectedDate = new Date(`${form.date}T00:00:00`)
  const seniorRefsNeeded = Number(form.seniorRefsNeeded)
  const assistantRefsNeeded = Number(form.assistantRefsNeeded)

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
    return 'Please use one of the allowed game dropdown options.'
  }

  if (!Number.isInteger(seniorRefsNeeded) || !Number.isInteger(assistantRefsNeeded)) {
    return 'Referee counts must be whole numbers.'
  }

  if (seniorRefsNeeded < 1 || seniorRefsNeeded > 2) {
    return 'Senior referees must be between 1 and 2.'
  }

  if (assistantRefsNeeded < 0 || assistantRefsNeeded > 2) {
    return 'Assistant referees must be between 0 and 2.'
  }

  return ''
}

function cleanGame(form) {
  return {
    date: form.date,
    time: form.time,
    ageGroup: form.ageGroup,
    leagueType: form.leagueType,
    fieldId: form.fieldId,
    seniorRefsNeeded: Number(form.seniorRefsNeeded),
    assistantRefsNeeded: Number(form.assistantRefsNeeded),
    status: form.status,
    locked: Boolean(form.locked),
  }
}

function enrichAvailabilityRecord(record, db) {
  const referee = db.users.find((user) => user.id === record.refereeId)
  const game = db.games.find((item) => item.id === record.gameId)

  return {
    ...record,
    refereeName: referee?.name ?? 'Unknown referee',
    refereeEmail: referee?.email ?? '',
    game,
  }
}

function availabilitySummary(game, db) {
  const records = db.availability.filter((record) => record.gameId === game.id)
  const availableCount = records.filter((record) => record.status === 'Available').length
  const notAvailableCount = records.filter((record) => record.status === 'Not Available').length
  const requiredCount = Number(game.seniorRefsNeeded) + Number(game.assistantRefsNeeded)

  return {
    availableCount,
    notAvailableCount,
    responseCount: records.length,
    requiredCount,
    stillNeeded: Math.max(requiredCount - availableCount, 0),
  }
}

function filterAvailability(records, url) {
  const date = url.searchParams.get('date') ?? ''
  const referee = (url.searchParams.get('referee') ?? '').toLowerCase()
  const gameType = url.searchParams.get('gameType') ?? ''
  const gameId = url.searchParams.get('gameId') ?? ''

  return records.filter((record) => {
    const matchesDate = !date || record.game?.date === date
    const matchesReferee =
      !referee ||
      record.refereeName.toLowerCase().includes(referee) ||
      record.refereeEmail.toLowerCase().includes(referee)
    const matchesGameType = !gameType || record.game?.leagueType === gameType
    const matchesGameId = !gameId || record.gameId === gameId

    return matchesDate && matchesReferee && matchesGameType && matchesGameId
  })
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function buildAvailabilityCsv(records) {
  const headers = [
    'Referee Name',
    'Referee Email',
    'Game ID',
    'Game Date',
    'Game Time',
    'Field',
    'Age Group',
    'League Type',
    'Availability',
    'Submitted At',
    'Updated At',
    'Modified',
    'Game Locked',
  ]

  const rows = records.map((record) => [
    record.refereeName,
    record.refereeEmail,
    record.gameId,
    record.game?.date,
    record.game?.time,
    record.game?.fieldId,
    record.game?.ageGroup,
    record.game?.leagueType,
    record.status,
    record.submittedAt,
    record.updatedAt,
    record.modified ? 'Yes' : 'No',
    record.game?.locked ? 'Yes' : 'No',
  ])

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function addNotification(db, notification) {
  const item = {
    id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    createdAt: new Date().toISOString(),
    readBy: [],
  }

  db.notifications.unshift(item)
  db.notifications = db.notifications.slice(0, 80)
  broadcastNotification(item)
  return item
}

function broadcastNotification(notification) {
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`

  notificationClients.forEach((client) => {
    client.write(payload)
  })
}

async function handleAuth(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await authenticate(req, url)

    if (!user) {
      sendError(res, 401, 'Please sign in.')
      return true
    }

    sendJson(res, 200, { user })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req)
    const name = String(body.name ?? '').trim()
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? '')
    const requestedRole = String(body.role ?? 'referee')

    if (!name || !email || password.length < 8) {
      sendError(res, 400, 'Name, email, and an 8 character password are required.')
      return true
    }

    if (!ROLE_OPTIONS.includes(requestedRole)) {
      sendError(res, 400, 'Please choose referee, assignor, or administrator.')
      return true
    }

    const db = await readDb()

    if (db.users.some((user) => user.email === email)) {
      sendError(res, 409, 'An account with that email already exists.')
      return true
    }

    const role = db.users.length === 0 ? 'assignor' : requestedRole
    const user = {
      id: `U-${Date.now()}`,
      name,
      email,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    }

    db.users.push(user)
    addNotification(db, {
      type: 'auth',
      title: `${roleLabel(role)} account created`,
      body: `${name} joined NYSA Referee Staff as ${roleLabel(role).toLowerCase()}.`,
    })
    await writeDb(db)
    sendJson(res, 201, { token: createToken(user), user: sanitizeUser(user) })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? '')
    const db = await readDb()
    const user = db.users.find((item) => item.email === email)

    if (!user || !verifyPassword(password, user.passwordHash)) {
      sendError(res, 401, 'Invalid email or password. Please try again.')
      return true
    }

    sendJson(res, 200, { token: createToken(user), user: sanitizeUser(user) })
    return true
  }

  return false
}

function roleLabel(role) {
  if (role === 'admin') {
    return 'Administrator'
  }

  return role.charAt(0).toUpperCase() + role.slice(1)
}

async function handleUsers(req, res, url, user) {
  if (url.pathname === '/api/users' && req.method === 'GET') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can view referee accounts.')
      return true
    }

    const db = await readDb()
    const users = db.users.map(sanitizeUser)
    sendJson(res, 200, { users })
    return true
  }

  return false
}

async function handleGames(req, res, url, user) {
  if (url.pathname === '/api/games' && req.method === 'GET') {
    const db = await readDb()
    const games = db.games.map((game) => ({
      ...game,
      availabilitySummary: availabilitySummary(game, db),
    }))

    sendJson(res, 200, { games })
    return true
  }

  if (url.pathname === '/api/games' && req.method === 'POST') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can create games.')
      return true
    }

    const body = await readBody(req)
    const error = validateGame(body)

    if (error) {
      sendError(res, 400, error)
      return true
    }

    const db = await readDb()
    const game = {
      id: nextGameId(db.games),
      ...cleanGame(body),
    }

    db.games.push(game)
    addNotification(db, {
      type: 'game-created',
      title: `${game.id} created`,
      body: `${user.name} added ${game.ageGroup} ${game.leagueType} on field ${game.fieldId}. Referees can now submit availability.`,
    })
    await writeDb(db)
    sendJson(res, 201, { game: { ...game, availabilitySummary: availabilitySummary(game, db) } })
    return true
  }

  if (url.pathname === '/api/games/bulk-delete' && req.method === 'POST') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can delete games.')
      return true
    }

    const body = await readBody(req)
    const ids = Array.isArray(body.ids) ? body.ids : []
    const db = await readDb()
    const beforeCount = db.games.length
    db.games = db.games.filter((game) => !ids.includes(game.id))
    db.availability = db.availability.filter((record) => !ids.includes(record.gameId))
    const deletedCount = beforeCount - db.games.length

    if (deletedCount > 0) {
      addNotification(db, {
        type: 'game-deleted',
        title: 'Games deleted',
        body: `${user.name} deleted ${deletedCount} selected games and their availability responses.`,
      })
    }

    await writeDb(db)
    sendJson(res, 200, { deletedCount })
    return true
  }

  const lockMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/lock$/)

  if (lockMatch && req.method === 'POST') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can lock or reopen games.')
      return true
    }

    const gameId = decodeURIComponent(lockMatch[1])
    const body = await readBody(req)
    const db = await readDb()
    const game = db.games.find((item) => item.id === gameId)

    if (!game) {
      sendError(res, 404, 'Game not found.')
      return true
    }

    game.locked = Boolean(body.locked)
    addNotification(db, {
      type: 'game-lock',
      title: `${game.id} ${game.locked ? 'locked' : 'reopened'}`,
      body: game.locked
        ? `${user.name} finalized this game. Referee availability changes are now blocked.`
        : `${user.name} reopened this game for referee availability changes.`,
    })
    await writeDb(db)
    sendJson(res, 200, { game: { ...game, availabilitySummary: availabilitySummary(game, db) } })
    return true
  }

  const gameMatch = url.pathname.match(/^\/api\/games\/([^/]+)$/)

  if (gameMatch && req.method === 'PUT') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can update games.')
      return true
    }

    const body = await readBody(req)
    const error = validateGame(body)

    if (error) {
      sendError(res, 400, error)
      return true
    }

    const gameId = decodeURIComponent(gameMatch[1])
    const db = await readDb()
    const index = db.games.findIndex((game) => game.id === gameId)

    if (index === -1) {
      sendError(res, 404, 'Game not found.')
      return true
    }

    const game = { id: gameId, ...cleanGame(body) }
    db.games[index] = game
    addNotification(db, {
      type: 'game-updated',
      title: `${game.id} updated`,
      body: `${user.name} updated the game schedule.`,
    })
    await writeDb(db)
    sendJson(res, 200, { game: { ...game, availabilitySummary: availabilitySummary(game, db) } })
    return true
  }

  if (gameMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can delete games.')
      return true
    }

    const gameId = decodeURIComponent(gameMatch[1])
    const db = await readDb()
    const exists = db.games.some((game) => game.id === gameId)

    if (!exists) {
      sendError(res, 404, 'Game not found.')
      return true
    }

    db.games = db.games.filter((game) => game.id !== gameId)
    db.availability = db.availability.filter((record) => record.gameId !== gameId)
    addNotification(db, {
      type: 'game-deleted',
      title: `${gameId} deleted`,
      body: `${user.name} removed a game and related availability responses from the schedule.`,
    })
    await writeDb(db)
    sendJson(res, 200, { deletedId: gameId })
    return true
  }

  return false
}

async function handleAvailability(req, res, url, user) {
  if (url.pathname === '/api/availability' && req.method === 'GET') {
    const db = await readDb()
    const scopedRecords = requireRole(user, ['assignor', 'admin'])
      ? db.availability
      : db.availability.filter((record) => record.refereeId === user.id)
    const enrichedRecords = scopedRecords
      .map((record) => enrichAvailabilityRecord(record, db))
      .filter((record) => record.game)
    const records = requireRole(user, ['assignor', 'admin'])
      ? filterAvailability(enrichedRecords, url)
      : enrichedRecords

    sendJson(res, 200, { availability: records })
    return true
  }

  if (url.pathname === '/api/availability' && req.method === 'POST') {
    if (user.role !== 'referee') {
      sendError(res, 403, 'Only referees submit their own availability from this page.')
      return true
    }

    const body = await readBody(req)
    const gameId = String(body.gameId ?? '')
    const status = String(body.status ?? '')

    if (!gameId || !AVAILABILITY_OPTIONS.includes(status)) {
      sendError(res, 400, 'Choose a game and mark yourself Available or Not Available.')
      return true
    }

    const db = await readDb()
    const game = db.games.find((item) => item.id === gameId)

    if (!game) {
      sendError(res, 404, 'Game not found.')
      return true
    }

    if (game.locked) {
      sendError(res, 423, 'This game has been locked by the assignor, so availability cannot be changed.')
      return true
    }

    if (db.availability.some((record) => record.refereeId === user.id && record.gameId === gameId)) {
      sendError(res, 409, 'You already submitted availability for this game. Update the existing response instead.')
      return true
    }

    const now = new Date().toISOString()
    const record = {
      id: `A-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      refereeId: user.id,
      gameId,
      status,
      submittedAt: now,
      updatedAt: now,
      modified: false,
    }

    db.availability.push(record)
    addNotification(db, {
      type: 'availability-submitted',
      title: `${user.name} submitted availability`,
      body: `${user.name} is ${status.toLowerCase()} for ${game.id} on ${game.date}.`,
    })
    await writeDb(db)
    sendJson(res, 201, { availability: enrichAvailabilityRecord(record, db) })
    return true
  }

  const availabilityMatch = url.pathname.match(/^\/api\/availability\/([^/]+)$/)

  if (availabilityMatch && req.method === 'PUT') {
    const id = decodeURIComponent(availabilityMatch[1])
    const body = await readBody(req)
    const status = String(body.status ?? '')

    if (!AVAILABILITY_OPTIONS.includes(status)) {
      sendError(res, 400, 'Availability must be Available or Not Available.')
      return true
    }

    const db = await readDb()
    const record = db.availability.find((item) => item.id === id)

    if (!record) {
      sendError(res, 404, 'Availability record not found.')
      return true
    }

    if (user.role === 'referee' && record.refereeId !== user.id) {
      sendError(res, 403, 'Referees can edit only their own availability records.')
      return true
    }

    if (!requireRole(user, ['assignor', 'admin']) && db.games.find((game) => game.id === record.gameId)?.locked) {
      sendError(res, 423, 'This game has been locked by the assignor, so availability cannot be changed.')
      return true
    }

    record.status = status
    record.updatedAt = new Date().toISOString()
    record.modified = true
    const enriched = enrichAvailabilityRecord(record, db)
    addNotification(db, {
      type: 'availability-updated',
      title: `${user.name} updated availability`,
      body: `${enriched.refereeName} is now ${status.toLowerCase()} for ${record.gameId}.`,
    })
    await writeDb(db)
    sendJson(res, 200, { availability: enriched })
    return true
  }

  if (availabilityMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(availabilityMatch[1])
    const db = await readDb()
    const record = db.availability.find((item) => item.id === id)

    if (!record) {
      sendError(res, 404, 'Availability record not found.')
      return true
    }

    if (user.role === 'referee' && record.refereeId !== user.id) {
      sendError(res, 403, 'Referees can delete only their own availability records.')
      return true
    }

    if (!requireRole(user, ['assignor', 'admin']) && db.games.find((game) => game.id === record.gameId)?.locked) {
      sendError(res, 423, 'This game has been locked by the assignor, so availability cannot be deleted.')
      return true
    }

    db.availability = db.availability.filter((item) => item.id !== id)
    addNotification(db, {
      type: 'availability-deleted',
      title: 'Availability response deleted',
      body: `${user.name} removed an availability response for ${record.gameId}.`,
    })
    await writeDb(db)
    sendJson(res, 200, { deletedId: id })
    return true
  }

  return false
}

async function handleReports(req, res, url, user) {
  if (url.pathname === '/api/reports/availability.csv' && req.method === 'GET') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can export availability reports.')
      return true
    }

    const db = await readDb()
    const records = filterAvailability(
      db.availability.map((record) => enrichAvailabilityRecord(record, db)).filter((record) => record.game),
      url,
    )
    const csv = buildAvailabilityCsv(records)
    sendText(res, 200, csv, {
      'Content-Disposition': 'attachment; filename="availability-report.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
    })
    return true
  }

  return false
}

async function handleNotifications(req, res, url, user) {
  if (url.pathname === '/api/notifications/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    })
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    notificationClients.add(res)
    req.on('close', () => notificationClients.delete(res))
    return true
  }

  if (url.pathname === '/api/notifications/reminders' && req.method === 'POST') {
    if (!requireRole(user, ['assignor', 'admin'])) {
      sendError(res, 403, 'Only assignors and administrators can send availability reminders.')
      return true
    }

    const db = await readDb()
    const refereeCount = db.users.filter((item) => item.role === 'referee').length
    addNotification(db, {
      type: 'availability-reminder',
      title: 'Availability reminder sent',
      body: `${user.name} queued reminder emails for ${refereeCount} referees to update upcoming availability.`,
    })
    await writeDb(db)
    sendJson(res, 200, { sentCount: refereeCount })
    return true
  }

  if (url.pathname === '/api/notifications' && req.method === 'GET') {
    const db = await readDb()
    const notifications = db.notifications.map((notification) => ({
      ...notification,
      read: notification.readBy.includes(user.id),
    }))

    sendJson(res, 200, { notifications })
    return true
  }

  if (url.pathname === '/api/notifications/read-all' && req.method === 'POST') {
    const db = await readDb()
    db.notifications = db.notifications.map((notification) => ({
      ...notification,
      readBy: notification.readBy.includes(user.id)
        ? notification.readBy
        : [...notification.readBy, user.id],
    }))
    await writeDb(db)
    sendJson(res, 200, { ok: true })
    return true
  }

  return false
}

async function serveStatic(req, res, url) {
  if (!existsSync(distDir)) {
    sendError(res, 404, 'API route not found.')
    return
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = path.normalize(path.join(distDir, requestedPath))
  const safePath = filePath.startsWith(distDir) ? filePath : path.join(distDir, 'index.html')

  try {
    const fileStats = await stat(safePath)
    const finalPath = fileStats.isFile() ? safePath : path.join(distDir, 'index.html')
    const content = await readFile(finalPath)
    const extension = path.extname(finalPath)
    const contentTypes = {
      '.css': 'text/css',
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    }

    res.writeHead(200, { 'Content-Type': contentTypes[extension] ?? 'application/octet-stream' })
    res.end(content)
  } catch {
    const index = await readFile(path.join(distDir, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(index)
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (await handleAuth(req, res, url)) {
      return
    }

    if (url.pathname.startsWith('/api/')) {
      const user = await authenticate(req, url)

      if (!user) {
        sendError(res, 401, 'Please sign in.')
        return
      }

      if (await handleUsers(req, res, url, user)) {
        return
      }

      if (await handleGames(req, res, url, user)) {
        return
      }

      if (await handleAvailability(req, res, url, user)) {
        return
      }

      if (await handleReports(req, res, url, user)) {
        return
      }

      if (await handleNotifications(req, res, url, user)) {
        return
      }

      sendError(res, 404, 'API route not found.')
      return
    }

    await serveStatic(req, res, url)
  } catch (error) {
    sendError(res, 500, error.message || 'Server error.')
  }
})

server.listen(port, '0.0.0.0', async () => {
  try {
    await ensureDb()
    console.log(`NYSA Referee Staff API listening on http://localhost:${port}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
})
