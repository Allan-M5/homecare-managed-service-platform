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


document.addEventListener("click", () => {
  clickSound.init();
}, { once: true });

document.addEventListener("mousedown", (event) => {
  const target = event.target.closest("button, .nav-link, [role='button']");
  if (!target) return;
  clickSound.play();
});
