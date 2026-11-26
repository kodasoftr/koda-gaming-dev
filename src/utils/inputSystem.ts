import type { EngineInputSettings } from '../types/engine';

export interface TouchInputState {
  axisX: number;
  axisY: number;
  jump: boolean;
  attack: boolean;
  kick: boolean;
  capoeira: boolean;
  roll: boolean;
  special: boolean;
  lockToggle: boolean;
  lastTouchAt: number;
}

export interface MouseInputState {
  leftDown: boolean;
  rightDown: boolean;
  ndcX: number;
  ndcY: number;
  deltaX: number;
  deltaY: number;
  lastClickAt: number;
}

export interface GamepadSnapshot {
  index: number;
  id: string;
  axisX: number;
  axisY: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  attack: boolean;
  kick: boolean;
  capoeira: boolean;
  roll: boolean;
  special: boolean;
  lockToggle: boolean;
}

export interface UnifiedInputFrame {
  keysDown: Set<string>;
  touch: TouchInputState;
  mouse: MouseInputState;
  gamepads: GamepadSnapshot[];
  lastKeyboardAt: number;
  splitScreen2PActive: boolean;
  settings: EngineInputSettings;
}

export interface PlayerInputSample {
  h: number;
  v: number;
  jump: boolean;
  attack: boolean;
  kick: boolean;
  capoeira: boolean;
  roll: boolean;
  special: boolean;
  lockToggle: boolean;
}

export function createInitialTouchState(): TouchInputState {
  return {
    axisX: 0,
    axisY: 0,
    jump: false,
    attack: false,
    kick: false,
    capoeira: false,
    roll: false,
    special: false,
    lockToggle: false,
    lastTouchAt: 0,
  };
}

export function createInitialMouseState(): MouseInputState {
  return {
    leftDown: false,
    rightDown: false,
    ndcX: 0,
    ndcY: 0,
    deltaX: 0,
    deltaY: 0,
    lastClickAt: 0,
  };
}

export function pollNativeGamepads(enabled: boolean): GamepadSnapshot[] {
  if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) {
    return [];
  }
  const pads = navigator.getGamepads();
  const result: GamepadSnapshot[] = [];
  const deadzone = 0.18;

  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (!pad || !pad.connected) continue;

    let ax = pad.axes[0] ?? 0;
    let ay = -(pad.axes[1] ?? 0);
    let lx = pad.axes[2] ?? 0;
    let ly = -(pad.axes[3] ?? 0);
    if (Math.abs(ax) < deadzone) ax = 0;
    if (Math.abs(ay) < deadzone) ay = 0;
    if (Math.abs(lx) < deadzone) lx = 0;
    if (Math.abs(ly) < deadzone) ly = 0;

    if (pad.buttons[14]?.pressed) ax = -1;
    if (pad.buttons[15]?.pressed) ax = 1;
    if (pad.buttons[12]?.pressed) ay = 1;
    if (pad.buttons[13]?.pressed) ay = -1;

    const jump = Boolean(pad.buttons[0]?.pressed || pad.buttons[12]?.pressed);
    const attack = Boolean(pad.buttons[2]?.pressed || pad.buttons[7]?.pressed);
    const kick = Boolean(pad.buttons[1]?.pressed);
    const capoeira = Boolean(pad.buttons[3]?.pressed);
    const roll = Boolean(pad.buttons[4]?.pressed || pad.buttons[5]?.pressed || pad.buttons[6]?.pressed);
    const lockToggle = Boolean(pad.buttons[11]?.pressed || pad.buttons[9]?.pressed);

    result.push({
      index: pad.index,
      id: pad.id,
      axisX: Math.max(-1, Math.min(1, ax)),
      axisY: Math.max(-1, Math.min(1, ay)),
      lookX: Math.max(-1, Math.min(1, lx)),
      lookY: Math.max(-1, Math.min(1, ly)),
      jump,
      attack,
      kick,
      capoeira,
      roll,
      special: capoeira,
      lockToggle,
    });
  }
  return result;
}

