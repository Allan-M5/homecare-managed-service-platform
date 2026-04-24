import clickSound from "./utils/clickSound";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


const SOUND_SELECTOR = "button, .nav-link, [role='button'], a, input[type=\"submit\"], input[type=\"button\"]";

const ensureSoundReady = () => {
  clickSound.init();
};

document.addEventListener("pointerdown", ensureSoundReady, { once: true });
document.addEventListener("keydown", ensureSoundReady, { once: true });

document.addEventListener("pointerdown", (event) => {
  const target = event.target.closest(SOUND_SELECTOR);
  if (!target) return;
  clickSound.play();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest(SOUND_SELECTOR);
  if (!target) return;
  clickSound.play();
});
