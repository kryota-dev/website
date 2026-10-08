export const THEME_STORAGE_KEY = "theme";

export type ThemeChoice = "light" | "dark" | "system";

const EXPLICIT_THEMES = new Set<string>(["light", "dark"]);

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || EXPLICIT_THEMES.has(value as string);
}

/** Reads the saved choice; storage can be unavailable (private mode, blocked). */
export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(saved) ? saved : "system";
  } catch (error) {
    console.warn("Theme preference could not be read:", error);
    return "system";
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch (error) {
    console.warn("Theme preference could not be saved:", error);
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
}
