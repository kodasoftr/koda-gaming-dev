import type { AnimatorStateName, EngineEntity, ScriptAsset, Vec3 } from '../types/engine';
import { samplePlayerInput, type UnifiedInputFrame } from './inputSystem';

export interface ScriptRuntimeContext {
  dt: number;
  time: number;
  inputFrame: UnifiedInputFrame;
  allEntities: EngineEntity[];
  onLog: (msg: string, level?: 'Info' | 'Warning' | 'Error') => void;
  onRequestAttack?: (attacker: EngineEntity) => void;
  onRequestShoot?: (shooter: EngineEntity) => void;
}

export type CompiledScriptFn = (
  entity: EngineEntity,
  ctx: ScriptRuntimeContext
) => void;

export const SCRIPT_TEMPLATES: Record<
  | 'brawler3d'
  | 'shooter2d'
  | 'zombie_ai'
  | 'camera_follow'
  | 'player_wasd'
  | 'platformer2d'
  | 'patrol'
  | 'collectible'
  | 'follow'
  | 'blank',
  Omit<ScriptAsset, 'id'>
> = {
  brawler3d: {
    name: 'Brawler3DController',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 5.8, jumpForce: 7.8, rotateSpeed: 140, amplitude: 0 },
    code: `// Briga de Rua 3D — Suporte a Teclado, Mouse, Touchscreen e Controle (1P / 2P Split)
using KodaEngine;

public class Brawler3DController : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");

        if (Mathf.Abs(h) > 0.05f || Mathf.Abs(v) > 0.05f)
        {
            transform.position.x += h * params.moveSpeed * dt;
            transform.position.z -= v * params.moveSpeed * dt;
            transform.rotation.y = Mathf.Atan2(h, -v) * 57.2958f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.SetFloat("speed", 0.0f);
        }

        if (Input.GetButton("Jump") && Rigidbody.isGrounded)
        {
            Rigidbody.AddForce(0.0f, params.jumpForce, 0.0f);
            Animator.Play("Jump");
        }

        if (Input.GetButton("Attack"))
        {
            Animator.Play("Attack");
            Combat.Attack();
        }
    }
}`,
  },
  shooter2d: {
    name: 'Shooter2DController',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 5.6, jumpForce: 8.6, rotateSpeed: 0, amplitude: 0 },
    code: `// Jogo de Tiro 2D — Teclado, Mouse, Touchscreen e Controle (1P / 2P Split)
using KodaEngine;

public class Shooter2DController : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        float h = Input.GetAxis("Horizontal");

        if (Mathf.Abs(h) > 0.05f)
        {
            transform.position.x += h * params.moveSpeed * dt;
            Sprite.flipX = h < 0.0f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.SetFloat("speed", 0.0f);
        }

        if (Input.GetButton("Jump") && Rigidbody.isGrounded)
        {
            Rigidbody.AddForce(0.0f, params.jumpForce, 0.0f);
            Animator.Play("Jump");
        }

        if (Input.GetButton("Attack"))
        {
            Combat.Shoot();
        }
    }
}`,
  },
  zombie_ai: {
    name: 'ZombieAI',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 2.3, jumpForce: 0, rotateSpeed: 0, amplitude: 1.3 },
    code: `// IA de Zumbi (Briga de Rua 3D / Tiro 2D) — Persegue o jogador mais próximo e ataca
using KodaEngine;

public class ZombieAI : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        var target = Scene.FindNearestPlayer(transform.position);
        if (target == null) return;

        float dx = target.position.x - transform.position.x;
        float dz = target.position.z - transform.position.z;
        float dist = Mathf.Sqrt(dx * dx + dz * dz);

        if (dist > params.amplitude)
        {
            transform.position.x += (dx / dist) * params.moveSpeed * dt;
            transform.position.z += (dz / dist) * params.moveSpeed * dt;
            Sprite.flipX = dx < 0.0f;
            transform.rotation.y = Mathf.Atan2(dx, dz) * 57.2958f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.Play("Attack");
            Combat.Attack();
        }
    }
}`,
  },
  camera_follow: {
    name: 'CameraFollow',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 7.0, jumpForce: 0, rotateSpeed: 0, amplitude: 0 },
    code: `// Script de Câmera — Segue o alvo configurado mantendo o offset
using KodaEngine;

public class CameraFollow : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        // O motor atualiza Câmeras automaticamente pelo alvo configurado no Inspetor.
        // Você pode personalizar aqui balanço ou zoom dinâmico via Camera.fov.
    }
}`,
  },
  player_wasd: {
    name: 'PlayerController',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 5.5, jumpForce: 7.4, rotateSpeed: 120, amplitude: 0 },
    code: `// Script C# (MonoBehaviour) — Teclado, Touchscreen, Mouse e Controle
using KodaEngine;

public class PlayerController : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");

        if (Mathf.Abs(h) > 0.01f || Mathf.Abs(v) > 0.01f)
        {
            transform.position.x += h * params.moveSpeed * dt;
            transform.position.z -= v * params.moveSpeed * dt;
            transform.rotation.y = Mathf.Atan2(h, -v) * 57.2958f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.SetFloat("speed", 0.0f);
        }

        if (Input.GetButton("Jump") && Rigidbody.isGrounded)
        {
            Rigidbody.AddForce(0.0f, params.jumpForce, 0.0f);
            Animator.Play("Jump");
        }

        if (Input.GetButton("Attack"))
        {
            Animator.Play("Attack");
            Combat.Attack();
        }
    }
}`,
  },
  platformer2d: {
    name: 'Platformer2DController',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 5.2, jumpForce: 8.2, rotateSpeed: 0, amplitude: 0 },
    code: `// Script C# Plataforma 2D (Sprites PNG / GIF / Rig2D + Mistura 3D)
using KodaEngine;

public class Platformer2DController : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        float h = Input.GetAxis("Horizontal");

        if (Mathf.Abs(h) > 0.01f)
        {
            transform.position.x += h * params.moveSpeed * dt;
            Sprite.flipX = h < 0.0f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.SetFloat("speed", 0.0f);
        }

        if (Input.GetButton("Jump") && Rigidbody.isGrounded)
        {
            Rigidbody.AddForce(0.0f, params.jumpForce, 0.0f);
            Animator.Play("Jump");
        }
    }
}`,
  },
  patrol: {
    name: 'PatrolEnemy',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 2.2, jumpForce: 0, rotateSpeed: 0, amplitude: 2.6 },
    code: `// Patrulha automática (vai e volta no eixo X)
using KodaEngine;

public class PatrolEnemy : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        float velX = Mathf.Cos(Time.time * params.moveSpeed) * params.amplitude * params.moveSpeed;
        transform.position.x += velX * dt;
        Sprite.flipX = velX < 0.0f;
        transform.rotation.y = velX >= 0 ? 90.0f : -90.0f;
        Animator.SetFloat("speed", params.moveSpeed);
    }
}`,
  },
  collectible: {
    name: 'CoinSpinAndBob',
    language: 'Kotlin_JNI',
    defaultParams: { moveSpeed: 2.8, jumpForce: 0, rotateSpeed: 130, amplitude: 0.25 },
    code: `// Kotlin JNI — Moeda / Kit Médico Flutuante
package com.koda.game

class CoinSpinAndBob : KodaBehaviour() {
    fun onUpdate(dt: Float) {
        transform.rotation.y += params.rotateSpeed * dt
        transform.position.y += Mathf.Sin(Time.time * params.moveSpeed) * params.amplitude * dt
    }
}`,
  },
  follow: {
    name: 'FollowPlayer',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 2.0, jumpForce: 0, rotateSpeed: 90, amplitude: 1.8 },
    code: `// Segue o jogador mais próximo mantendo distância mínima
using KodaEngine;

public class FollowPlayer : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        var target = Scene.FindNearestPlayer(transform.position);
        if (target == null) return;

        float dx = target.position.x - transform.position.x;
        float dz = target.position.z - transform.position.z;
        float dist = Mathf.Sqrt(dx * dx + dz * dz);

        if (dist > params.amplitude)
        {
            transform.position.x += (dx / dist) * params.moveSpeed * dt;
            transform.position.z += (dz / dist) * params.moveSpeed * dt;
            transform.rotation.y = Mathf.Atan2(dx, dz) * 57.2958f;
            Animator.SetFloat("speed", params.moveSpeed);
        }
        else
        {
            Animator.SetFloat("speed", 0.0f);
        }
    }
}`,
  },
  blank: {
    name: 'NovoComportamento',
    language: 'CSharp_Mono',
    defaultParams: { moveSpeed: 3.0, jumpForce: 5.0, rotateSpeed: 60, amplitude: 1.0 },
    code: `// Novo Script C# — Programe sua mecânica e vincule a qualquer objeto
using KodaEngine;

public class NovoComportamento : MonoBehaviour
{
    public void OnUpdate(float dt)
    {
        // Exemplo: girar o objeto usando o parâmetro rotateSpeed do Inspetor
        transform.rotation.y += params.rotateSpeed * dt;
    }
}`,
  },
};

