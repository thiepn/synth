import {
  STYLE_DNA_PROFILES,
  STYLE_DNA_VERSION,
  getStyleDNA,
  styleFamilyLabel,
  type StyleDNAFamily,
  type StyleDNAId,
} from "../../style/styleDNA";
import { MachineButton } from "../pulse/Primitives";

interface StyleDNAPanelProps {
  style: StyleDNAId;
  kitStatus: string;
  onStyleChange: (style: StyleDNAId) => void;
  onGenerateStyleKit: () => void;
}

const FAMILIES: readonly StyleDNAFamily[] = [
  "band",
  "urban",
  "club",
  "roots",
  "experimental",
];

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="style-dna-metric">
      <span>{label}</span>
      <i>
        <b style={{ width: Math.round(value * 100) + "%" }} />
      </i>
      <strong>{Math.round(value * 100)}</strong>
    </div>
  );
}

export function StyleDNAPanel({
  style,
  kitStatus,
  onStyleChange,
  onGenerateStyleKit,
}: StyleDNAPanelProps) {
  const dna = getStyleDNA(style);

  return (
    <section
      className="style-dna-panel"
      aria-labelledby="style-dna-title"
    >
      <div className="machine-section-label">
        <span id="style-dna-title">STYLE / DNA</span>
        <span>GENRE GRAMMAR / V{STYLE_DNA_VERSION}</span>
      </div>

      <div className="style-dna-panel__body">
        <div className="style-dna-library">
          {FAMILIES.map((family) => (
            <div
              className="style-dna-family"
              key={family}
            >
              <div className="style-dna-family__label">
                <span>{styleFamilyLabel(family)}</span>
                <strong>
                  {
                    STYLE_DNA_PROFILES.filter(
                      (entry) => entry.family === family,
                    ).length
                  }
                </strong>
              </div>

              <div className="style-dna-family__keys">
                {STYLE_DNA_PROFILES
                  .filter((entry) => entry.family === family)
                  .map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className={
                        entry.id === style
                          ? "style-dna-key is-active"
                          : "style-dna-key"
                      }
                      onClick={() => onStyleChange(entry.id)}
                      aria-pressed={entry.id === style}
                    >
                      <span>{entry.code}</span>
                      <strong>{entry.label}</strong>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="style-dna-inspector">
          <div className="style-dna-inspector__identity">
            <div>
              <span>{dna.code}</span>
              <strong>{dna.label}</strong>
            </div>
            <small>
              {dna.archetype.toUpperCase()} /{" "}
              {dna.subdivision.toUpperCase()}
            </small>
          </div>

          <dl className="style-dna-inspector__facts">
            <div>
              <dt>BPM</dt>
              <dd>
                {dna.bpmRange[0]}–{dna.bpmRange[1]}
              </dd>
            </div>
            <div>
              <dt>POCKET</dt>
              <dd>{dna.groove.personality.toUpperCase()}</dd>
            </div>
            <div>
              <dt>SWING</dt>
              <dd>{Math.round(dna.baseSwing * 100)}</dd>
            </div>
            <div>
              <dt>KIT</dt>
              <dd>{dna.sound.kitDirection.toUpperCase()}</dd>
            </div>
          </dl>

          <div className="style-dna-inspector__metrics">
            <Metric
              label="KICK SYNC"
              value={dna.rhythm.kickSyncopation}
            />
            <Metric
              label="BACKBEAT"
              value={dna.rhythm.backbeatStrength}
            />
            <Metric
              label="16TH HAT"
              value={dna.rhythm.hatSixteenth}
            />
            <Metric
              label="PERC"
              value={dna.rhythm.percussion}
            />
            <Metric
              label="GHOST"
              value={dna.groove.ghostNotes}
            />
            <Metric
              label="FILL"
              value={dna.fill.density}
            />
          </div>

          <div className="style-dna-sound">
            <div className="style-dna-sound__metrics">
              <Metric label="WEIGHT" value={dna.sound.weight} />
              <Metric
                label="BRIGHT"
                value={dna.sound.brightness}
              />
              <Metric
                label="ROUGH"
                value={dna.sound.roughness}
              />
              <Metric
                label="SYNTH"
                value={dna.sound.synthetic}
              />
              <Metric
                label="TIGHT"
                value={dna.sound.tightness}
              />
            </div>

            <MachineButton onClick={onGenerateStyleKit}>
              GENERATE STYLE KIT
            </MachineButton>
            <span className="style-dna-sound__status">
              {kitStatus}
            </span>
          </div>
        </div>

        <div className="style-dna-arrangement">
          <div className="style-dna-arrangement__head">
            <span>ARRANGEMENT / ENERGY</span>
            <strong>{dna.label}</strong>
          </div>

          {(
            [
              ["INTRO", dna.arrangement.intro],
              ["VERSE", dna.arrangement.verse],
              ["PRE", dna.arrangement.preChorus],
              ["CHORUS", dna.arrangement.chorus],
              ["BREAK", dna.arrangement.breakdown],
              ["BUILD", dna.arrangement.build],
              ["DROP", dna.arrangement.drop],
              ["OUTRO", dna.arrangement.outro],
            ] as const
          ).map(([label, value]) => (
            <Metric key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <p className="style-dna-panel__note">
        Style DNA controls rhythm grammar, pocket, fills, sound-material
        tendencies and arrangement energy. Intent rails still let you push the
        generated result away from the genre default.
      </p>
    </section>
  );
}
