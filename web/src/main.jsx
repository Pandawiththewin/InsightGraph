import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";           // <- Tailwind v4 import lives here
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
