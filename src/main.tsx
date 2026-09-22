import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./transport.css";
import "./drums.css";
import "./sequencer.css";
import "./generator.css";
import "./groove.css";
import "./history.css";
import "./family.css";
import "./arrange-foundation.css";
import "./arrange.css";
import "./sound.css";
import "./sample.css";
import "./style-dna.css";
import "./beat-morph.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Synth root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
