import * as THREE from "three";

export const loadProgress = {
  loaded: 0,
  total: 1,
  url: "",
  active: true,
};

THREE.DefaultLoadingManager.onStart = (_url, loaded, total) => {
  loadProgress.active = true;
  loadProgress.loaded = loaded;
  loadProgress.total = Math.max(total, 1);
};

THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
  loadProgress.url = url;
  loadProgress.loaded = loaded;
  loadProgress.total = Math.max(total, 1);
};

THREE.DefaultLoadingManager.onLoad = () => {
  loadProgress.active = false;
  loadProgress.loaded = loadProgress.total;
};

THREE.DefaultLoadingManager.onError = (url) => {
  console.warn("load failed", url);
};

export function loadPct() {
  return Math.min(100, Math.round((100 * loadProgress.loaded) / loadProgress.total));
}
