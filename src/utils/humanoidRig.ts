import * as THREE from 'three';
import type { AnimatorStateName, RigPose, Vec3 } from '../types/engine';

export type HumanoidMoveType = 'punch' | 'kick' | 'capoeira' | 'roll';

export interface HumanoidPose extends RigPose {
  hipsPosY: number;
  hipsRot: Vec3;
  forearmL: Vec3;
  forearmR: Vec3;
  shinL: Vec3;
  shinR: Vec3;
}

export interface HumanoidVisualNodes {
  root: THREE.Group;
  hips: THREE.Group;
  bonesMap: Map<string, THREE.Group>;
  bodyMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  eyeMat?: THREE.MeshBasicMaterial;
  shadowDisc: THREE.Mesh;
}

export interface SpawnerCrateVisualNodes {
  root: THREE.Group;
  crateMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshStandardMaterial;
  coreGroup: THREE.Group;
}

let cachedShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedShadowTex) return cachedShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedShadowTex = tex;
  return tex;
}

function createSculptedTorsoGeometry(isZombie: boolean, isBoss: boolean): THREE.BufferGeometry {
  // Lathe perfilado de cintura estreita até peito/ombros largos
  const widen = isBoss ? 1.18 : isZombie ? 0.94 : 1.04;
  const pts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.16 * widen, 0.02),
    new THREE.Vector2(0.155 * widen, 0.14),
    new THREE.Vector2(0.185 * widen, 0.30),
    new THREE.Vector2(0.22 * widen, 0.45),
    new THREE.Vector2(0.19 * widen, 0.54),
    new THREE.Vector2(0.085, 0.58),
    new THREE.Vector2(0.01, 0.59),
  ];
  const geo = new THREE.LatheGeometry(pts, 18);
  // Achata levemente no eixo Z para proporção anatômica humana (mais largo nos ombros que no peito-costas)
  geo.scale(1.16, 1.0, 0.72);
  geo.computeVertexNormals();
  return geo;
}

function createLimbTaperGeometry(rTop: number, rBot: number, len: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.005, 0),
    new THREE.Vector2(rTop, 0.02),
    new THREE.Vector2(rTop * 1.04, -len * 0.28),
    new THREE.Vector2((rTop + rBot) * 0.52, -len * 0.65),
    new THREE.Vector2(rBot, -len + 0.02),
    new THREE.Vector2(0.005, -len),
  ];
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.computeVertexNormals();
  return geo;
}

