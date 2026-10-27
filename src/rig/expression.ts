export type Expression = 'neutral' | 'blink' | 'focus' | 'shout' | 'grit' | 'hurt' | 'win' | 'lose' | 'ko';

export type EyeState = 'open' | 'closed' | 'happy' | 'x' | 'wince';
export type MouthState = 'rest' | 'open' | 'shout' | 'grit' | 'happy' | 'frown' | 'oh';

export interface FaceState {
  eyes: EyeState;
  /** Degrees added to the resting brow tilt; positive frowns, negative looks worried. */
  browTilt: number;
  /** Brow lift in head-height fractions. */
  browLift: number;
  mouth: MouthState;
  blush: boolean;
}

export const FACE_STATES: Record<Expression, FaceState> = {
  neutral: { eyes: 'open', browTilt: 0, browLift: 0, mouth: 'rest', blush: false },
  blink: { eyes: 'closed', browTilt: 0, browLift: 0, mouth: 'rest', blush: false },
  focus: { eyes: 'open', browTilt: 16, browLift: 0, mouth: 'rest', blush: false },
  shout: { eyes: 'open', browTilt: 22, browLift: 0, mouth: 'shout', blush: false },
  grit: { eyes: 'wince', browTilt: 14, browLift: 0, mouth: 'grit', blush: false },
  hurt: { eyes: 'wince', browTilt: -18, browLift: 0.03, mouth: 'oh', blush: false },
  win: { eyes: 'happy', browTilt: -4, browLift: 0.05, mouth: 'happy', blush: true },
  lose: { eyes: 'open', browTilt: -20, browLift: 0.02, mouth: 'frown', blush: false },
  ko: { eyes: 'x', browTilt: -14, browLift: 0.03, mouth: 'oh', blush: false },
};