export const INITIAL_SCRIPTS: ScriptAsset[] = [
  { id: 'scr_brawler3d', ...SCRIPT_TEMPLATES.brawler3d },
  { id: 'scr_shooter2d', ...SCRIPT_TEMPLATES.shooter2d },
  { id: 'scr_zombie', ...SCRIPT_TEMPLATES.zombie_ai },
  { id: 'scr_player', ...SCRIPT_TEMPLATES.player_wasd },
  { id: 'scr_plat2d', ...SCRIPT_TEMPLATES.platformer2d },
  { id: 'scr_coin', ...SCRIPT_TEMPLATES.collectible },
  { id: 'scr_patrol', ...SCRIPT_TEMPLATES.patrol },
];

function extractMethodBody(source: string): string {
  const sigRegex = /(?:public\s+|private\s+|override\s+)?(?:void|fun|function)\s+(?:OnUpdate|Update|onUpdate)\s*\([^)]*\)\s*\{/;
  const match = sigRegex.exec(source);
  if (!match) {
    return source;
  }
  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return depth === 0 ? source.slice(startIdx, i - 1) : source.slice(startIdx);
}

function transpileUnityScriptToJS(code: string): string {
  const body = extractMethodBody(code);
  return body
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(using|package|import)\s+[^\n;]+;?/gm, '')
    .replace(/(\d+(?:\.\d+)?)f\b/g, '$1')
    .replace(/\bnew\s+Vector3\s*\(([^,]+),([^,]+),([^)]+)\)/g, '({x:$1,y:$2,z:$3})')
    .replace(/\b(?:public|private|protected)\s+/g, '')
    .replace(/\b(?:float|int|double|bool|boolean|string|String|var|val)\s+([A-Za-z_]\w*)\s*=/g, 'let $1 =')
    .replace(/\bMathf\.Abs\b/g, 'Math.abs')
    .replace(/\bMathf\.Sin\b/g, 'Math.sin')
    .replace(/\bMathf\.Cos\b/g, 'Math.cos')
    .replace(/\bMathf\.Sqrt\b/g, 'Math.sqrt')
    .replace(/\bMathf\.Atan2\b/g, 'Math.atan2')
    .replace(/\bMathf\.Clamp\b/g, '((v,a,b)=>Math.min(b,Math.max(a,v)))')
    .replace(/\bMathf\.Lerp\b/g, '((a,b,t)=>a+(b-a)*t)')
    .replace(/\bMathf\.PI\b/g, 'Math.PI');
}

