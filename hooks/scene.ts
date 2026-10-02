// Clawd as a pet: how it feels comes from your turns alone, no model calls.
// Pure: the rules (feed, sicken, tire) and frame() for the band.
import { along, canvas, cells, CLAWD, clawd, ground, label, mix, put, rect, type Canvas, type Glyph } from './art'

import type { Mood, Pet } from '../types'

const HOUR = 3_600_000
const FOOD_EVERY = HOUR / 2  // one food lost per half hour
const TIRE_EVERY = HOUR / 5  // one energy lost per 12 minutes of session

export const newPet = (now: number): Pet => ({ born: now, food: 6, fedAt: now, health: 8, cleanStreak: 0, turns: 0 })

const clamp = (n: number) => Math.max(0, Math.min(10, n))

export const foodNow = (p: Pet, now: number) => clamp(p.food - Math.floor((now - p.fedAt) / FOOD_EVERY))
export const energyNow = (sessionAt: number, now: number) => clamp(10 - Math.floor((now - sessionAt) / TIRE_EVERY))

/** A main-loop turn ended: clean ones feed it (every third heals it), failed tool calls hurt it. */
export function afterTurn(p: Pet, now: number, failed: number, answered: boolean): Pet {
  const food = foodNow(p, now)
  if (failed > 0) return { ...p, food, fedAt: now, health: clamp(p.health - Math.min(3, failed)), cleanStreak: 0, turns: p.turns + 1 }
  if (!answered) return { ...p, food, fedAt: now, turns: p.turns + 1 }
  const streak = p.cleanStreak + 1
  return { ...p, food: clamp(food + 1), fedAt: now, health: clamp(p.health + (streak % 3 === 0 ? 1 : 0)), cleanStreak: streak, turns: p.turns + 1 }
}

export function moodOf(p: Pet, sessionAt: number, now: number): Mood {
  if (p.health <= 3) return 'sick'
  if (foodNow(p, now) <= 2) return 'hungry'
  if (energyNow(sessionAt, now) <= 3) return 'sleepy'
  return 'happy'
}

export const ageOf = (p: Pet, now: number) => {
  const days = Math.floor((now - p.born) / (24 * HOUR))
  return days === 0 ? 'born today' : `${days} day${days === 1 ? '' : 's'} old`
}

const bar = (n: number) => `[${'#'.repeat(n)}${'-'.repeat(10 - n)}]`

const TEXT = 0x9aa0ac
const DIM = 0x5c6270
const MOODS: Record<Mood, [string, string, number]> = {
  happy: ['happy', '', 0x8fd18a],
  hungry: ['hungry', 'clean turns feed it', 0xe8c547],
  sleepy: ['sleepy', 'long session: a break?', 0x8fa8d8],
  sick: ['sick', 'failed calls; clean turns heal', 0xd9534f],
}

function bowl(c: Canvas, x: number, full: boolean) {
  rect(c, x, 13, 6, 1, 0x6a7890); rect(c, x + 1, 14, 4, 1, 0x6a7890)
  if (full) rect(c, x + 1, 12, 4, 1, 0xc89a5a)
}

function bed(c: Canvas, x: number) {
  rect(c, x, 13, 20, 2, 0x4a4060)
  rect(c, x - 2, 10, 2, 5, 0x5a4a30)
  rect(c, x + 2, 12, 4, 1, 0xd8d8e0)  // pillow
  rect(c, x + 18, 11, 2, 4, 0x5a4a30)
}

function heart(c: Canvas, x: number, y: number, colour: number) {
  put(c, x, y, colour); put(c, x + 2, y, colour)
  put(c, x, y + 1, colour); put(c, x + 1, y + 1, colour); put(c, x + 2, y + 1, colour)
  put(c, x + 1, y + 2, colour)
}

export function frame(p: Pet, sessionAt: number, now: number, t: number, W: number): Uint32Array {
  const c = canvas(W)
  const g: Glyph[] = []
  ground(c)
  const mood = moodOf(p, sessionAt, now)
  const food = foodNow(p, now)
  const room = Math.max(40, W - 34)  // the left part is Clawd's room, the right part the stats

  if (mood === 'sleepy') {
    bed(c, 6)
    clawd(c, t, 'rest', 6, 1, 1, { eyes: 'closed', legs: false })
    rect(c, 13, 11, 15, 2, 0x6a5a8a)  // the blanket, up to his eyes
    for (let k = 0; k < 3; k++) {
      const life = ((t / 700) + k * 1.3) % 4
      label(g, 21 + k * 2 + Math.round(life), 3 - Math.floor(life), k === 2 ? 'Z' : 'z', mix(0x8fa8d8, 0x1b1b1e, life / 4))
    }
  } else if (mood === 'sick') {
    clawd(c, t, 'stand', 10, 1, 0, { colour: mix(CLAWD, 0x7a9a6a, 0.45), eyes: Math.floor(t / 1500) % 3 ? 'closed' : 'open' })
    rect(c, 22, 9, 3, 1, 0xd8d8e0); put(c, 25, 9, 0xd9534f)  // a thermometer
    const drop = Math.floor(t / 120) % 10
    put(c, 9, 8 + drop / 2, 0x6aa8e8)
    bowl(c, room - 14, false)
  } else if (mood === 'hungry') {
    const at = along([{ x: 4, stay: 1500, pose: 'stand' }, { x: room - 30, stay: 2500, pose: 'stand' }], t)
    clawd(c, t, at.pose, at.x, at.facing)
    bowl(c, room - 14, false)
    if (at.still && at.stop === 1) label(g, room - 16, 2, '?', 0xe8c547)
  } else {
    const at = along([{ x: 4, stay: 1800, pose: 'dance' }, { x: room - 34, stay: 1800, pose: 'dance' }, { x: Math.round(room / 3), stay: 1200, pose: 'stand' }], t)
    clawd(c, t, at.pose, at.x, at.facing)
    bowl(c, room - 14, food >= 5)
    if (at.still) {
      const rise = Math.floor((t / 250) % 6)
      heart(c, Math.round(at.x) + 14, 7 - rise, mix(0xe86a8a, 0x1b1b1e, rise / 6))
    }
  }

  const sx = room + 2
  const [moodText, hint, moodColour] = MOODS[mood]
  const fit = (text: string) => text.slice(0, Math.max(0, W - sx - 1))
  label(g, 1, 0, `Clawd, ${ageOf(p, now)}`, TEXT)
  label(g, sx, 1, `food   ${bar(food)}`, food <= 2 ? 0xe8c547 : TEXT)
  label(g, sx, 2, `health ${bar(p.health)}`, p.health <= 3 ? 0xd9534f : TEXT)
  label(g, sx, 3, `energy ${bar(energyNow(sessionAt, now))}`, TEXT)
  label(g, sx, 5, fit(moodText), moodColour)
  label(g, sx, 6, fit(hint || `${p.turns} turns, ${p.cleanStreak} clean in a row`), DIM)
  return cells(c, g)
}
