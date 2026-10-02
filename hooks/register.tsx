import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { encode, ROWS } from './art'
import { afterTurn, ageOf, energyNow, foodNow, frame, moodOf, newPet } from './scene'
import type { Pet } from '../types'

const FRAME_MS = 150
const EDGE = 2
const pet = atom({ plugin: 'clawd-pet', key: 'pet' } as const, null)
const sessionAt = atom({ plugin: 'clawd-pet', key: 'sessionAt' } as const, 0)
const shown = atom({ plugin: 'clawd-pet', key: 'shown' } as const, false)

/** Failed tool calls in the running main turn, and the band's mount. Module state: a reload starts over. */
const turn = { failed: 0 }
const band = { mount: null as { requestId: string; columns: number } | null, last: '', blit: true, startedAt: 0 }

async function current($: EngineInterface): Promise<Pet> {
  const held = await read($, pet)
  if (held) return held
  const stored = (await $.store.get('pet')) as Pet | undefined
  const p = stored ?? newPet(await $.clock.now())
  await update($, pet, () => p)
  return p
}

async function paint($: EngineInterface) {
  const m = band.mount
  if (!m || !(await read($, shown))) return
  const p = await read($, pet)
  if (!p) return
  const now = await $.clock.now()
  const cells = encode(frame(p, await read($, sessionAt), now, now - band.startedAt, m.columns))
  if (cells === band.last || !band.blit) return
  band.last = cells
  const r = await $.ui.blit({ requestId: m.requestId, key: 'pet', cells })
  if ('deny' in r && r.deny) {
    band.blit = false
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = hook => {
  hook('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    band.startedAt = now
    // A new session is a night's sleep: energy starts full. A reload keeps the session's start.
    if (!(await read($, sessionAt))) await update($, sessionAt, () => now)
    await current($)
    await $.command.register({ name: 'clawd-pet', description: 'Show or hide Clawd the pet; /clawd-pet status for its stats', argumentHint: '[status]', immediate: true })
    if (e.isInteractive) $.clock.every(FRAME_MS, () => void paint($))
    return next(e)
  })

  hook('command.run', { command: 'clawd-pet' }, async ($, e) => {
    if (e.args.trim() === 'status') {
      const p = await current($)
      const now = await $.clock.now()
      const at = await read($, sessionAt)
      return { text: `Clawd is ${moodOf(p, at, now)}, ${ageOf(p, now)}. food ${foodNow(p, now)}/10, health ${p.health}/10, energy ${energyNow(at, now)}/10; ${p.turns} turns, ${p.cleanStreak} clean in a row.` }
    }
    const now = !(await read($, shown))
    await update($, shown, () => now)
    return { text: now ? 'Clawd Pet: on.' : 'Clawd Pet: hidden (it still eats your clean turns).' }
  })

  hook('turn.start', ($, e, next) => {
    turn.failed = 0
    return next(e)
  })

  hook('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!e.agentId && ran.isError === true) turn.failed += 1
    return ran
  })

  hook('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const now = await $.clock.now()
    const at = await read($, sessionAt)
    const before = await current($)
    const after = afterTurn(before, now, turn.failed, e.reason === 'answer')
    turn.failed = 0
    await update($, pet, () => after)
    await $.store.set('pet', after)
    const [was, is] = [moodOf(before, at, now), moodOf(after, at, now)]
    if (was !== is && (await read($, shown))) $.ui.toast(`Clawd is ${is} now`)
    return done
  })

  hook('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const columns = e.props.bodyColumns - EDGE
    const p = await read($, pet)
    if (!p || e.props.hasSurvey || e.surface !== 'terminal' || columns < 74 || !(await read($, shown))) {
      band.mount = null
      return next(e)
    }
    const { Raster, Box } = $.ui.resolve(e)
    const now = await $.clock.now()
    if (band.mount?.requestId !== e.requestId) band.blit = true
    band.mount = { requestId: e.requestId, columns }
    const cells = encode(frame(p, await read($, sessionAt), now, now - band.startedAt, columns))
    band.last = cells
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Raster key="pet" columns={columns} rows={ROWS} cells={cells} />
        {below}
      </Box>
    )
  })
}
