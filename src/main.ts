import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FightScene } from './scenes/FightScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { needsHomeScreenInstall } from './ui/platform';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-box',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // Transparent so the 3D stage canvas underneath shows through during fights.
  transparent: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, CharacterSelectScene, FightScene, ResultScene],
});

/** Sizes the page to what is actually visible; mobile browsers report a taller window while their bars are showing. */
function fitToViewport(): void {
  const vv = window.visualViewport;
  const style = document.documentElement.style;
  style.setProperty('--app-l', `${vv?.offsetLeft ?? 0}px`);
  style.setProperty('--app-t', `${vv?.offsetTop ?? 0}px`);
  style.setProperty('--app-w', `${vv?.width ?? window.innerWidth}px`);
  style.setProperty('--app-h', `${vv?.height ?? window.innerHeight}px`);
  game.scale.refresh();
}
// iPhone Safari hides its bars only when the page is scrolled; the page is made scrollable (see .hide-bars in style.css).
if (needsHomeScreenInstall) {
  document.documentElement.classList.add('hide-bars');
  // #game is fixed, so Phaser's cached canvas offset (page-relative) goes stale as the page scrolls.
  window.addEventListener('scroll', () => game.scale.updateBounds(), { passive: true });
}
fitToViewport();
window.visualViewport?.addEventListener('resize', fitToViewport);
window.addEventListener('resize', fitToViewport);
window.addEventListener('orientationchange', fitToViewport);
