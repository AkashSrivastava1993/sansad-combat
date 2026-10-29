type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export const canFullscreen = Boolean(document.documentElement.requestFullscreen ?? (document.documentElement as FsElement).webkitRequestFullscreen);

const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

/** True on a phone whose browser cannot go fullscreen (iPhone Safari): only a home-screen install hides its bars. */
export const needsHomeScreenInstall = matchMedia('(pointer: coarse)').matches && !canFullscreen && !standalone;