export function buildHumanoidVisual(
  entityId: number,
  options: {
    is2D: boolean;
    color: string;
    isZombie?: boolean;
    isBoss?: boolean;
    playerSlot?: 1 | 2;
  }
): HumanoidVisualNodes {
  const { is2D, color, isZombie = false, isBoss = false, playerSlot = 1 } = options;
  const root = new THREE.Group();
  root.userData.entityId = entityId;
  const zScale = is2D ? 0.52 : 1.0;

  const tag = <T extends THREE.Object3D>(o: T): T => {
    o.userData.entityId = entityId;
    if ((o as unknown as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    return o;
  };

  // Paleta anatômica realista separando pele, roupa, calça, botas e detalhes metálicos
  const skinColor = isZombie ? '#769A6B' : '#E5B490';
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.64,
    metalness: 0.04,
  });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isZombie ? color || '#3F6212' : color || '#2563EB',
    roughness: 0.52,
    metalness: 0.14,
  });
  const undershirtMat = new THREE.MeshStandardMaterial({
    color: isZombie ? '#27272A' : '#E2E8F0',
    roughness: 0.72,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isZombie ? '#292524' : playerSlot === 2 ? '#334155' : '#1E293B',
    roughness: 0.78,
    metalness: 0.06,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.42,
    metalness: 0.18,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    roughness: 0.8,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isZombie ? '#991B1B' : playerSlot === 2 ? '#F59E0B' : '#EF4444',
    roughness: 0.36,
    metalness: 0.35,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    roughness: 0.25,
    metalness: 0.85,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: isZombie ? '#1C1917' : playerSlot === 2 ? '#451A03' : '#1E1B4B',
    roughness: 0.75,
    metalness: 0.08,
  });

  // Sombra de contato no chão (acima de y=0.00 para evitar Z-fighting)
  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.028;
  root.add(shadowDisc);

  // Quadril / Pelve (altura anatômica ~0.92m do chão)
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.92, 0);
  root.add(hips);

  const pelvisMesh = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.14, 8, 14), pantsMat));
  pelvisMesh.rotation.z = Math.PI / 2;
  pelvisMesh.scale.set(1.0, 1.0, 0.76 * zScale);
  pelvisMesh.position.set(0, 0.02, 0);
  hips.add(pelvisMesh);

  // Cinto + fivela metálica voltada para frente (+Z)
  const belt = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.065, 18), bootMat));
  belt.scale.set(1.16, 1, 0.78 * zScale);
  belt.position.set(0, 0.085, 0);
  const buckle = tag(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.075, 0.045), metalMat));
  buckle.position.set(0, 0.085, 0.148 * zScale);
  hips.add(belt, buckle);

  // Coluna / Tronco esculpido
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.1, 0);
  hips.add(spine);

  const torsoMesh = tag(new THREE.Mesh(createSculptedTorsoGeometry(isZombie, isBoss), bodyMat));
  torsoMesh.scale.z *= zScale;
  spine.add(torsoMesh);

  // Camisa interna / decote em V na frente (+Z)
  const chestV = tag(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.045), undershirtMat));
  chestV.position.set(0, 0.41, 0.145 * zScale);
  spine.add(chestV);

  // Gola da jaqueta ou costelas expostas no zumbi
  if (isZombie) {
    const ribMat = new THREE.MeshStandardMaterial({ color: '#D6D3D1', roughness: 0.65 });
    for (let i = 0; i < 3; i++) {
      const rib = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.028, 0.04), ribMat));
      rib.position.set(0.03, 0.28 + i * 0.06, 0.15 * zScale);
      rib.rotation.z = -0.08;
      spine.add(rib);
    }
  } else {
    const collar = tag(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 8, 18), bodyMat));
    collar.rotation.x = Math.PI / 2 + 0.25;
    collar.position.set(0, 0.54, 0.015);
    spine.add(collar);
  }

  // Ombreiras se for Chefe ou ombreiras leves de jaqueta
  if (isBoss) {
    for (const s of [-1, 1]) {
      const pauldron = tag(new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), metalMat));
      pauldron.scale.set(1.15, 0.85, 1.05);
      pauldron.position.set(s * 0.28, 0.51, 0);
      spine.add(pauldron);
    }
  }

  // Pescoço e Cabeça anatômica (com queixo, nariz, sobrancelhas, olhos, cabelo/faixa)
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.58, 0.01);
  spine.add(head);

  const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.13, 12), skinMat));
  neck.position.set(0, 0.06, 0);
  head.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.22, 0);
  headPivot.scale.set(1, 1, is2D ? 0.62 : 1);
  head.add(headPivot);

  const cranium = tag(new THREE.Mesh(new THREE.SphereGeometry(0.148, 20, 16), skinMat));
  cranium.scale.set(0.92, 1.08, 1.02);
  headPivot.add(cranium);

  // Maxilar / Queixo definido voltado para +Z
  const jaw = tag(new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.11, 0.145), skinMat));
  jaw.position.set(0, -0.075, 0.042);
  jaw.rotation.x = 0.18;
  headPivot.add(jaw);

  // Nariz
  const nose = tag(new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.065, 8), skinMat));
  nose.rotation.x = Math.PI / 2 - 0.15;
  nose.position.set(0, -0.015, 0.155);
  headPivot.add(nose);

  // Orelhas
  for (const s of [-1, 1]) {
    const ear = tag(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinMat));
    ear.scale.set(0.45, 1.1, 0.7);
    ear.position.set(s * 0.138, -0.01, -0.01);
    headPivot.add(ear);
  }

  // Olhos + Sobrancelhas
  let eyeMat: THREE.MeshBasicMaterial | undefined;
  const scleraMat = new THREE.MeshBasicMaterial({ color: isZombie ? '#18181B' : '#F8FAFC' });
  const pupilMat = new THREE.MeshBasicMaterial({ color: isZombie ? '#EF4444' : '#0F172A' });
  if (isZombie) eyeMat = pupilMat;

  for (const s of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), scleraMat);
    sclera.scale.set(1.1, 0.78, 0.6);
    sclera.position.set(s * 0.052, 0.018, 0.132);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), pupilMat);
    pupil.position.set(s * 0.052, 0.018, 0.145);
    const brow = tag(new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.018, 0.026), hairMat));
    brow.position.set(s * 0.054, 0.052, 0.14);
    brow.rotation.z = isZombie ? s * 0.25 : s * 0.14;
    headPivot.add(sclera, pupil, brow);
  }

  if (isZombie) {
    // Boca sombria com dentes do zumbi
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.032, 0.025),
      new THREE.MeshBasicMaterial({ color: '#18181B' })
    );
    mouth.position.set(0, -0.08, 0.12);
    const tooth1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.018, 0.028),
      new THREE.MeshBasicMaterial({ color: '#FEF3C7' })
    );
    tooth1.position.set(-0.025, -0.072, 0.123);
    const tooth2 = tooth1.clone();
    tooth2.position.set(0.025, -0.088, 0.123);
    headPivot.add(mouth, tooth1, tooth2);
  } else {
    // Cabelo esculpido + Faixa de lutador (bandana)
    const hairTop = tag(new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat));
    hairTop.scale.set(0.95, 1.05, 1.05);
    hairTop.position.set(0, 0.025, -0.01);
    const hairBack = tag(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.11), hairMat));
    hairBack.position.set(0, -0.01, -0.095);
    const headband = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.147, 0.147, 0.042, 18), accentMat));
    headband.scale.set(0.96, 1, 1.05);
    headband.position.set(0, 0.068, 0.005);
    const knotTail1 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.14, 0.014), accentMat));
    knotTail1.position.set(0.03, 0.02, -0.17);
    knotTail1.rotation.set(0.45, 0, -0.25);
    const knotTail2 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.014), accentMat));
    knotTail2.position.set(-0.02, 0.03, -0.165);
    knotTail2.rotation.set(0.35, 0, 0.3);
    headPivot.add(hairTop, hairBack, headband, knotTail1, knotTail2);
  }

  // Braços articulados (Ombro -> Bíceps -> Cotovelo -> Antebraço -> Luva/Punho)
  const makeArm = (side: 1 | -1, armName: string, forearmName: string) => {
    const upperPivot = new THREE.Group();
    upperPivot.name = armName;
    upperPivot.position.set(side * (isBoss ? 0.31 : 0.265), 0.50, 0);

    const shoulderCap = tag(new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), bodyMat));
    upperPivot.add(shoulderCap);

    const upperLen = 0.28;
    const upperGeo = createLimbTaperGeometry(0.072, 0.056, upperLen);
    const upperMesh = tag(new THREE.Mesh(upperGeo, bodyMat));
    upperMesh.scale.z *= zScale;
    upperPivot.add(upperMesh);

    const forearmPivot = new THREE.Group();
    forearmPivot.name = forearmName;
    forearmPivot.position.set(0, -upperLen, 0);
    upperPivot.add(forearmPivot);

    const elbowCap = tag(new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 8), skinMat));
    forearmPivot.add(elbowCap);

    const foreLen = 0.26;
    const foreMesh = tag(new THREE.Mesh(createLimbTaperGeometry(0.055, 0.044, foreLen), skinMat));
    foreMesh.scale.z *= zScale;
    forearmPivot.add(foreMesh);

    // Munhequeira / Luva de luta ou mão zumbi com garras
    const wristWrap = tag(
      new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.047, 0.075, 12), isZombie ? pantsMat : accentMat)
    );
    wristWrap.position.set(0, -foreLen + 0.035, 0);
    const fist = tag(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.078, 0.09, 0.088 * zScale),
        isZombie ? skinMat : accentMat
      )
    );
    fist.position.set(0, -foreLen - 0.04, 0.012);
    forearmPivot.add(wristWrap, fist);

    return { upperPivot, forearmPivot };
  };

  // No sistema Three.js (+Z frente, +Y cima): +X é esquerda anatômica e -X é direita anatômica
  const leftArm = makeArm(1, 'armL', 'forearmL');
  const rightArm = makeArm(-1, 'armR', 'forearmR');
  spine.add(leftArm.upperPivot, rightArm.upperPivot);

  // Pernas articuladas (Quadril -> Coxa -> Joelho -> Canela -> Bota/Tênis com sola)
  const makeLeg = (side: 1 | -1, legName: string, shinName: string) => {
    const thighPivot = new THREE.Group();
    thighPivot.name = legName;
    thighPivot.position.set(side * 0.115, -0.04, 0);

    const thighLen = 0.42;
    const thighMesh = tag(new THREE.Mesh(createLimbTaperGeometry(0.095, 0.072, thighLen), pantsMat));
    thighMesh.scale.z *= zScale;
    thighPivot.add(thighMesh);

    const shinPivot = new THREE.Group();
    shinPivot.name = shinName;
    shinPivot.position.set(0, -thighLen, 0);
    thighPivot.add(shinPivot);

    const kneeCap = tag(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pantsMat));
    shinPivot.add(kneeCap);

    const shinLen = 0.39;
    const shinMesh = tag(new THREE.Mesh(createLimbTaperGeometry(0.07, 0.052, shinLen), pantsMat));
    shinMesh.scale.z *= zScale;
    shinPivot.add(shinMesh);

    // Bota / Tênis voltado para frente (+Z)
    const bootUpper = tag(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.095, 0.22 * zScale), bootMat));
    bootUpper.position.set(0, -shinLen - 0.02, 0.045 * zScale);
    const bootSole = tag(new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.032, 0.235 * zScale), soleMat));
    bootSole.position.set(0, -shinLen - 0.068, 0.045 * zScale);
    shinPivot.add(bootUpper, bootSole);

    return { thighPivot, shinPivot };
  };

  const leftLeg = makeLeg(1, 'legL', 'shinL');
  const rightLeg = makeLeg(-1, 'legR', 'shinR');
  hips.add(leftLeg.thighPivot, rightLeg.thighPivot);

  const bonesMap = new Map<string, THREE.Group>([
    ['hips', hips],
    ['spine', spine],
    ['head', head],
    ['armL', leftArm.upperPivot],
    ['forearmL', leftArm.forearmPivot],
    ['armR', rightArm.upperPivot],
    ['forearmR', rightArm.forearmPivot],
    ['legL', leftLeg.thighPivot],
    ['shinL', leftLeg.shinPivot],
    ['legR', rightLeg.thighPivot],
    ['shinR', rightLeg.shinPivot],
  ]);

  return { root, hips, bonesMap, bodyMat, accentMat, skinMat, eyeMat, shadowDisc };
}

