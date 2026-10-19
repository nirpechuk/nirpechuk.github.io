import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
try {
  const theme = localStorage.getItem("fitness-theme") ?? localStorage.getItem("theme");
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
} catch {}
class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="gate">
        <h1>Let’s try that again.</h1>
        <p>The journal could not display this view. Your saved entries are unchanged.</p>
        <button onClick={() => location.reload()}>Reload journal</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>
);
