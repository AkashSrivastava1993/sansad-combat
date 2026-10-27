import Phaser from 'phaser';
import { getFighters } from '../characters/registry';
import { loadSvgAtlas } from '../rig/svg/atlas';
import { SceneKey } from './sceneData';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  // Queue asset loading here once sprites and audio exist.
  create(): void {
    // A fighter whose SVG art fails to load is logged by the loader and left without art.
    void loadSvgAtlas(this, getFighters()).finally(() => this.scene.start(SceneKey.Menu));
  }
}
