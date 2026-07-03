import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/modals.css";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1時間

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
    }
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