export function evaluateRealisticHumanoidPose(params: {
  state: AnimatorStateName;
  move?: HumanoidMoveType;
  moveProgress?: number;
  comboIndex?: number;
  time: number;
  isZombie?: boolean;
}): HumanoidPose {
  const { state, move, moveProgress = 0, comboIndex = 0, time, isZombie = false } = params;

  // Golpes especiais e rolamento com biomecânica completa (ombros, cotovelos, quadris, joelhos)
  if (move) {
    const p = Math.max(0, Math.min(1, moveProgress));
    // Curva rápida de impacto + recuperação suave
    const s = Math.sin(p * Math.PI);
    const snap = p < 0.45 ? Math.sin((p / 0.45) * (Math.PI / 2)) : Math.cos(((p - 0.45) / 0.55) * (Math.PI / 2));

    if (move === 'kick') {
      return {
        hipsPosY: 0.90 + s * 0.04,
        hipsRot: { x: -8 * s, y: 38 * snap, z: -12 * s },
        spine: { x: -18 * s, y: 26 * snap, z: -14 * s },
        head: { x: 10 * s, y: -32 * snap, z: 6 * s },
        armL: { x: -55 * s, y: 0, z: 32 },
        forearmL: { x: -85, y: 0, z: 0 },
        armR: { x: 28 * s, y: 0, z: -38 },
        forearmR: { x: -75, y: 0, z: 0 },
        legL: { x: 12 * s, y: 0, z: 8 * s },
        shinL: { x: 14 * s, y: 0, z: 0 },
        // Câmara do joelho no início -> extensão completa no auge do chute
        legR: { x: -102 * snap, y: 0, z: -16 * snap },
        shinR: { x: p < 0.25 ? 85 * (1 - p / 0.25) : 6, y: 0, z: 0 },
      };
    }

    if (move === 'capoeira') {
      return {
        hipsPosY: 0.84 - s * 0.14,
        hipsRot: { x: 18 * s, y: 0, z: 22 * s },
        spine: { x: 34 * s, y: 0, z: 36 * s },
        head: { x: -16 * s, y: 0, z: -18 * s },
        armL: { x: -85 * s, y: 0, z: 48 * s },
        forearmL: { x: -25, y: 0, z: 0 },
        armR: { x: -35 * s, y: 0, z: -62 * s },
        forearmR: { x: -35, y: 0, z: 0 },
        legL: { x: 24 * s, y: 0, z: 14 * s },
        shinL: { x: 34 * s, y: 0, z: 0 },
        legR: { x: -96 * s, y: 18 * s, z: -52 * s },
        shinR: { x: 8, y: 0, z: 0 },
      };
    }

    if (move === 'roll') {
      return {
        hipsPosY: 0.64,
        hipsRot: { x: 0, y: 0, z: 0 },
        spine: { x: 64 * s, y: 0, z: 0 },
        head: { x: 42 * s, y: 0, z: 0 },
        armL: { x: -72, y: 0, z: 16 },
        forearmL: { x: -105, y: 0, z: 0 },
        armR: { x: -72, y: 0, z: -16 },
        forearmR: { x: -105, y: 0, z: 0 },
        legL: { x: -105 * s, y: 0, z: 0 },
        shinL: { x: 118 * s, y: 0, z: 0 },
        legR: { x: -105 * s, y: 0, z: 0 },
        shinR: { x: 118 * s, y: 0, z: 0 },
      };
    }

    // Soco alternado (Jab esquerdo vs Cruzado direito)
    const isLeftPunch = comboIndex % 2 === 1;
    const dir = isLeftPunch ? 1 : -1;
    return {
      hipsPosY: 0.90 - s * 0.03,
      hipsRot: { x: 4 * s, y: -24 * snap * dir, z: 0 },
      spine: { x: 14 * s, y: -34 * snap * dir, z: 4 * s * dir },
      head: { x: 4 * s, y: 32 * snap * dir, z: 0 },
      armL: isLeftPunch ? { x: -92 * snap, y: 12 * snap, z: 12 } : { x: -48, y: 0, z: 16 },
      forearmL: isLeftPunch ? { x: -10, y: 0, z: 0 } : { x: -108, y: 0, z: 0 },
      armR: !isLeftPunch ? { x: -92 * snap, y: -12 * snap, z: -12 } : { x: -48, y: 0, z: -16 },
      forearmR: !isLeftPunch ? { x: -10, y: 0, z: 0 } : { x: -108, y: 0, z: 0 },
      legL: { x: -18 * s, y: 0, z: 6 },
      shinL: { x: 24 * s, y: 0, z: 0 },
      legR: { x: 20 * s, y: 0, z: -6 },
      shinR: { x: 18 * s, y: 0, z: 0 },
    };
  }

  if (state === 'Walk') {
    const freq = isZombie ? 4.4 : 6.6;
    const ph = time * freq;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    const bob = Math.abs(cw) * (isZombie ? 0.025 : 0.045);

    if (isZombie) {
      return {
        hipsPosY: 0.88 - bob,
        hipsRot: { x: 4, y: sw * 8, z: cw * 4 },
        spine: { x: 18, y: -sw * 6, z: Math.sin(ph * 0.5) * 5 },
        head: { x: 10, y: Math.sin(ph * 0.5) * 10, z: 12 * Math.sin(ph * 0.5) },
        armL: { x: -78 + sw * 10, y: 0, z: 10 },
        forearmL: { x: -24, y: 0, z: 0 },
        armR: { x: -82 - sw * 10, y: 0, z: -10 },
        forearmR: { x: -28, y: 0, z: 0 },
        legL: { x: -sw * 28, y: 0, z: 2 },
        shinL: { x: Math.max(8, (sw > 0 ? sw : 0.15) * 48), y: 0, z: 0 },
        legR: { x: sw * 28, y: 0, z: -2 },
        shinR: { x: Math.max(8, (sw < 0 ? -sw : 0.15) * 48), y: 0, z: 0 },
      };
    }

    return {
      hipsPosY: 0.90 + bob,
      hipsRot: { x: 3, y: sw * 9, z: cw * 2.5 },
      spine: { x: 8, y: -sw * 12, z: 0 },
      head: { x: -5, y: sw * 5, z: 0 },
      armL: { x: -32 + sw * 34, y: 0, z: 14 },
      forearmL: { x: -62 + Math.max(0, -sw) * 28, y: 0, z: 0 },
      armR: { x: -32 - sw * 34, y: 0, z: -14 },
      forearmR: { x: -62 + Math.max(0, sw) * 28, y: 0, z: 0 },
      legL: { x: -sw * 38, y: 0, z: 2 },
      shinL: { x: Math.max(6, Math.max(0, cw) * 54 + Math.max(0, sw) * 24), y: 0, z: 0 },
      legR: { x: sw * 38, y: 0, z: -2 },
      shinR: { x: Math.max(6, Math.max(0, -cw) * 54 + Math.max(0, -sw) * 24), y: 0, z: 0 },
    };
  }

  if (state === 'Run') {
    const ph = time * 10.2;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    return {
      hipsPosY: 0.89 + Math.abs(cw) * 0.065,
      hipsRot: { x: 6, y: sw * 13, z: cw * 3 },
      spine: { x: 18, y: -sw * 16, z: 0 },
      head: { x: -12, y: sw * 6, z: 0 },
      armL: { x: sw * 58 - 10, y: 0, z: 14 },
      forearmL: { x: -88, y: 0, z: 0 },
      armR: { x: -sw * 58 - 10, y: 0, z: -14 },
      forearmR: { x: -88, y: 0, z: 0 },
      legL: { x: -sw * 56, y: 0, z: 2 },
      shinL: { x: Math.max(10, Math.max(0, cw) * 78), y: 0, z: 0 },
      legR: { x: sw * 56, y: 0, z: -2 },
      shinR: { x: Math.max(10, Math.max(0, -cw) * 78), y: 0, z: 0 },
    };
  }

  if (state === 'Jump') {
    return {
      hipsPosY: 0.94,
      hipsRot: { x: 6, y: 0, z: 0 },
      spine: { x: 12, y: 0, z: 0 },
      head: { x: -8, y: 0, z: 0 },
      armL: { x: -95, y: 0, z: 26 },
      forearmL: { x: -45, y: 0, z: 0 },
      armR: { x: -95, y: 0, z: -26 },
      forearmR: { x: -45, y: 0, z: 0 },
      legL: { x: -55, y: 0, z: 4 },
      shinL: { x: 75, y: 0, z: 0 },
      legR: { x: -24, y: 0, z: -4 },
      shinR: { x: 48, y: 0, z: 0 },
    };
  }

  if (state === 'Attack') {
    const p = (time % 0.4) / 0.4;
    return evaluateRealisticHumanoidPose({ state: 'Idle', move: 'punch', moveProgress: p, time, isZombie });
  }

  // Idle: Guarda de lutador realista ou postura tensa de zumbi
  const breathe = Math.sin(time * 2.4);
  if (isZombie) {
    return {
      hipsPosY: 0.90 + breathe * 0.015,
      hipsRot: { x: 2, y: 4, z: Math.sin(time * 1.1) * 3 },
      spine: { x: 15 + breathe * 3, y: -4, z: Math.sin(time * 1.1) * 4 },
      head: { x: 8, y: Math.sin(time * 1.3) * 14, z: 10 },
      armL: { x: -72 + breathe * 5, y: 0, z: 12 },
      forearmL: { x: -28, y: 0, z: 0 },
      armR: { x: -76 - breathe * 5, y: 0, z: -12 },
      forearmR: { x: -32, y: 0, z: 0 },
      legL: { x: -6, y: 0, z: 4 },
      shinL: { x: 14, y: 0, z: 0 },
      legR: { x: 8, y: 0, z: -4 },
      shinR: { x: 12, y: 0, z: 0 },
    };
  }

  return {
    hipsPosY: 0.90 + breathe * 0.018,
    hipsRot: { x: 2, y: -12, z: 0 },
    spine: { x: 6 + breathe * 2, y: 8, z: 0 },
    head: { x: -4, y: -6 + Math.sin(time * 0.9) * 6, z: 0 },
    armL: { x: -42 + breathe * 3, y: 8, z: 16 },
    forearmL: { x: -96, y: 0, z: 0 },
    armR: { x: -36 - breathe * 3, y: -8, z: -18 },
    forearmR: { x: -102, y: 0, z: 0 },
    legL: { x: -14, y: 0, z: 5 },
    shinL: { x: 18, y: 0, z: 0 },
    legR: { x: 14, y: 0, z: -5 },
    shinR: { x: 16, y: 0, z: 0 },
  };
}

