import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// The theme's dark tokens apply under the `.dark` class; keep it in sync with the OS setting.
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () =>
  document.documentElement.classList.toggle("dark", darkScheme.matches);
applyScheme();
darkScheme.addEventListener("change", applyScheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
