# A brand's personality, read from its tokens

Part of the rms-design-system-engine reference (`rms-design-system-engine --reference personality`). The style guide's Identity page reads it for the brand or theme in view, from what its tokens draw, and draws it as one chart.

---

## The chart

Eight axes, each a pair of opposites set across the circle from each other. Every axis is read as a lean from -100% to +100%:

- 0 is balanced (the dashed ring);
- +100% reaches the first pole at the rim;
- -100% reaches the opposite one.

The two poles of an axis always add up to the whole, so a shape reaching towards one pole pulls back from its opposite.

| Axis | First pole (+) | Opposite (-) |
| --- | --- | --- |
| 1 | Bold | Quiet |
| 2 | Flat | Dimensional |
| 3 | Technical | Human |
| 4 | Sharp | Soft |
| 5 | Corporate | Friendly |
| 6 | Fast | Calm |
| 7 | Premium | Safe |
| 8 | Warm | Cool |

**Light and dark.** Colour is read in each colour mode the system has, and each mode draws its own shape: light whole, dark dashed, one over the other. A brand vivid in light and only greys in dark is perceived as both, so the two shapes show where the modes disagree. The title, the list and the leans are the two modes together (their average).

The title names the three strongest leanings, always in the chart's own order (Bold before Friendly before Warm), so the same three words read the same in every theme. The list beside the chart gives, for each axis:

- its winning pole and its lean (under 10% is shown as Balanced);
- what the lean was read from, with each mode's colour where the modes differ.

## The words beside the chart

On the left of the tile, three lines describe the brand; the chart sits on the right.

1. **The character.** The brand as a person, built from its three strongest leanings:
   - the strongest is who it is (Corporate: a professional; Bold: a showman);
   - the second is how it is (dependable, precise);
   - the third is what it is at heart.

   Then what it wears, as the tokens draw it:
   - colour: white and grey with a blue accent, or vivid orange rooms;
   - corners;
   - lines;
   - shadows.

   For example: "A cool-headed professional, dependable at heart, in white and grey with a blue accent, rounded corners, hairlines and soft shadows."
2. **What it does.** The three strongest leanings said as of a person, each as heavy as it leans. For example: "It means business, keeps a cool head and plays it safe."
3. **The proof.** One row per leaning, with the signals behind it in plain words on a simple scale, never as raw values:
   - vivid, soft or muted colours;
   - very high, high, moderate or low contrast;
   - neutral, tinted or coloured backgrounds;
   - square corners, subtle rounding, rounded or very rounded corners;
   - fine, firm or thick lines;
   - no shadows, few subtle shadows, subtle shadows or hard shadows;
   - light, regular, strong or heavy type;
   - quick, steady, slow or bouncy motion;
   - tight, regular or generous space;
   - one accent colour or a colourful palette.

   A last row, "But …", names the strongest leaning that pulls the other way, when there is one.

The chart's strongest three poles are named in the brand's hue.

## What each signal says

These are the readings the weights below put into numbers.

**Colour.** It weighs, but less than shape, type, lines, shadows and motion. Its hue is what it moves most: warm or cool.

- A stronger, more vivid colour reads more dynamic and more intense.
- Brands of one system that change only the primary (and the neutral ramp tinted by it) should read almost alike. What tells them apart is mostly that some are warmer and some cooler; their shape barely changes otherwise.

**Contrast.** This is the main text on the app's background, read in each mode.

- The strongest contrast reads bold, present and safe: it is not calm, and not friendly.
- A softer one reads more elegant.

**Type.**

- Thin type reads premium, soft, delicate and serene.
- Heavy type reads heavy, graphic and present.

**Space.** More room breathes, and reads premium.

**Motion.**

- Slow motion reads premium.
- Fast motion reads like a startup: agile and quick.

**Softness is subtlety, not corners alone.** Round corners help, but softness also needs:

- subtle shadows;
- thin type;
- fine lines.

An interface without shadows can never be the softest, however round its corners. Heavy type and 2px lines keep a round interface from reading soft: it leans a little technical, even a little sharp.

**Corners.**

- No rounding reads completely cold, direct and pragmatic. 2px reads the same.
- As the corners start to round, they read a little more inviting and friendly.
- From about 16 to 18px they read warm. How warm also depends on the colour: a warm or a cool hue changes how warm the interface feels.

