import type { AnimationClipData, TimelineKeyframe } from '../types/engine';

export type AnimationLibraryCategory = 'Combate' | 'Locomoção' | 'Reações' | 'Criaturas';

export interface AnimationLibraryPreset {
  id: string;
  name: string;
  category: AnimationLibraryCategory;
  duration: number;
  loop: boolean;
  description: string;
  keyframes: Omit<TimelineKeyframe, 'id'>[];
}

const kf = (
  time: number,
  targetName: string,
  property: 'position' | 'rotation' | 'scale',
  axis: 'x' | 'y' | 'z',
  value: number,
  interpolation: 'linear' | 'smooth' | 'step' = 'smooth'
): Omit<TimelineKeyframe, 'id'> => ({
  time,
  targetName,
  property,
  axis,
  value,
  interpolation,
});

export const ANIMATION_LIBRARY: AnimationLibraryPreset[] = [
  {
    id: 'lib_uppercut',
    name: 'Uppercut Explosivo',
    category: 'Combate',
    duration: 0.7,
    loop: false,
    description: 'Agachamento rápido seguido de gancho ascendente com giro de tronco.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 18),
      kf(0.0, 'armR', 'rotation', 'x', 20),
      kf(0.0, 'armL', 'rotation', 'x', -55),
      kf(0.25, 'spine', 'rotation', 'x', -16),
      kf(0.25, 'spine', 'rotation', 'y', 36),
      kf(0.25, 'armR', 'rotation', 'x', -135),
      kf(0.25, 'armR', 'rotation', 'z', -18),
      kf(0.25, 'legR', 'rotation', 'x', 22),
      kf(0.7, 'spine', 'rotation', 'x', 6),
      kf(0.7, 'spine', 'rotation', 'y', 0),
      kf(0.7, 'armR', 'rotation', 'x', -38),
    ],
  },
  {
    id: 'lib_roundhouse',
    name: 'Chute Giratório Alto',
    category: 'Combate',
    duration: 0.8,
    loop: false,
    description: 'Chute circular com elevação lateral da perna direita e contrapeso dos braços.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'y', -18),
      kf(0.0, 'legR', 'rotation', 'x', 10),
      kf(0.35, 'spine', 'rotation', 'z', -22),
      kf(0.35, 'spine', 'rotation', 'y', 42),
      kf(0.35, 'legR', 'rotation', 'x', -98),
      kf(0.35, 'legR', 'rotation', 'z', -24),
      kf(0.35, 'armL', 'rotation', 'z', 42),
      kf(0.35, 'armR', 'rotation', 'z', -45),
      kf(0.8, 'spine', 'rotation', 'z', 0),
      kf(0.8, 'spine', 'rotation', 'y', 0),
      kf(0.8, 'legR', 'rotation', 'x', 0),
      kf(0.8, 'legR', 'rotation', 'z', 0),
    ],
  },
  {
    id: 'lib_combo_3hits',
    name: 'Combo 3 Golpes',
    category: 'Combate',
    duration: 1.1,
    loop: false,
    description: 'Sequência Jab Esquerdo + Cruzado Direito + Chute Frontal.',
    keyframes: [
      kf(0.0, 'armL', 'rotation', 'x', -40),
      kf(0.18, 'armL', 'rotation', 'x', -95),
      kf(0.18, 'spine', 'rotation', 'y', -28),
      kf(0.45, 'armL', 'rotation', 'x', -40),
      kf(0.45, 'armR', 'rotation', 'x', -98),
      kf(0.45, 'spine', 'rotation', 'y', 32),
      kf(0.78, 'armR', 'rotation', 'x', -36),
      kf(0.78, 'legR', 'rotation', 'x', -92),
      kf(0.78, 'spine', 'rotation', 'x', -14),
      kf(1.1, 'legR', 'rotation', 'x', 0),
      kf(1.1, 'spine', 'rotation', 'y', 0),
      kf(1.1, 'spine', 'rotation', 'x', 4),
    ],
  },
  {
    id: 'lib_block_guard',
    name: 'Guarda Defensiva',
    category: 'Combate',
    duration: 1.0,
    loop: true,
    description: 'Postura fechada de defesa com antebraços erguidos protegendo o rosto.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 10),
      kf(0.0, 'armL', 'rotation', 'x', -72),
      kf(0.0, 'armL', 'rotation', 'z', -18),
      kf(0.0, 'armR', 'rotation', 'x', -74),
      kf(0.0, 'armR', 'rotation', 'z', 18),
      kf(0.5, 'spine', 'rotation', 'x', 13),
      kf(0.5, 'armL', 'rotation', 'x', -78),
      kf(0.5, 'armR', 'rotation', 'x', -80),
      kf(1.0, 'spine', 'rotation', 'x', 10),
      kf(1.0, 'armL', 'rotation', 'x', -72),
      kf(1.0, 'armR', 'rotation', 'x', -74),
    ],
  },
  {
    id: 'lib_sword_slash',
    name: 'Corte Diagonal',
    category: 'Combate',
    duration: 0.75,
    loop: false,
    description: 'Preparação acima do ombro direito e corte diagonal forte.',
    keyframes: [
      kf(0.0, 'armR', 'rotation', 'x', -145),
      kf(0.0, 'armR', 'rotation', 'z', -45),
      kf(0.0, 'spine', 'rotation', 'y', -30),
      kf(0.32, 'armR', 'rotation', 'x', -25),
      kf(0.32, 'armR', 'rotation', 'z', 32),
      kf(0.32, 'spine', 'rotation', 'y', 38),
      kf(0.32, 'spine', 'rotation', 'x', 18),
      kf(0.75, 'armR', 'rotation', 'x', -42),
      kf(0.75, 'armR', 'rotation', 'z', -14),
      kf(0.75, 'spine', 'rotation', 'y', 0),
    ],
  },
  {
    id: 'lib_sprint_hero',
    name: 'Corrida Heroica',
    category: 'Locomoção',
    duration: 0.6,
    loop: true,
    description: 'Ciclo enérgico de corrida rápida com inclinação agressiva para frente.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 22),
      kf(0.0, 'legL', 'rotation', 'x', -55),
      kf(0.0, 'legR', 'rotation', 'x', 48),
      kf(0.0, 'armL', 'rotation', 'x', 50),
      kf(0.0, 'armR', 'rotation', 'x', -65),
      kf(0.3, 'legL', 'rotation', 'x', 48),
      kf(0.3, 'legR', 'rotation', 'x', -55),
      kf(0.3, 'armL', 'rotation', 'x', -65),
      kf(0.3, 'armR', 'rotation', 'x', 50),
      kf(0.6, 'legL', 'rotation', 'x', -55),
      kf(0.6, 'legR', 'rotation', 'x', 48),
      kf(0.6, 'armL', 'rotation', 'x', 50),
      kf(0.6, 'armR', 'rotation', 'x', -65),
    ],
  },
  {
    id: 'lib_crouch_sneak',
    name: 'Furtivo / Agachado',
    category: 'Locomoção',
    duration: 1.2,
    loop: true,
    description: 'Caminhada baixa em modo furtivo com coluna inclinada.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 28),
      kf(0.0, 'legL', 'rotation', 'x', -36),
      kf(0.0, 'legR', 'rotation', 'x', 24),
      kf(0.0, 'armL', 'rotation', 'x', -30),
      kf(0.6, 'legL', 'rotation', 'x', 24),
      kf(0.6, 'legR', 'rotation', 'x', -36),
      kf(0.6, 'armR', 'rotation', 'x', -30),
      kf(1.2, 'legL', 'rotation', 'x', -36),
      kf(1.2, 'legR', 'rotation', 'x', 24),
    ],
  },
  {
    id: 'lib_dash_forward',
    name: 'Dash / Esquiva Rápida',
    category: 'Locomoção',
    duration: 0.5,
    loop: false,
    description: 'Impulso veloz inclinado para frente para atravessar ataques.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 38),
      kf(0.0, 'armL', 'rotation', 'x', 45),
      kf(0.0, 'armR', 'rotation', 'x', 45),
      kf(0.25, 'spine', 'rotation', 'x', 46),
      kf(0.25, 'legL', 'rotation', 'x', -48),
      kf(0.25, 'legR', 'rotation', 'x', 42),
      kf(0.5, 'spine', 'rotation', 'x', 6),
      kf(0.5, 'legL', 'rotation', 'x', 0),
      kf(0.5, 'legR', 'rotation', 'x', 0),
    ],
  },
  {
    id: 'lib_victory_pose',
    name: 'Comemoração Vitória',
    category: 'Reações',
    duration: 1.4,
    loop: true,
    description: 'Braços erguidos celebrando vitória com leve balanço de cabeça.',
    keyframes: [
      kf(0.0, 'armL', 'rotation', 'x', -142),
      kf(0.0, 'armL', 'rotation', 'z', 24),
      kf(0.0, 'armR', 'rotation', 'x', -142),
      kf(0.0, 'armR', 'rotation', 'z', -24),
      kf(0.0, 'head', 'rotation', 'x', -15),
      kf(0.7, 'spine', 'rotation', 'y', 12),
      kf(0.7, 'armL', 'rotation', 'x', -155),
      kf(0.7, 'armR', 'rotation', 'x', -155),
      kf(1.4, 'spine', 'rotation', 'y', 0),
      kf(1.4, 'armL', 'rotation', 'x', -142),
      kf(1.4, 'armR', 'rotation', 'x', -142),
    ],
  },
  {
    id: 'lib_hit_stagger',
    name: 'Impacto / Dano',
    category: 'Reações',
    duration: 0.55,
    loop: false,
    description: 'Recuo de tronco e cabeça para trás ao sofrer dano.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 0),
      kf(0.15, 'spine', 'rotation', 'x', -32),
      kf(0.15, 'head', 'rotation', 'x', -24),
      kf(0.15, 'armL', 'rotation', 'z', 48),
      kf(0.15, 'armR', 'rotation', 'z', -48),
      kf(0.55, 'spine', 'rotation', 'x', 6),
      kf(0.55, 'head', 'rotation', 'x', 0),
      kf(0.55, 'armL', 'rotation', 'z', 14),
      kf(0.55, 'armR', 'rotation', 'z', -14),
    ],
  },
  {
    id: 'lib_knockdown',
    name: 'Nocaute / Queda',
    category: 'Reações',
    duration: 1.1,
    loop: false,
    description: 'Queda dramática para trás com elevação de pernas e braços abertos.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', -12),
      kf(0.55, 'spine', 'rotation', 'x', -78),
      kf(0.55, 'armL', 'rotation', 'z', 65),
      kf(0.55, 'armR', 'rotation', 'z', -65),
      kf(0.55, 'legL', 'rotation', 'x', -35),
      kf(0.55, 'legR', 'rotation', 'x', -25),
      kf(1.1, 'spine', 'rotation', 'x', -84),
    ],
  },
  {
    id: 'lib_taunt_wave',
    name: 'Provocação / Chamada',
    category: 'Reações',
    duration: 1.2,
    loop: false,
    description: 'Gesto com a mão direita chamando o oponente para o combate.',
    keyframes: [
      kf(0.0, 'armR', 'rotation', 'x', -82),
      kf(0.0, 'armL', 'rotation', 'z', 18),
      kf(0.3, 'armR', 'rotation', 'x', -112),
      kf(0.6, 'armR', 'rotation', 'x', -78),
      kf(0.9, 'armR', 'rotation', 'x', -112),
      kf(1.2, 'armR', 'rotation', 'x', -40),
    ],
  },
  {
    id: 'lib_zombie_lunge',
    name: 'Investida Zumbi',
    category: 'Criaturas',
    duration: 0.9,
    loop: false,
    description: 'Bote agressivo com os dois braços estendidos e cabeça inclinada.',
    keyframes: [
      kf(0.0, 'spine', 'rotation', 'x', 12),
      kf(0.0, 'armL', 'rotation', 'x', -75),
      kf(0.0, 'armR', 'rotation', 'x', -75),
      kf(0.35, 'spine', 'rotation', 'x', 36),
      kf(0.35, 'armL', 'rotation', 'x', -118),
      kf(0.35, 'armR', 'rotation', 'x', -118),
      kf(0.35, 'head', 'rotation', 'x', -18),
      kf(0.9, 'spine', 'rotation', 'x', 16),
      kf(0.9, 'armL', 'rotation', 'x', -76),
      kf(0.9, 'armR', 'rotation', 'x', -76),
    ],
  },
  {
    id: 'lib_float_hover',
    name: 'Flutuação / Drone',
    category: 'Criaturas',
    duration: 2.0,
    loop: true,
    description: 'Oscilação suave no eixo Y com leve rotação contínua para drones e moedas.',
    keyframes: [
      kf(0.0, '__root__', 'position', 'y', 0),
      kf(1.0, '__root__', 'position', 'y', 0.35),
      kf(2.0, '__root__', 'position', 'y', 0),
      kf(0.0, '__root__', 'rotation', 'y', 0, 'linear'),
      kf(2.0, '__root__', 'rotation', 'y', 360, 'linear'),
    ],
  },
  {
    id: 'lib_crate_pulse',
    name: 'Pulso de Energia (Spawner)',
    category: 'Criaturas',
    duration: 1.4,
    loop: true,
    description: 'Respiração de escala pulsante para cristais, caixas e portais.',
    keyframes: [
      kf(0.0, '__root__', 'scale', 'x', 1.0),
      kf(0.0, '__root__', 'scale', 'y', 1.0),
      kf(0.7, '__root__', 'scale', 'x', 1.12),
      kf(0.7, '__root__', 'scale', 'y', 1.12),
      kf(1.4, '__root__', 'scale', 'x', 1.0),
      kf(1.4, '__root__', 'scale', 'y', 1.0),
    ],
  },
];

