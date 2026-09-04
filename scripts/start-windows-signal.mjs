/** Bridge launcher control markers to the dsh CLI's startup and shutdown lifecycle on Windows. */

import { closeSync, existsSync, openSync } from 'node:fs'

const marker = process.env.DSH_START_WINDOWS_INTERRUPT_FILE
const readyMarker = process.env.DSH_START_WINDOWS_READY_FILE

if (readyMarker !== undefined && readyMarker !== '') {
  const write = process.stdout.write.bind(process.stdout)
  let tail = ''
  let announced = false
  process.stdout.write = function (...args) {
    if (!announced) {
      tail = `${tail}${String(args[0])}`.slice(-4096)
      if (/(?:^|\r?\n)dsh web: http:\/\/[^\s]+/u.test(tail)) {
        announced = true
        closeSync(openSync(readyMarker, 'wx', 0o600))
      }
    }
    return write(...args)
  }
}

if (marker !== undefined && marker !== '') {
  let interrupted = false
  const heartbeat = setInterval(() => {
    if (interrupted || !existsSync(marker)) return
    interrupted = true
    clearInterval(heartbeat)
    process.emit('SIGTERM')
  }, 100)
  heartbeat.unref()
}
