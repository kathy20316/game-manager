import { spawn } from 'node:child_process'

const commands = [
  ['api', 'node', ['server/index.js']],
  ['vite', 'vite', ['--host', '0.0.0.0', '--force']],
]

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`)
  })

  child.on('exit', (code) => {
    if (code && !process.exitCode) {
      process.exitCode = code
    }

    children.forEach((item) => {
      if (item !== child && !item.killed) {
        item.kill()
      }
    })
  })

  return child
})

function shutdown() {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill()
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