export function buildClipFromLibraryPreset(preset: AnimationLibraryPreset): AnimationClipData {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: `clip_${preset.id}_${stamp}`,
    name: preset.name,
    duration: preset.duration,
    loop: preset.loop,
    keyframes: preset.keyframes.map((k, idx) => ({
      ...k,
      id: `kf_${stamp}_${idx}`,
    })),
  };
}

export function sampleKeyframesWithInterpolation(
  keyframes: TimelineKeyframe[],
  time: number,
  targetName: string,
  property: 'position' | 'rotation' | 'scale',
  axis: 'x' | 'y' | 'z',
  fallback: number
): number {
  const track = keyframes
    .filter((k) => k.targetName === targetName && k.property === property && k.axis === axis)
    .sort((a, b) => a.time - b.time);

  if (track.length === 0) return fallback;
  if (time <= track[0].time) return track[0].value;
  if (time >= track[track.length - 1].time) return track[track.length - 1].value;

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (time >= a.time && time <= b.time) {
      const mode = a.interpolation ?? 'smooth';
      if (mode === 'step') return a.value;
      const span = Math.max(0.0001, b.time - a.time);
      const rawT = (time - a.time) / span;
      const t = mode === 'smooth' ? rawT * rawT * (3 - 2 * rawT) : rawT;
      return a.value + (b.value - a.value) * t;
    }
  }
  return fallback;
}

export function evaluateLibraryPresetClip(
  presetId: string,
  time: number
): TimelineKeyframe[] | null {
  const preset = ANIMATION_LIBRARY.find((p) => p.id === presetId);
  if (!preset) return null;
  const dur = Math.max(0.1, preset.duration);
  const _t = preset.loop ? time % dur : Math.min(time, dur);
  void _t;
  return preset.keyframes.map((k, idx) => ({ ...k, id: `tmp_${idx}` }));
}
