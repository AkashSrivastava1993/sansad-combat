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
    // Fighters whose SVG art fails to load simply keep the procedural rig.
    void loadSvgAtlas(this, getFighters()).finally(() => this.scene.start(SceneKey.Menu));
  }
}