export function samplePlayerInput(
  frame: UnifiedInputFrame,
  playerSlot: 1 | 2
): PlayerInputSample {
  const { keysDown, touch, mouse, gamepads, splitScreen2PActive, settings } = frame;
  const k = (key: string) => settings.keyboardEnabled && keysDown.has(key);

  if (splitScreen2PActive) {
    if (playerSlot === 1) {
      const pad1 = gamepads[0];
      const kh = (k('d') ? 1 : 0) - (k('a') ? 1 : 0);
      const kv = (k('w') ? 1 : 0) - (k('s') ? 1 : 0);
      const h = Math.abs(kh) > 0.05 ? kh : pad1?.axisX ?? 0;
      const v = Math.abs(kv) > 0.05 ? kv : pad1?.axisY ?? 0;
      const jump = k(' ') || k('space') || Boolean(pad1?.jump);
      const attack =
        k('f') ||
        k('j') ||
        (settings.mouseEnabled && mouse.leftDown) ||
        Boolean(pad1?.attack);
      const kick = k('c') || k('k') || (settings.mouseEnabled && mouse.rightDown) || Boolean(pad1?.kick);
      const capoeira = k('q') || k('v') || Boolean(pad1?.capoeira);
      const roll = k('shift') || k('r') || Boolean(pad1?.roll);
      const lockToggle = k('t') || k('tab') || Boolean(pad1?.lockToggle);
      return { h, v, jump, attack, kick, capoeira, roll, special: capoeira, lockToggle };
    }

    const pad2 = gamepads[1];
    const kh2 = (k('arrowright') ? 1 : 0) - (k('arrowleft') ? 1 : 0);
    const kv2 = (k('arrowup') ? 1 : 0) - (k('arrowdown') ? 1 : 0);
    let h = touch.axisX;
    let v = touch.axisY;
    if (Math.abs(h) < 0.05 && Math.abs(kh2) > 0.05) h = kh2;
    if (Math.abs(v) < 0.05 && Math.abs(kv2) > 0.05) v = kv2;
    if (Math.abs(h) < 0.05 && pad2) h = pad2.axisX;
    if (Math.abs(v) < 0.05 && pad2) v = pad2.axisY;

    const jump = touch.jump || k('enter') || Boolean(pad2?.jump);
    const attack = touch.attack || k('l') || Boolean(pad2?.attack);
    const kick = touch.kick || k('p') || Boolean(pad2?.kick);
    const capoeira = touch.capoeira || k('o') || Boolean(pad2?.capoeira);
    const roll = touch.roll || k('m') || Boolean(pad2?.roll);
    const lockToggle = touch.lockToggle || Boolean(pad2?.lockToggle);
    return { h, v, jump, attack, kick, capoeira, roll, special: capoeira, lockToggle };
  }

  // Modo 1 Jogador: Teclado + Mouse + Touchscreen + Controle unidos
  const pad1 = gamepads[0];
  const kh = (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0);
  const kv = (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0);

  let h = kh;
  let v = kv;
  if (Math.abs(h) < 0.05 && Math.abs(touch.axisX) > 0.05) h = touch.axisX;
  if (Math.abs(v) < 0.05 && Math.abs(touch.axisY) > 0.05) v = touch.axisY;
  if (Math.abs(h) < 0.05 && pad1) h = pad1.axisX;
  if (Math.abs(v) < 0.05 && pad1) v = pad1.axisY;

  const jump = k(' ') || k('space') || touch.jump || Boolean(pad1?.jump);
  const attack =
    k('f') ||
    k('j') ||
    k('enter') ||
    touch.attack ||
    (settings.mouseEnabled && mouse.leftDown) ||
    Boolean(pad1?.attack);
  const kick =
    k('c') ||
    k('k') ||
    touch.kick ||
    (settings.mouseEnabled && mouse.rightDown) ||
    Boolean(pad1?.kick);
  const capoeira = k('q') || k('v') || touch.capoeira || Boolean(pad1?.capoeira);
  const roll = k('shift') || k('r') || touch.roll || Boolean(pad1?.roll);
  const lockToggle = k('t') || k('tab') || touch.lockToggle || Boolean(pad1?.lockToggle);

  return { h, v, jump, attack, kick, capoeira, roll, special: capoeira, lockToggle };
}
