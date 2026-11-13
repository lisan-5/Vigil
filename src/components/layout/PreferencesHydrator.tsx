import { useEffect } from "react";
import { useUI } from "@/stores/ui";

/** Loads persisted preferences after mount and keeps the theme class on <html> in sync. */
export function PreferencesHydrator() {
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    void useUI.persist.rehydrate();
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}