**Shadows.**

- None at all reads direct, graphic and flat, without distraction.
- Marked shadows (little blur, dark) read like comics: graphic, technical, tech, retro.
- Faded shadows (wide blur, subtle, low contrast) can read premium.

**Lines.** Over 1px reads more graphic, bold, technological and retro; 2px already reads thick.

**Grounds.** Backgrounds are weighed by how much their component is seen, as shadows are.

- Many pure white backgrounds read corporate and distant.
- In dark mode, pure black backgrounds read the same.

**Corporate.** A palette that takes no risk reads corporate, with little personality:

- a blue primary;
- neutral grounds: plain whites and greys, not tinted by the brand;
- a small palette: greys, one primary and one contrasting colour.

**Premium is elegance:**

- room;
- thin type;
- slow motion;
- faded shadows;
- hairlines;
- a softer contrast;
- quiet colour.

**Safe is the standard that commits to nothing:**

- the strongest contrast;
- regular weights and lines;
- the usual speed.

A system's own default theme usually reads safe, not premium.

## The signals

Every signal is read from the tokens as the page draws them: the brand chosen, and a saved theme over it.

The colour signals are read once per colour mode:

- primary
- contrast
- pure grounds

| Signal | Read from | Measure |
| --- | --- | --- |
| Hue | the primary colour (the token named primary hue, else brand or primary), per mode | its hue, 0–360° |
| Saturation | the primary colour, per mode | max − min of its RGB channels, 0–1; vivid = min(1, saturation × 1.3) |
| Warmth | hue and saturation, of the primary and (a third as much) the secondary | 1 within 35° of 35° (reds, oranges, yellows), 0 at 70° away (greens, purples), −1 beyond (blues), × min(1, saturation × 1.4) |
| Contrast | the main text colour on the app background, per mode | its ratio; its lean = (ratio − 9) ÷ 6, so 9:1 is neutral, 15:1 and over the strongest |
| Pure grounds | backgrounds, surfaces and containers, per mode | share drawn in pure white (light) or pure black (dark) |
| Neutral grounds | the same grounds, per mode | share with no tint (RGB channels within 4% of each other) |
| Blue | hue and saturation, per mode | cos(hue − 220°)² × min(1, saturation × 1.4), 0 when the hue is more than 90° from blue |
| Palette | the primitive colours, status colours aside | hue families (30° each) with saturation over 0.25: 2 or fewer → +1, 5 or more → −1, between them a line |
| Corners | the controls' radius tokens (button, chip, tag, badge, checkbox, tab, toggle, switch, input) | the middle radius in px, a pill counted as half the control's height; else the middle of all radii |
| Softness | corners | 0 up to 2px, rising to 1 at 16px |
| Corner warmth | corners | (radius − 12) ÷ 12: 0 at 12px, warm from about 24px |
| Line | the border width most tokens follow | px; thick = min(1, line − 1) over 1px, else 0 (2px already thick) |
| Shadows | every shadow display switch | share switched on, each weighed by how much its component is used: 1 + the screens that hold it, so a shadow seen everywhere counts more than a rare one |
| Blur | every shadow blur | the middle blur, px |
| Shadow darkness | every shadow colour | its middle alpha (0.15 when none is read) |
| Marked | blur and darkness | (1 − blur ÷ 16) × 0.6 + min(1, alpha ÷ 0.35) × 0.4; faded = 1 − marked; both × the share of shadows on |
| Shadow softness | shadows | −1 with none on; else (2 × faded − 1) × min(1, share × 2) − (1 − min(1, share × 2)): few shadows on count as almost none |
| Depth | shadows and blur | share × (0.4 + 0.6 × min(1, blur ÷ 24)): a hard shadow with no blur is graphic, not deep |
| Typeface kind | the family's name | monospace +1, geometric +0.4, grotesque +0.3, humanist −0.4, serif −0.7, rounded −0.9 |
| Weight | the typography weight tokens | the heaviest, as (heaviest − 500) ÷ 200 (600 already reads heavy); and the lightest |
| Speed | the duration tokens | (260 − middle duration in ms) ÷ 160; whether an easing overshoots |
| Room | the spacing, gap and padding tokens | (middle px ÷ 12 − 1) × 1.5 |

