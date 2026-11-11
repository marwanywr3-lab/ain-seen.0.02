import React from "react";
import { createRoot } from "react-dom/client";
import { Admin } from "./admin";
import { useServiceUrl } from "./client";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-800.css";
import "./style.css";
const wordmark = new URL("../wordmark.png", import.meta.url).href;
function Portal() {
  const { base } = useServiceUrl();
  return (
    <>
      <header>
        <a href="./">
          <img src={wordmark} alt="عين سين" />
        </a>
        <a href="./">الرجوع للعبة</a>
      </header>
      <Admin base={base} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Portal />
  </React.StrictMode>,
);
