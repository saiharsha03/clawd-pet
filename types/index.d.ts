/** The pet, kept across sessions. Food is as of `fedAt`; it drops as time passes. */
export type Pet = {
  born: number
  food: number  // 0..10 at fedAt
  fedAt: number
  health: number  // 0..10
  cleanStreak: number  // turns in a row with no failed tool call
  turns: number
}
export type Mood = 'happy' | 'hungry' | 'sleepy' | 'sick'

declare module 'claude-code' {
  interface PluginState {
    'clawd-pet': { pet: Pet | null; sessionAt: number; shown: boolean }
  }
}
