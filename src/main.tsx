import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontes do lydcrm.com (Inter no texto, Montserrat nos títulos), servidas pelo próprio app (CSP font-src 'self').
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-800.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
