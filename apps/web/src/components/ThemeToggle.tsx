"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sm-theme";

function applyTheme(mode: "dark" | "light") {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
}

export function ThemeToggle() {
  const [mode, setMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const next: "dark" | "light" = saved === "light" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }, []);

  function toggle() {
    const next: "dark" | "light" = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{ fontSize: 12, padding: "4px 10px" }}
      title="다크/라이트 모드 전환"
    >
      {mode === "dark" ? "라이트 모드" : "다크 모드"}
    </button>
  );
}
