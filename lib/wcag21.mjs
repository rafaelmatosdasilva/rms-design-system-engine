// wcag21.mjs - every WCAG 2.1 and 2.2 success criterion at level A and AA, and how the engine covers each one for a component.
//
// how:
//   auto   - checked in the browser on every variant (wcag-page.js, in the style guide and in the audit). `kinds` are the
//            findings that fail it; `ran` the checks that show it was tried (a component with no link never tries 2.4.4).
//   audit  - checked by the audit's browser sweep only (a11y-check.mjs: zoom, text spacing, reflow, a keyboard trap).
//   static - checked in the code (a11y-static.mjs: single-key shortcuts, short timers, gestures, device motion).
//   person - needs a person's judgement (whether a caption is accurate, whether a heading describes): `person` says
//            what to look at, and `steps` the few short things to do to see it, so two people checking the same
//            criterion check the same way. Every criterion with a `person` has them.
//   page   - belongs to the page or the product a component sits in (its title, a skip link, consistent navigation),
//            not to a component. `pageKinds` are the findings that fail it on a product's own pages, tried there and
//            across them (page-criteria.mjs); a criterion with `pageKinds` and another `how` (3.3.7) is a person's on a
//            component and tried on the pages of a named flow.
//   media  - applies only where the component plays video or sound.
// The style guide shows each one per component (Accessibility area), the audit counts them. Plain words in `says`.
// The words a finding is said in, and who acts on it, live apart (a11y-words.mjs): they decide nothing, so they must
// not sign a result. Said again from here so nothing that reads them has to know where they moved.
export { WCAG21_GUIDE, WHO_PROFILES, WCAG_TASKS, tasksFor, whoForCriterion } from './a11y-words.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WCAG21 = [
  { sc: '1.1.1', name: 'Non-text Content', level: 'A', how: 'auto', kinds: ['textalt', 'name', 'tooltipname'], says: 'An image, an icon or a control has words a screen reader can say.' },
  { sc: '1.2.1', name: 'Audio-only and Video-only (Prerecorded)', level: 'A', how: 'media', person: 'A recording with only sound has a transcript; one with only pictures has a text or sound description.', steps: ['Find the recording this plays.', 'Sound only: is a transcript offered beside it?', 'Pictures only: is there a text or a spoken description?'], says: 'A recording with only sound, or only pictures, has a text alternative.' },
  { sc: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', how: 'media', kinds: ['captions'], says: 'A video with sound has captions.' },
  { sc: '1.2.3', name: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', how: 'media', person: 'What only the picture shows is described, in sound or in text.', steps: ['Play the video with the sound off.', 'Is everything that only the picture shows said in words too, on the page or in a description track?'], says: 'What a video shows is also described.' },
  { sc: '1.2.4', name: 'Captions (Live)', level: 'AA', how: 'media', person: 'A live stream with sound has live captions.', steps: ['Start the live stream and turn the captions on.', 'Do they appear, and do they keep up with what is being said?'], says: 'A live video with sound has captions.' },
  { sc: '1.2.5', name: 'Audio Description (Prerecorded)', level: 'AA', how: 'media', person: 'What only the picture shows is described in sound.', steps: ['Play the video without looking at the screen.', 'Is what only the picture shows described out loud?'], says: 'What a video shows is also described in sound.' },
  { sc: '1.3.1', name: 'Info and Relationships', level: 'A', how: 'auto', kinds: ['group', 'table', 'context', 'partrole', 'annotation'], ran: ['group', 'table', 'context'], says: 'What the look shows (a group, a table, a label) is also in the code.' },
  { sc: '1.3.2', name: 'Meaningful Sequence', level: 'A', how: 'auto', kinds: ['order'], ran: ['order'], says: 'It reads in the order it is seen.' },
  { sc: '1.3.3', name: 'Sensory Characteristics', level: 'A', how: 'person', person: 'No instruction relies only on shape, colour, size or position ("press the round button", "the item on the right").', steps: ['Read every instruction it shows.', 'Does any of them point only by shape, colour, size or position ("the round button", "the one on the right")?', 'Look at it in greyscale and read them again: do they still say which control they mean?'], says: 'No instruction relies only on shape, colour or position.' },
  { sc: '1.3.4', name: 'Orientation', level: 'AA', how: 'page', says: 'The page works upright and sideways.' },
  { sc: '1.3.5', name: 'Identify Input Purpose', level: 'AA', how: 'auto', kinds: ['autocomplete'], ran: ['autocomplete'], says: 'A field that asks about the person (name, email, phone) says so with autocomplete.' },
  { sc: '1.4.1', name: 'Use of Color', level: 'A', how: 'auto', kinds: ['ariastate', 'statefollows'], says: 'No state or meaning is shown by colour alone.' },
  { sc: '1.4.2', name: 'Audio Control', level: 'A', how: 'media', kinds: ['autoaudio'], says: 'Sound that starts by itself can be stopped.' },
  { sc: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', how: 'auto', kinds: ['contrast', 'hovercontrast', 'statecontrast'], says: 'Text stands out 4.5:1 from its background (3:1 when large).' },
  { sc: '1.4.4', name: 'Resize Text', level: 'AA', how: 'audit', kinds: ['zoom'], says: 'Text can be zoomed to twice its size without being cut off.' },
  { sc: '1.4.5', name: 'Images of Text', level: 'AA', how: 'person', person: 'Words are real text, not a picture of text (a logo is fine).', steps: ['Zoom the page to 200%. Does the text stay sharp, or blur the way a picture does?', 'Try to select the text with the cursor: real text can be selected, a picture cannot.', 'A logo is fine. Anything else that turns out to be a picture is a designer\'s task, so say so instead of marking it checked.'], says: 'Words are text, not pictures of text.' },
  { sc: '1.4.10', name: 'Reflow', level: 'AA', how: 'audit', kinds: ['reflow', 'zoom'], says: 'It fits a narrow screen (320 pixels) without scrolling sideways.' },
  { sc: '1.4.11', name: 'Non-text Contrast', level: 'AA', how: 'auto', kinds: ['boundary', 'focuscontrast', 'iconcontrast', 'stateedge'], ran: ['boundary'], says: 'The edge of a control, an icon and the focus ring stand out 3:1 from what is around them.' },
  { sc: '1.4.12', name: 'Text Spacing', level: 'AA', how: 'audit', kinds: ['spacing'], says: 'Nothing is cut off when a reader widens the spacing between letters, words and lines.' },
  { sc: '1.4.13', name: 'Content on Hover or Focus', level: 'AA', how: 'auto', kinds: ['hovercontent', 'tapcontent'], ran: ['hovercontent', 'tapcontent'], says: 'What shows on hover or focus closes with Escape, stays while the pointer is on it, and stays until the person moves away.' },
  { sc: '2.1.1', name: 'Keyboard', level: 'A', how: 'auto', kinds: ['keyboard', 'activate', 'arrows', 'behaviour', 'escape', 'homeend', 'comboboxkeys'], says: 'Everything it does can be done with the keyboard.' },
  { sc: '2.1.2', name: 'No Keyboard Trap', level: 'A', how: 'audit', kinds: ['tabtrap'], says: 'Tab never gets stuck in it.' },
  { sc: '2.1.4', name: 'Character Key Shortcuts', level: 'A', how: 'static', kinds: ['shortcut'], says: 'No shortcut is a single letter or number alone (one can be turned off or changed).' },
  { sc: '2.2.1', name: 'Timing Adjustable', level: 'A', how: 'static', kinds: ['timing'], says: 'Nothing that needs reading or acting on disappears on a short timer.' },
  { sc: '2.2.2', name: 'Pause, Stop, Hide', level: 'A', how: 'auto', kinds: ['pause'], ran: ['moving'], says: 'What moves by itself for more than 5 seconds can be paused (a loading indicator is fine).' },
  { sc: '2.3.1', name: 'Three Flashes or Below Threshold', level: 'A', how: 'auto', kinds: ['flash'], ran: ['moving'], says: 'Nothing flashes more than three times a second.' },
  { sc: '2.4.1', name: 'Bypass Blocks', level: 'A', how: 'page', pageKinds: ['bypass'], says: 'The page lets a person skip past repeated blocks.' },
  { sc: '2.4.2', name: 'Page Titled', level: 'A', how: 'page', pageKinds: ['pagetitle'], says: 'The page has a title that says what it is.' },
  { sc: '2.4.3', name: 'Focus Order', level: 'A', how: 'auto', kinds: ['order', 'tabindex', 'focusreturn', 'pageorder', 'modalescape'], ran: ['order', 'modalescape', 'focusreturn'], says: 'Tab moves through it in an order that makes sense, and the focus comes back after a dialog closes.' },
  { sc: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', how: 'auto', kinds: ['link', 'samename'], ran: ['link', 'samename'], says: 'A link says where it goes.' },
  { sc: '2.4.5', name: 'Multiple Ways', level: 'AA', how: 'page', says: 'The product offers more than one way to find a page.' },
  { sc: '2.4.6', name: 'Headings and Labels', level: 'AA', how: 'auto', kinds: ['emptylabel', 'weakname'], ran: ['emptylabel', 'weakname'], person: 'Each heading and label says what follows it.', steps: ['Read each heading and label it shows.', 'Does each one say what follows it, without reading the rest of the page?'], says: 'Headings and labels are there and say what they are for.' },
  { sc: '2.4.7', name: 'Focus Visible', level: 'AA', how: 'auto', kinds: ['focus', 'forcedfocus', 'focushidden'], says: 'The keyboard focus shows.' },
  { sc: '2.5.1', name: 'Pointer Gestures', level: 'A', how: 'static', kinds: ['gesture'], says: 'Nothing needs two fingers or a drawn path; one tap does it too.' },
  { sc: '2.5.2', name: 'Pointer Cancellation', level: 'A', how: 'auto', kinds: ['pointerdown'], ran: ['pointerdown'], says: 'A control acts when released, so sliding off cancels it.' },
  { sc: '2.5.3', name: 'Label in Name', level: 'A', how: 'auto', kinds: ['labelname'], ran: ['labelname'], says: 'The words shown on a control are in its name, so voice control finds it.' },
  { sc: '2.5.4', name: 'Motion Actuation', level: 'A', how: 'static', kinds: ['motionact'], says: 'Nothing works only by shaking or tilting the device.' },
  { sc: '3.1.1', name: 'Language of Page', level: 'A', how: 'page', pageKinds: ['pagelang'], says: 'The page says its language.' },
  { sc: '3.1.2', name: 'Language of Parts', level: 'AA', how: 'person', person: 'Words in another language are marked with lang.', steps: ['Look for words in a language other than the page\'s.', 'In the inspector, does the element around them carry lang?', 'With a screen reader on, do those words change voice?'], says: 'Words in another language are marked.' },
  { sc: '3.2.1', name: 'On Focus', level: 'A', how: 'auto', kinds: ['onfocus'], ran: ['onfocus'], says: 'Taking the focus changes nothing else.' },
  { sc: '3.2.2', name: 'On Input', level: 'A', how: 'auto', kinds: ['oninput'], ran: ['oninput'], says: 'Changing a value does not open a page, send a form or move the focus.' },
  { sc: '3.2.3', name: 'Consistent Navigation', level: 'AA', how: 'page', pageKinds: ['navorder'], says: 'Navigation repeated across pages stays in the same order.' },
  { sc: '3.2.4', name: 'Consistent Identification', level: 'AA', how: 'page', pageKinds: ['namedalike'], says: 'What does the same thing is named the same way across pages.' },
  { sc: '3.3.1', name: 'Error Identification', level: 'A', how: 'auto', kinds: ['rolecontract', 'partrole'], says: 'An error is said in words and linked to its field.' },
  { sc: '3.3.2', name: 'Labels or Instructions', level: 'A', how: 'auto', kinds: ['name', 'placeholderlabel'], says: 'A field has a label.' },
  { sc: '3.3.3', name: 'Error Suggestion', level: 'AA', how: 'person', person: 'An error message says how to put it right.', steps: ['Make it fail: leave the field empty, or type something it refuses.', 'Read the message: does it say how to put it right, not only that it is wrong?'], says: 'An error says how to put it right.' },
  { sc: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', level: 'AA', how: 'page', pageKinds: ['legalstep'], says: 'A form that commits money, law or data can be checked or undone.' },
  { sc: '4.1.1', name: 'Parsing', level: 'A', how: 'auto', kinds: ['dupid'], ran: ['aria'], says: 'Each id is used once.' },
  { sc: '4.1.2', name: 'Name, Role, Value', level: 'A', how: 'auto', kinds: ['name', 'aria', 'ariastate', 'rolecontract', 'semantics', 'statefollows', 'fakelink'], ran: ['aria'], says: 'Each control has a name, a role and a state a screen reader can tell.' },
  { sc: '4.1.3', name: 'Status Messages', level: 'AA', how: 'auto', kinds: ['status', 'unannounced'], ran: ['status'], says: 'A message, a toast or a loader is announced without taking the focus.' },
];

// WCAG 2.2 at level A and AA, the engine's target: the 2.1 criteria without 4.1.1 Parsing (2.2 removed it: a duplicate id
// still breaks a label or a reference, so it is counted under 4.1.2), and the six 2.2 added at A and AA.
export const WCAG22_NEW = [
  { sc: '2.4.11', name: 'Focus Not Obscured (Minimum)', level: 'AA', how: 'audit', kinds: ['obscured'], says: 'A control is never completely hidden (by a sticky header, a banner) when it takes the focus.' },
  { sc: '2.5.7', name: 'Dragging Movements', level: 'AA', how: 'auto', kinds: ['dragging'], ran: ['dragging'], person: 'What is done by dragging can also be done with a single click or tap (buttons to move an item, a click on a track).', steps: ['Do what it does by dragging.', 'Now try the same with single clicks or taps only: is there a way?'], says: 'What is done by dragging can also be done with one click or tap.' },
  { sc: '2.5.8', name: 'Target Size (Minimum)', level: 'AA', how: 'audit', kinds: ['target'], says: 'A control is at least 24 by 24 pixels, or has room around it.' },
  { sc: '3.2.6', name: 'Consistent Help', level: 'A', how: 'page', pageKinds: ['helpplace'], says: 'Help (a contact, a chat, a help page) sits in the same place on every page that offers it.' },
  { sc: '3.3.7', name: 'Redundant Entry', level: 'A', how: 'person', person: 'A flow never asks for something the person already gave in it (it is filled in, or offered to pick).', steps: ['Walk the flow it sits in, from its first step.', 'Does any later step ask again for something already given?', 'A password asked again to keep an account safe is fine.'], pageKinds: ['askedagain'], says: 'A flow never asks twice for the same thing.' },
  { sc: '3.3.8', name: 'Accessible Authentication (Minimum)', level: 'AA', how: 'auto', kinds: ['authpaste', 'authfill'], ran: ['auth'], says: 'Signing in never needs a memory test: a password field takes paste and a password manager.' },
];
export const WCAG22 = [...WCAG21.filter((c) => c.sc !== '4.1.1').map((c) => (c.sc === '4.1.2' ? { ...c, kinds: [...c.kinds, 'dupid'] } : c)), ...WCAG22_NEW]
  .sort((a, b) => { const x = a.sc.split('.').map(Number), y = b.sc.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });

// The criterion each finding kind fails, in WCAG 2.2 (a duplicate id is under 4.1.2 there). WCAG21_KIND is its older name.
export const WCAG_KIND = Object.fromEntries(WCAG22.flatMap((c) => [...(c.kinds ?? []), ...(c.pageKinds ?? [])].map((k) => [k, c.sc])).reverse());
export const WCAG21_KIND = WCAG_KIND;

// The in-page checks, as source the audit injects and the style guide carries.
export const WCAG_PAGE_SOURCE = readFileSync(fileURLToPath(new URL('./wcag-page.js', import.meta.url)), 'utf8');