## How each axis is read

Each lean is clamped to −1…+1, read in each mode, and averaged across the modes.

- **Bold ↔ Quiet:** bold is daring (heavy lines, hard shadows, colour on the backgrounds), and a brand that reads safe is not bold. heavy type, thick lines, strong contrast, marked shadows (or none at all) and a vivid primary read bold. Their opposites read quiet.
  (vivid × 2 − 1) × 0.2 + weight × 0.45 + thick × 0.35 + 0.1 if every shadow is off + marked × 0.15 + contrast × 0.25
- **Flat ↔ Dimensional:** no shadows read flat; many soft, far shadows read dimensional.
  1 − 2 × depth
- **Technical ↔ Human:** a flat interface reads technical.
  - Technical: a monospace, geometric or grotesque face, square corners, thick lines, marked shadows.
  - Human: humanist, serif or rounded faces, round corners, faded shadows.

  - Heavy type and few or no shadows lean technical too.

  typeface kind × 0.4 + (1 − 2 × softness) × 0.25 + thick × 0.25 + weight × 0.15 + marked × 0.3 − faded × 0.15 + (1 − min(1, share × 2)) × 0.15
- **Sharp ↔ Soft:** flat with lines over 1px reads a little sharp.
  - Soft needs subtlety: round corners, faded shadows, thin type and fine lines.
  - Sharp: square corners, no shadows, heavy type, thick lines.

  −((2 × softness − 1) × 0.25 + shadow softness × 0.3 − weight × 0.2 + (0.3 for hairlines, else −thick) × 0.25)
- **Corporate ↔ Friendly:** the hue's warmth is read on Warm ↔ Cool, not here.
  - Corporate: square corners, a blue primary, pure and neutral grounds, a small palette, strong contrast.
  - Friendly: rounding corners, an overshooting easing, a warm hue, tinted grounds, many hues.

  −(2 × softness − 1) × 0.35 − warmth × 0.15 + blue × 0.2 − 0.15 if overshoot + (pure grounds − 0.3) × 0.4 + (neutral grounds − 0.5) × 0.3 + palette × 0.15 + contrast × 0.2
- **Fast ↔ Calm:**
  - Fast: short transitions, an overshoot, strong contrast, a vivid colour, heavy type, thick lines, marked shadows: an energetic brand is not calm.
  - Calm: long transitions, softer contrast, thin type, fine lines.

  speed × 0.6 + (vivid − 0.5) × 0.2 + weight × 0.15 + thick × 0.2 + marked × 0.2 + 0.15 if overshoot + contrast × 0.2
- **Premium ↔ Safe:** elegance against the standard. Bold choices are not safe: a lean to Safe shrinks by how bold the picks are, min(1, thick × 0.45 + marked × 0.45 + (weight − 0.5) × 0.4 when over 0).
  room × 0.25 − weight × 0.3 − speed × 0.2 + (0.05 for hairlines, else −thick × 0.3) + faded × 0.25 − marked × 0.15 + (0.5 − vivid) × 0.1 + 0.1 for a serif or geometric face + 0.15 if the lightest weight is under 400 − contrast × 0.35 − (pure grounds − 0.3) × 0.2 − 0.1
- **Warm ↔ Cool:** not colour alone. Colour helps, corners and soft shadows warm as much; no shadows or hard ones cool.
  warmth × 0.45 + corner warmth × 0.3 + shadow softness × 0.25

## The layout stays put

The Identity page keeps every card in the same place from theme to theme, so themes can be compared:

- its spacing is the page's own, never a theme's;
- every card's edge is drawn inside it, so a thicker line moves nothing;
- every card that is not a colour sample stands on one ground: the page's background, a step up;
- edges share one solid colour.

A theme's character shows inside the cards: its colours, corners, line width, type and spacing samples.

## Changing the reading

The weights above are the engine's reading. If a system's tokens use other names, it reads the nearest token it finds. An axis with nothing to read (no motion tokens, say) leans only on what it has.

To change a weight or add a signal, change the personality block of `bkDraw` in `templates/styleguide.template.html` and this page together.
