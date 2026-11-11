import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-800.css";
import React from "react";
import { createRoot } from "react-dom/client";
import RemoteApp from "./RemoteApp";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RemoteApp />
  </React.StrictMode>,
);