export function applyHumanoidPose(
  rig: HumanoidVisualNodes,
  pose: HumanoidPose,
  overrides?: { [boneName: string]: Vec3 }
): void {
  rig.hips.position.y = pose.hipsPosY;
  rig.hips.rotation.set(
    THREE.MathUtils.degToRad(pose.hipsRot.x),
    THREE.MathUtils.degToRad(pose.hipsRot.y),
    THREE.MathUtils.degToRad(pose.hipsRot.z)
  );

  const keys: (keyof Omit<HumanoidPose, 'hipsPosY' | 'hipsRot'>)[] = [
    'spine',
    'head',
    'armL',
    'forearmL',
    'armR',
    'forearmR',
    'legL',
    'shinL',
    'legR',
    'shinR',
  ];

  for (const b of keys) {
    const node = rig.bonesMap.get(b);
    if (!node) continue;
    const v = overrides?.[b] ?? pose[b];
    node.rotation.set(
      THREE.MathUtils.degToRad(v.x),
      THREE.MathUtils.degToRad(v.y),
      THREE.MathUtils.degToRad(v.z)
    );
  }
}

export function buildSpawnerCrateVisual(entityId: number, color: string): SpawnerCrateVisualNodes {
  const root = new THREE.Group();
  root.userData.entityId = entityId;
  const tag = <T extends THREE.Object3D>(o: T): T => {
    o.userData.entityId = entityId;
    if ((o as unknown as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    return o;
  };

  // Sombra de contato
  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.78,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.028;
  root.add(shadowDisc);

  const crateMat = new THREE.MeshStandardMaterial({
    color: color || '#7C2D12',
    roughness: 0.72,
    metalness: 0.12,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.35,
    metalness: 0.78,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#EF4444',
    emissive: '#DC2626',
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.3,
  });

  // Base normalizada com piso em y=0 e topo em y=1.35
  const coreBox = tag(new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.08, 1.18), crateMat));
  coreBox.position.y = 0.56;
  root.add(coreBox);

  // Molduras de ferro reforçado nos cantos e faixas diagonais
  const capTop = tag(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), ironMat));
  capTop.position.y = 1.12;
  const capBot = tag(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), ironMat));
  capBot.position.y = 0.06;
  root.add(capTop, capBot);

  for (const sx of [-0.57, 0.57]) {
    for (const sz of [-0.57, 0.57]) {
      const post = tag(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.14, 0.14), ironMat));
      post.position.set(sx, 0.58, sz);
      root.add(post);
    }
  }

  // Travessas diagonais X nos 4 lados
  for (let side = 0; side < 4; side++) {
    const faceGrp = new THREE.Group();
    faceGrp.position.y = 0.58;
    faceGrp.rotation.y = (side * Math.PI) / 2;
    const bar1 = tag(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.11, 0.06), ironMat));
    bar1.position.z = 0.59;
    bar1.rotation.z = 0.68;
    const bar2 = tag(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.11, 0.06), ironMat));
    bar2.position.z = 0.59;
    bar2.rotation.z = -0.68;
    const orb = tag(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), beaconMat));
    orb.position.z = 0.6;
    faceGrp.add(bar1, bar2, orb);
    root.add(faceGrp);
  }

  // Cristal giratório no topo indicando que gera monstros (e que precisa ser quebrado!)
  const coreGroup = new THREE.Group();
  coreGroup.position.y = 1.48;
  const crystal = tag(new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), beaconMat));
  const halo = tag(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 22), beaconMat));
  halo.rotation.x = Math.PI / 2;
  coreGroup.add(crystal, halo);
  root.add(coreGroup);

  return { root, crateMat, beaconMat, coreGroup };
}
