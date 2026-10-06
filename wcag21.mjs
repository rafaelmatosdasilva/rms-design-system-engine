// wcag21.mjs - every WCAG 2.1 success criterion at level A and AA, and how the engine covers each one for a component.
//
// how:
//   auto   - checked in the browser on every variant (wcag-page.js, in the style guide and in the audit). `kinds` are the
//            findings that fail it; `ran` the checks that show it was tried (a component with no link never tries 2.4.4).
//   audit  - checked by the audit's browser sweep only (a11y-check.mjs: zoom, text spacing, reflow, a keyboard trap).
//   static - checked in the code (a11y-static.mjs: single-key shortcuts, short timers, gestures, device motion).
//   person - needs a person's judgement (whether a caption is accurate, whether a heading describes): `person` says
//            what to look at.
//   page   - belongs to the page or the product a component sits in (its title, a skip link, consistent navigation),
//            not to a component.
//   media  - applies only where the component plays video or sound.
// The style guide shows each one per component (Accessibility area), the audit counts them. Plain words in `says`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WCAG21 = [
  { sc: '1.1.1', name: 'Non-text Content', level: 'A', how: 'auto', kinds: ['textalt', 'name', 'tooltipname'], says: 'An image, an icon or a control has words a screen reader can say.' },
  { sc: '1.2.1', name: 'Audio-only and Video-only (Prerecorded)', level: 'A', how: 'media', person: 'A recording with only sound has a transcript; one with only pictures has a text or sound description.', says: 'A recording with only sound, or only pictures, has a text alternative.' },
  { sc: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', how: 'media', kinds: ['captions'], says: 'A video with sound has captions.' },
  { sc: '1.2.3', name: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', how: 'media', person: 'What only the picture shows is described, in sound or in text.', says: 'What a video shows is also described.' },
  { sc: '1.2.4', name: 'Captions (Live)', level: 'AA', how: 'media', person: 'A live stream with sound has live captions.', says: 'A live video with sound has captions.' },
  { sc: '1.2.5', name: 'Audio Description (Prerecorded)', level: 'AA', how: 'media', person: 'What only the picture shows is described in sound.', says: 'What a video shows is also described in sound.' },
  { sc: '1.3.1', name: 'Info and Relationships', level: 'A', how: 'auto', kinds: ['group', 'table', 'context', 'partrole', 'annotation'], ran: ['group', 'table', 'context'], says: 'What the look shows (a group, a table, a label) is also in the code.' },
  { sc: '1.3.2', name: 'Meaningful Sequence', level: 'A', how: 'auto', kinds: ['order'], ran: ['order'], says: 'It reads in the order it is seen.' },
  { sc: '1.3.3', name: 'Sensory Characteristics', level: 'A', how: 'person', person: 'No instruction relies only on shape, colour, size or position ("press the round button", "the item on the right").', says: 'No instruction relies only on shape, colour or position.' },
  { sc: '1.3.4', name: 'Orientation', level: 'AA', how: 'page', says: 'The page works upright and sideways.' },
  { sc: '1.3.5', name: 'Identify Input Purpose', level: 'AA', how: 'auto', kinds: ['autocomplete'], ran: ['autocomplete'], says: 'A field that asks about the person (name, email, phone) says so with autocomplete.' },
  { sc: '1.4.1', name: 'Use of Color', level: 'A', how: 'auto', kinds: ['ariastate', 'statefollows'], says: 'No state or meaning is shown by colour alone.' },
  { sc: '1.4.2', name: 'Audio Control', level: 'A', how: 'media', kinds: ['autoaudio'], says: 'Sound that starts by itself can be stopped.' },
  { sc: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', how: 'auto', kinds: ['contrast', 'hovercontrast'], says: 'Text stands out 4.5:1 from its background (3:1 when large).' },
  { sc: '1.4.4', name: 'Resize Text', level: 'AA', how: 'audit', kinds: ['zoom'], says: 'Text can be zoomed to twice its size without being cut off.' },
  { sc: '1.4.5', name: 'Images of Text', level: 'AA', how: 'person', person: 'Words are real text, not a picture of text (a logo is fine).', says: 'Words are text, not pictures of text.' },
  { sc: '1.4.10', name: 'Reflow', level: 'AA', how: 'audit', kinds: ['reflow', 'zoom'], says: 'It fits a narrow screen (320 pixels) without scrolling sideways.' },
  { sc: '1.4.11', name: 'Non-text Contrast', level: 'AA', how: 'auto', kinds: ['boundary', 'focuscontrast', 'iconcontrast'], ran: ['boundary'], says: 'The edge of a control, an icon and the focus ring stand out 3:1 from what is around them.' },
  { sc: '1.4.12', name: 'Text Spacing', level: 'AA', how: 'audit', kinds: ['spacing'], says: 'Nothing is cut off when a reader widens the spacing between letters, words and lines.' },
  { sc: '1.4.13', name: 'Content on Hover or Focus', level: 'AA', how: 'auto', kinds: ['hovercontent'], ran: ['hovercontent'], says: 'What shows on hover or focus closes with Escape, stays while the pointer is on it, and stays until the person moves away.' },
  { sc: '2.1.1', name: 'Keyboard', level: 'A', how: 'auto', kinds: ['keyboard', 'activate', 'arrows', 'behaviour', 'escape'], says: 'Everything it does can be done with the keyboard.' },
  { sc: '2.1.2', name: 'No Keyboard Trap', level: 'A', how: 'audit', kinds: ['tabtrap'], says: 'Tab never gets stuck in it.' },
  { sc: '2.1.4', name: 'Character Key Shortcuts', level: 'A', how: 'static', kinds: ['shortcut'], says: 'No shortcut is a single letter or number alone (one can be turned off or changed).' },
  { sc: '2.2.1', name: 'Timing Adjustable', level: 'A', how: 'static', kinds: ['timing'], says: 'Nothing that needs reading or acting on disappears on a short timer.' },
  { sc: '2.2.2', name: 'Pause, Stop, Hide', level: 'A', how: 'auto', kinds: ['pause'], ran: ['moving'], says: 'What moves by itself for more than 5 seconds can be paused (a loading indicator is fine).' },
  { sc: '2.3.1', name: 'Three Flashes or Below Threshold', level: 'A', how: 'auto', kinds: ['flash'], ran: ['moving'], says: 'Nothing flashes more than three times a second.' },
  { sc: '2.4.1', name: 'Bypass Blocks', level: 'A', how: 'page', says: 'The page lets a person skip past repeated blocks.' },
  { sc: '2.4.2', name: 'Page Titled', level: 'A', how: 'page', says: 'The page has a title that says what it is.' },
  { sc: '2.4.3', name: 'Focus Order', level: 'A', how: 'auto', kinds: ['order', 'tabindex', 'focusreturn'], ran: ['order'], says: 'Tab moves through it in an order that makes sense, and the focus comes back after a dialog closes.' },
  { sc: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', how: 'auto', kinds: ['link'], ran: ['link'], says: 'A link says where it goes.' },
  { sc: '2.4.5', name: 'Multiple Ways', level: 'AA', how: 'page', says: 'The product offers more than one way to find a page.' },
  { sc: '2.4.6', name: 'Headings and Labels', level: 'AA', how: 'auto', kinds: ['emptylabel'], ran: ['emptylabel'], person: 'Each heading and label says what follows it.', says: 'Headings and labels are there and say what they are for.' },
  { sc: '2.4.7', name: 'Focus Visible', level: 'AA', how: 'auto', kinds: ['focus', 'forcedfocus'], says: 'The keyboard focus shows.' },
  { sc: '2.5.1', name: 'Pointer Gestures', level: 'A', how: 'static', kinds: ['gesture'], says: 'Nothing needs two fingers or a drawn path; one tap does it too.' },
  { sc: '2.5.2', name: 'Pointer Cancellation', level: 'A', how: 'auto', kinds: ['pointerdown'], ran: ['pointerdown'], says: 'A control acts when released, so sliding off cancels it.' },
  { sc: '2.5.3', name: 'Label in Name', level: 'A', how: 'auto', kinds: ['labelname'], ran: ['labelname'], says: 'The words shown on a control are in its name, so voice control finds it.' },
  { sc: '2.5.4', name: 'Motion Actuation', level: 'A', how: 'static', kinds: ['motionact'], says: 'Nothing works only by shaking or tilting the device.' },
  { sc: '3.1.1', name: 'Language of Page', level: 'A', how: 'page', says: 'The page says its language.' },
  { sc: '3.1.2', name: 'Language of Parts', level: 'AA', how: 'person', person: 'Words in another language are marked with lang.', says: 'Words in another language are marked.' },
  { sc: '3.2.1', name: 'On Focus', level: 'A', how: 'auto', kinds: ['onfocus'], ran: ['onfocus'], says: 'Taking the focus changes nothing else.' },
  { sc: '3.2.2', name: 'On Input', level: 'A', how: 'auto', kinds: ['oninput'], ran: ['oninput'], says: 'Changing a value does not open a page, send a form or move the focus.' },
  { sc: '3.2.3', name: 'Consistent Navigation', level: 'AA', how: 'page', says: 'Navigation repeated across pages stays in the same order.' },
  { sc: '3.2.4', name: 'Consistent Identification', level: 'AA', how: 'page', says: 'What does the same thing is named the same way across pages.' },
  { sc: '3.3.1', name: 'Error Identification', level: 'A', how: 'auto', kinds: ['rolecontract', 'partrole'], says: 'An error is said in words and linked to its field.' },
  { sc: '3.3.2', name: 'Labels or Instructions', level: 'A', how: 'auto', kinds: ['name'], says: 'A field has a label.' },
  { sc: '3.3.3', name: 'Error Suggestion', level: 'AA', how: 'person', person: 'An error message says how to put it right.', says: 'An error says how to put it right.' },
  { sc: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', level: 'AA', how: 'page', says: 'A form that commits money, law or data can be checked or undone.' },
  { sc: '4.1.1', name: 'Parsing', level: 'A', how: 'auto', kinds: ['dupid'], ran: ['aria'], says: 'Each id is used once.' },
  { sc: '4.1.2', name: 'Name, Role, Value', level: 'A', how: 'auto', kinds: ['name', 'aria', 'ariastate', 'rolecontract', 'semantics', 'statefollows'], ran: ['aria'], says: 'Each control has a name, a role and a state a screen reader can tell.' },
  { sc: '4.1.3', name: 'Status Messages', level: 'AA', how: 'auto', kinds: ['status'], ran: ['status'], says: 'A message, a toast or a loader is announced without taking the focus.' },
];

// The finding kinds the new checks add, in plain words (merged into a11y-check.mjs A11Y_GUIDE).
const plural = (n, one, many) => `${n === 1 ? 'One' : n} ${n === 1 ? one : many}`;
export const WCAG21_GUIDE = {
  textalt: { title: (n) => `${plural(n, 'image has', 'images have')} no words for a screen reader`, why: 'An image, an image button or a role="img" with no alt or name is skipped or read as its file name.', fix: 'Add alt="<what it shows>" (alt="" when it is only decoration), or aria-label on a role="img".' },
  captions: { title: (n) => `${plural(n, 'video has', 'videos have')} no captions`, why: 'People who cannot hear the sound miss what is said.', fix: 'Add a <track kind="captions"> with the captions.' },
  autoaudio: { title: (n) => `${plural(n, 'recording plays', 'recordings play')} sound by itself`, why: 'Sound that starts on its own covers what a screen reader says.', fix: 'Do not autoplay with sound: start muted, or let the person start it, with controls to stop it.' },
  group: { title: (n) => `${plural(n, 'group of choices is', 'groups of choices are')} not named as a group`, why: 'A screen reader announces each radio button alone, without the question they answer.', fix: 'Put the choices in a <fieldset> with a <legend>, or give their container role="radiogroup" (or "group") and aria-label.' },
  table: { title: (n) => `${plural(n, 'table has', 'tables have')} no header cells`, why: 'A screen reader cannot say which column or row a cell belongs to.', fix: 'Make the first row (or column) <th> cells, with scope="col" or scope="row".' },
  context: { title: (n) => `${plural(n, 'item sits', 'items sit')} outside the container its role needs`, why: 'A tab outside a tab list, an option outside a list box or a list item outside a list is not announced as part of its set.', fix: 'Put it inside the container its role needs (role="tablist", role="listbox", <ul>), or give it another role.' },
  order: { title: (n) => `${plural(n, 'control comes', 'controls come')} in a different order to Tab than on screen`, why: 'The keyboard and a screen reader follow the code\'s order; here it differs from the order it is seen in, which is confusing.', fix: 'Put the elements in the code in the order they are shown (avoid CSS order and row-reverse to reorder controls).' },
  autocomplete: { title: (n) => `${plural(n, 'field asks', 'fields ask')} about the person without saying so`, why: 'Browsers and assistive tools fill in a name, an email or a phone number only when the field says what it asks for.', fix: 'Add the autocomplete value the finding names (autocomplete="email", "given-name", "tel").' },
  boundary: { title: (n) => `${plural(n, 'control edge is', 'control edges are')} too faint to see`, why: 'The border of a field, a checkbox, a radio or a switch is too close in colour to what is around it, so people with low vision cannot find the control.', fix: 'Make the border (or the fill) at least 3 times the contrast of the background around it.' },
  hovercontent: { title: (n) => `${plural(n, 'tooltip or pop-up does', 'tooltips or pop-ups do')} not behave as people need`, why: 'What shows on hover or focus has to close with Escape (it can cover what a magnifier user reads), stay while the pointer moves onto it, and stay until the person moves away.', fix: 'Close it on Escape, keep it open while the pointer is over it, and do not hide it on a timer.' },
  shortcut: { title: (n) => `${plural(n, 'shortcut is', 'shortcuts are')} a single key`, why: 'A single letter or number as a shortcut fires by mistake for people using voice control or who type with one finger.', fix: 'Add a modifier (Ctrl, Alt, Cmd), or let it work only while the component has the focus, or let the person turn it off.' },
  timing: { title: (n) => `${plural(n, 'thing disappears', 'things disappear')} on a short timer`, why: 'People who read slowly, or use a screen reader, need longer than a few seconds.', fix: 'Keep it until the person closes it, or pause the timer while it has the pointer or the focus, or give at least 20 seconds.' },
  pause: { title: (n) => `${plural(n, 'thing moves', 'things move')} by itself with no way to stop it`, why: 'Movement that lasts more than 5 seconds distracts people who need to concentrate on the rest.', fix: 'Stop the animation after 5 seconds, or give a pause button (a loading indicator is fine).' },
  flash: { title: (n) => `${plural(n, 'thing flashes', 'things flash')} more than three times a second`, why: 'Fast flashing can cause seizures.', fix: 'Slow the animation to fewer than three flashes a second.' },
  link: { title: (n) => `${plural(n, 'link does', 'links do')} not say where it goes`, why: 'A screen reader lists the links of a page by their words; "click here" or no words says nothing.', fix: 'Say where it goes in the link\'s words ("Read the export guide"), or add aria-describedby to the sentence around it.' },
  emptylabel: { title: (n) => `${plural(n, 'heading or label is', 'headings or labels are')} empty`, why: 'A screen reader announces an empty heading or label, with nothing after it.', fix: 'Give it words, or remove it.' },
  pointerdown: { title: (n) => `${plural(n, 'control acts', 'controls act')} as soon as it is pressed`, why: 'People who press by mistake (a tremor, a touch screen) expect to slide off to cancel; acting on the press takes that away.', fix: 'Act on click (when the pointer is released), not on pointerdown or mousedown.' },
  labelname: { title: (n) => `${plural(n, 'control is', 'controls are')} named differently from what it shows`, why: 'Voice control users say the words they see ("click Save"); if the name a screen reader hears does not contain them, nothing happens.', fix: 'Start the aria-label with the visible words, or remove the aria-label and let the visible text name it.' },
  motionact: { title: (n) => `${plural(n, 'action works', 'actions work')} by moving the device`, why: 'People with a mounted device or tremors cannot shake or tilt it.', fix: 'Offer a button for the same action, and let shaking be turned off.' },
  gesture: { title: (n) => `${plural(n, 'action needs', 'actions need')} two fingers or a drawn path`, why: 'Some people can use only one finger or a single tap.', fix: 'Offer the same action with a single tap (buttons for zoom, arrows for swipe).' },
  onfocus: { title: (n) => `${plural(n, 'control changes', 'controls change')} things when it takes the focus`, why: 'Moving through with Tab should never open a page, a dialog or move the focus somewhere else.', fix: 'Do it on click or Enter, not on focus.' },
  oninput: { title: (n) => `${plural(n, 'field changes', 'fields change')} things as soon as a value changes`, why: 'Choosing an option or typing should not open a page, send a form or move the focus without warning.', fix: 'Act when the person confirms (a button), or say beforehand what will happen.' },
  dupid: { title: (n) => `${plural(n, 'id is', 'ids are')} used more than once`, why: 'A label, an error message or aria-labelledby can point to the wrong element when two share an id.', fix: 'Give each element its own id (a component used twice needs ids made unique per instance).' },
  aria: { title: (n) => `${plural(n, 'ARIA attribute or role is', 'ARIA attributes or roles are')} not valid`, why: 'A role or an aria- attribute that does not exist, or a value it does not take, or a reference to a missing id, is ignored or misread by screen readers.', fix: 'Use the role and the attribute values ARIA defines, and point aria-labelledby and aria-describedby at ids on the page.' },
  status: { title: (n) => `${plural(n, 'message is', 'messages are')} not announced`, why: 'A toast, a "saved" message or a loader appears without a screen reader being told, so people who cannot see it miss it.', fix: 'Put it in role="status" (role="alert" for errors) or aria-live="polite", present on the page before the message arrives.' },
};

// The criterion each finding kind fails.
export const WCAG21_KIND = Object.fromEntries(WCAG21.flatMap((c) => (c.kinds ?? []).map((k) => [k, c.sc])).reverse());

// The in-page checks, as source the audit injects and the style guide carries.
export const WCAG_PAGE_SOURCE = readFileSync(fileURLToPath(new URL('./wcag-page.js', import.meta.url)), 'utf8');
