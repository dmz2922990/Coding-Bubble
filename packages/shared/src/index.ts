// Stub types — will be replaced by session monitor types
export type EmotionState = 'idle' | 'busy' | 'done' | 'night'

export interface EmotionSnapshot {
  emotion: EmotionState
  phrases: string[]
}