export function compileUnityScript(code: string): { fn: CompiledScriptFn | null; error: string | null } {
  try {
    const jsBody = transpileUnityScriptToJS(code);
    const rawFn = new Function(
      'dt',
      'transform',
      'Input',
      'Animator',
      'Rigidbody',
      'Sprite',
      'Camera',
      'Health',
      'Combat',
      'Time',
      'Debug',
      'Scene',
      'params',
      jsBody
    ) as (
      dt: number,
      transform: unknown,
      Input: unknown,
      Animator: unknown,
      Rigidbody: unknown,
      Sprite: unknown,
      Camera: unknown,
      Health: unknown,
      Combat: unknown,
      Time: unknown,
      Debug: unknown,
      Scene: unknown,
      params: unknown
    ) => void;

    const compiled: CompiledScriptFn = (entity, ctx) => {
      const transform = {
        position: entity.position,
        rotation: entity.rotation,
        scale: entity.scale,
        translate: (x: number, y: number, z: number) => {
          entity.position.x += x;
          entity.position.y += y;
          entity.position.z += z;
        },
        rotate: (x: number, y: number, z: number) => {
          entity.rotation.x += x;
          entity.rotation.y += y;
          entity.rotation.z += z;
        },
        lookAt: (target: Vec3) => {
          const dx = target.x - entity.position.x;
          const dz = target.z - entity.position.z;
          entity.rotation.y = Math.atan2(dx, dz) * (180 / Math.PI);
        },
      };

      const slot: 1 | 2 = entity.playerSlot === 2 ? 2 : 1;
      const sampled = samplePlayerInput(ctx.inputFrame, slot);
      const isDown = (k: string) =>
        ctx.inputFrame.settings.keyboardEnabled && ctx.inputFrame.keysDown.has(k.toLowerCase());

      const Input = {
        GetKey: (k: string) => {
          const norm = k.toLowerCase();
          if (norm === 'space') return isDown(' ') || isDown('space');
          return isDown(norm);
        },
        GetAxis: (axis: 'Horizontal' | 'Vertical' | string) => {
          if (axis === 'Horizontal') return sampled.h;
          if (axis === 'Vertical') return sampled.v;
          return 0;
        },
        GetButton: (btn: 'Jump' | 'Attack' | 'Fire1' | 'Special' | string) => {
          if (btn === 'Jump') return sampled.jump;
          if (btn === 'Attack' || btn === 'Fire1') return sampled.attack;
          if (btn === 'Special') return sampled.special;
          return false;
        },
        GetTouchAxis: (axis: 'Horizontal' | 'Vertical' | string) =>
          axis === 'Horizontal' ? ctx.inputFrame.touch.axisX : ctx.inputFrame.touch.axisY,
        GetMouseButton: (btn: number) =>
          btn === 0 ? ctx.inputFrame.mouse.leftDown : ctx.inputFrame.mouse.rightDown,
        GetGamepadConnected: (idx = 0) => Boolean(ctx.inputFrame.gamepads[idx]),
      };

      const resolveAndActivateStateOrClip = (clipOrState: string) => {
        const lower = clipOrState.toLowerCase();
        const customState = entity.animator.states?.find((s) => s.name.toLowerCase() === lower);
        if (customState) {
          entity.animator.enabled = true;
          entity.animator.currentState = customState.name;
          if (customState.source === 'clip' && customState.clipId) {
            const clip = entity.animator.clips.find((c) => c.id === customState.clipId);
            if (clip) {
              entity.activeBlenderClip = null;
              entity.animator.activeClipId = clip.id;
              entity.animator.clipDuration = clip.duration;
              entity.animator.keyframes = clip.keyframes;
              entity.animator.useKeyframes = true;
              entity.animator.libraryPresetId = null;
              return;
            }
          }
          if (customState.source === 'library' && customState.libraryPresetId) {
            entity.activeBlenderClip = null;
            entity.animator.useKeyframes = false;
            entity.animator.libraryPresetId = customState.libraryPresetId;
            return;
          }
          if (customState.source === 'blender' && customState.blenderClipName && entity.blenderClips.includes(customState.blenderClipName)) {
            entity.activeBlenderClip = customState.blenderClipName;
            entity.animator.useKeyframes = false;
            entity.animator.libraryPresetId = null;
            return;
          }
          entity.activeBlenderClip = null;
          entity.animator.useKeyframes = false;
          entity.animator.libraryPresetId = null;
          return;
        }

        const customClip = entity.animator.clips.find(
          (c) => c.name.toLowerCase() === lower
        );
        if (customClip) {
          entity.animator.enabled = true;
          entity.animator.activeClipId = customClip.id;
          entity.animator.clipDuration = customClip.duration;
          entity.animator.keyframes = customClip.keyframes;
          entity.animator.useKeyframes = true;
          entity.animator.libraryPresetId = null;
          return;
        }
        if (entity.blenderClips.includes(clipOrState)) {
          entity.activeBlenderClip = clipOrState;
          entity.animator.useKeyframes = false;
          entity.animator.libraryPresetId = null;
          return;
        }
        const validStates: AnimatorStateName[] = ['Idle', 'Walk', 'Run', 'Jump', 'Attack'];
        const matchedState = validStates.find((s) => s.toLowerCase() === lower);
        if (matchedState) {
          entity.animator.enabled = true;
          entity.animator.useKeyframes = false;
          entity.animator.libraryPresetId = null;
          entity.animator.currentState = matchedState;
        }
      };

      const Animator = {
        Play: resolveAndActivateStateOrClip,
        SetTrigger: (triggerName: string) => {
          if (triggerName.toLowerCase().includes('attack')) {
            entity.animator.triggerAttack = true;
            resolveAndActivateStateOrClip('Attack');
          } else {
            resolveAndActivateStateOrClip(triggerName);
          }
        },
        SetSpeed: (spd: number) => {
          entity.animator.clipSpeed = Math.max(0.1, Math.min(4, spd));
        },
        SetFloat: (param: string, val: number) => {
          if (param === 'speed') {
            entity.animator.paramSpeed = val;
            if (entity.animator.paramGrounded && entity.animator.currentState !== 'Attack' && !entity.animator.useKeyframes && !entity.animator.libraryPresetId) {
              entity.animator.currentState = val > 3.5 ? 'Run' : val > 0.1 ? 'Walk' : 'Idle';
            }
          }
        },
        SetBool: (param: string, val: boolean) => {
          if (param === 'grounded' || param === 'isGrounded') {
            entity.animator.paramGrounded = val;
          }
        },
      };

      const floorY =
        entity.kind === 'Rig3D' || entity.kind === 'Rig2D' || entity.primitive === 'CustomModel'
          ? 0.02
          : entity.scale.y * 0.5 + 0.02;

      const Rigidbody = {
        velocity: entity.physics.velocity,
        isGrounded: entity.animator.paramGrounded || entity.position.y <= floorY,
        AddForce: (x: number, y: number, z: number) => {
          entity.physics.enabled = true;
          entity.physics.velocity.x += x;
          entity.physics.velocity.y += y;
          entity.physics.velocity.z += z;
        },
      };

      if (!entity.sprite) {
        entity.sprite = { flipX: false, billboard: false, cols: 1, rows: 1, fps: 8 };
      }
      const Sprite = entity.sprite;

      const Camera = entity.camera ?? null;
      const Health = entity.health ?? null;
      const Combat = {
        Attack: () => ctx.onRequestAttack?.(entity),
        Shoot: () => ctx.onRequestShoot?.(entity),
      };

      const Time = { deltaTime: ctx.dt, time: ctx.time };
      const Debug = { Log: (m: unknown) => ctx.onLog(String(m), 'Info') };
      const Scene = {
        Find: (name: string) => ctx.allEntities.find((item) => item.name === name) ?? null,
        FindNearestPlayer: (fromPos: Vec3) => {
          const players = ctx.allEntities.filter(
            (item) =>
              item.active &&
              (item.health?.team === 'player' ||
                item.script.mechanicPreset === 'Brawler3D' ||
                item.script.mechanicPreset === 'Shooter2D' ||
                item.script.mechanicPreset === 'PlayerWASD' ||
                item.script.mechanicPreset === 'Platformer2D') &&
              (item.health ? item.health.currentHp > 0 : true)
          );
          let best: EngineEntity | null = null;
          let bestDist = Infinity;
          for (const p of players) {
            const d = Math.hypot(p.position.x - fromPos.x, p.position.y - fromPos.y, p.position.z - fromPos.z);
            if (d < bestDist) {
              bestDist = d;
              best = p;
            }
          }
          return best;
        },
      };

      rawFn(
        ctx.dt,
        transform,
        Input,
        Animator,
        Rigidbody,
        Sprite,
        Camera,
        Health,
        Combat,
        Time,
        Debug,
        Scene,
        entity.script.params
      );
    };

    return { fn: compiled, error: null };
  } catch (err) {
    return {
      fn: null,
      error: err instanceof Error ? err.message : 'Erro de sintaxe no script',
    };
  }
}
