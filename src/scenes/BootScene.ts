import Phaser from 'phaser';
import { getFighters } from '../characters/registry';
import { preloadModels } from '../render3d/modelLoader';
import { loadSvgAtlas } from '../rig/svg/atlas';
import { SceneKey } from './sceneData';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  // Queue asset loading here once sprites and audio exist.
  create(): void {
    // Models load in the background; a fight that starts before one arrives shows the placeholder meanwhile.
    preloadModels(getFighters());
    // A fighter whose SVG art fails to load is logged by the loader and left without art.
    void loadSvgAtlas(this, getFighters()).finally(() => this.scene.start(SceneKey.Menu));
  }
}
