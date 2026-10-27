import * as THREE from 'three';
import type { FighterData, SvgLayerId } from '../characters/types';
import type { RigFrame } from '../rig/draw';
import { svgArt, svgImage, SVG_DRAW_ORDER } from '../rig/svg/atlas';
import { clothTarget, layoutSvg } from '../rig/svg/layout';
import { Puppet3D, shared } from './Puppet3D';
import { DEG, PX } from './space';

/** Texture px per art unit; SVGs re-rasterise crisply at any size. */
const TEXTURE_DENSITY = 1.5;
/** Gap between layers along z, so the camera sees a little parallax between limbs. */
const LAYER_GAP = 0.018;

const textures = new Map<string, THREE.Texture>();

function layerTexture(fighterId: string, layer: SvgLayerId): THREE.Texture | null {
  const key = `${fighterId}:${layer}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const img = svgImage(fighterId, layer);
  if (!img) return null;
  const [cw, ch] = svgArt().canvas;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * TEXTURE_DENSITY);
  canvas.height = Math.round(ch * TEXTURE_DENSITY);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

interface Part {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

const auraGeometry = shared(new THREE.CircleGeometry(0.5, 32));

/** The layered SVG art as paper-thin cut-outs standing in the 3D arena. */
export class CutoutFighter extends Puppet3D {
  private readonly parts = new Map<SvgLayerId, Part>();
  private readonly present = new Set<SvgLayerId>();
  private readonly aura: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private cloth = 0;
  private lastTime: number | null = null;

  constructor(parent: THREE.Object3D, data: FighterData, drawOrder: number) {
    super(parent, data);
    const [cw, ch] = svgArt().canvas;
    const s = data.svg!.scale * PX;

    this.aura = new THREE.Mesh(
      auraGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    this.aura.position.set(0, (data.body.height / 2) * PX, -0.2);
    this.aura.scale.set(data.body.width * 1.7 * PX, data.body.height * 1.15 * PX, 1);
    this.aura.renderOrder = drawOrder * 20;
    this.root.add(this.aura);

    SVG_DRAW_ORDER.forEach((layer, i) => {
      const map = layerTexture(data.id, layer);
      if (!map) return;
      const material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cw * s, ch * s), material);
      mesh.castShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
      mesh.renderOrder = drawOrder * 20 + 1 + i;
      const pivot = new THREE.Group();
      pivot.position.z = (i - SVG_DRAW_ORDER.length / 2) * LAYER_GAP;
      pivot.add(mesh);
      this.root.add(pivot);
      this.parts.set(layer, { pivot, mesh, material });
      this.present.add(layer);
    });
  }

  render(frame: RigFrame): void {
    const cfg = this.data.svg!;
    const art = svgArt();
    const s = cfg.scale * PX;

    const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    const target = clothTarget(cfg, frame.wind, frame.time);
    this.cloth += (target - this.cloth) * (1 - Math.exp(-cfg.anim.cloth.lag * dt));

    const placements = layoutSvg(
      cfg,
      art,
      { pose: frame.pose, bob: frame.bob, grounded: frame.grounded, cloth: dt === 0 ? target : this.cloth },
      this.present,
    );
    for (const p of placements) {
      const part = this.parts.get(p.layer)!;
      part.pivot.position.x = p.x * PX;
      part.pivot.position.y = -p.y * PX;
      part.pivot.rotation.z = -p.rot * DEG;
      part.mesh.position.set((art.canvas[0] / 2 - p.pivot[0]) * s, -(art.canvas[1] / 2 - p.pivot[1]) * s, 0);
    }

    const hurt = frame.expression === 'hurt' || frame.expression === 'ko';
    this.parts.get('head')?.material.color.set(hurt ? 0xffb4b4 : 0xffffff);

    this.aura.visible = frame.aura !== undefined;
    if (frame.aura) {
      this.aura.material.color.set(frame.aura.color);
      this.aura.material.opacity = frame.aura.alpha * 1.5;
    }
  }

  protected setOpacity(alpha: number): void {
    for (const part of this.parts.values()) part.material.opacity = alpha;
  }
}
