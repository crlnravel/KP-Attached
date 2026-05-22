import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* eslint-disable @typescript-eslint/explicit-function-return-type */

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')

const email = process.env.ATTACHED_SMOKE_TEST_EMAIL
const password = process.env.ATTACHED_SMOKE_TEST_PASSWORD

if (!email || !password) {
  console.error(
    'ATTACHED_SMOKE_TEST_EMAIL and ATTACHED_SMOKE_TEST_PASSWORD are required to run the Electron smoke test.'
  )
  process.exit(1)
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env
    })

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ${code ?? `signal ${signal ?? 'unknown'}`}.`
        )
      )
    })

    child.on('error', reject)
  })
}

const smokeEnv = {
  ...process.env,
  DEBUG: 'true',
  ATTACHED_SMOKE_TEST: '1',
  ATTACHED_SMOKE_TEST_EMAIL: email,
  ATTACHED_SMOKE_TEST_PASSWORD: password,
  ATTACHED_SMOKE_TEST_TIMEOUT_MS: process.env.ATTACHED_SMOKE_TEST_TIMEOUT_MS ?? '45000'
}

await runCommand('pnpm', ['build'], smokeEnv)

const child = spawn(electronBinary, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: smokeEnv
})

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code)
    return
  }

  console.error(`Electron smoke test ended unexpectedly with signal ${signal ?? 'unknown'}.`)
  process.exit(1)
})
