  import { createRoot } from "react-dom/client";
  import { BrowserRouter } from "react-router";
  import { Capacitor } from "@capacitor/core";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  // App instalável (PWA): registra o service worker depois do carregamento
  // (no app Android os arquivos já vêm empacotados: sem service worker)
  if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
