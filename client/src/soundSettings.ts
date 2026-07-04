export const SOUND_KEY = "soundEnabled";

export const getSoundEnabled = (): boolean => {
  const stored = localStorage.getItem(SOUND_KEY);
  return stored === null ? true : stored === "true";
};

export const setSoundEnabled = (enabled: boolean) => {
  localStorage.setItem(SOUND_KEY, String(enabled));
};
