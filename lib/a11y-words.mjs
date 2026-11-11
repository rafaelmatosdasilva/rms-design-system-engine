// a11y-words.mjs - what a finding is called, why it matters, what to do about it, and who does it.
//
// Words only. Nothing here decides whether something passes or fails: the checks do that, and a finding's wording can
// change a hundred times without a single measurement changing with it. It lives apart for exactly that reason - the
// saved accessibility results are signed by what decides them (a11y-check.mjs, checkSignature), and this file is left
// out of that signature, so rewriting a sentence or moving a task to another person never makes a whole system check
// itself again. Put anything that changes a verdict in a11y-check.mjs or wcag21.mjs instead, never here.
import { WCAG22 } from './wcag21.mjs';

// The finding kinds the new checks add, in plain words (merged into a11y-check.mjs A11Y_GUIDE).
const plural = (n, one, many) => `${n === 1 ? 'One' : n} ${n === 1 ? one : many}`;
export const WCAG21_GUIDE = {
  textalt: { title: (n) => `${plural(n, 'image has', 'images have')} no words for a screen reader`, why: 'An image, an image button or a role="img" with no alt or name is skipped or read as its file name.', fix: 'Add alt="<what it shows>" (alt="" when it is only decoration), or aria-label on a role="img".' },
  captions: { title: (n) => `${plural(n, 'video has', 'videos have')} no captions`, why: 'People who cannot hear the sound miss what is said.', fix: 'Add a <track kind="captions"> with the captions.' },
  autoaudio: { title: (n) => `${plural(n, 'recording plays', 'recordings play')} sound by itself`, why: 'Sound that starts on its own covers what a screen reader says.', fix: 'Do not autoplay with sound: start muted, or let the person start it, with controls to stop it.' },
  group: { title: (n) => `${plural(n, 'group of choices is', 'groups of choices are')} not named as a group`, why: 'A screen reader announces each radio button alone, without the question they answer.', fix: 'Put the choices in a <fieldset> with a <legend>, or give their container role="radiogroup" (or "group") and aria-label.' },
  table: { title: (n) => `${plural(n, 'table has', 'tables have')} no header cells`, why: 'A screen reader cannot say which column or row a cell belongs to.', fix: 'Make the first row (or column) <th> cells, with scope="col" or scope="row".' },
  context: { title: (n) => `${plural(n, 'item sits', 'items sit')} outside the container its role needs`, why: 'A tab outside a tab list, an option outside a list box or a list item outside a list is not announced as part of its set.', fix: 'Put it inside the container its role needs (role="tablist", role="listbox", <ul>), or give it another role.' },
  readorder: { title: (n) => `${plural(n, 'component reads', 'components read')} in a different order than it is seen`, why: 'A screen reader reads the code\'s order; here the words come in another order than they are shown, so what is heard does not match what is seen.', fix: 'Put the elements in the code in the order they are shown (avoid CSS order, row-reverse and column-reverse to move words).' },
  order: { title: (n) => `${plural(n, 'control comes', 'controls come')} in a different order to Tab than on screen`, why: 'The keyboard and a screen reader follow the code\'s order; here it differs from the order it is seen in, which is confusing.', fix: 'Put the elements in the code in the order they are shown (avoid CSS order and row-reverse to reorder controls).' },
  autocomplete: { title: (n) => `${plural(n, 'field asks', 'fields ask')} about the person without saying so`, why: 'Browsers and assistive tools fill in a name, an email or a phone number only when the field says what it asks for.', fix: 'Add the autocomplete value the finding names (autocomplete="email", "given-name", "tel").' },
  boundary: { title: (n) => `${plural(n, 'control edge is', 'control edges are')} too faint to see`, why: 'The border of a field, a checkbox, a radio or a switch is too close in colour to what is around it, so people with low vision cannot find the control.', fix: 'Make the border (or the fill) at least 3 times the contrast of the background around it.' },
  hovercontent: { title: (n) => `${plural(n, 'tooltip or pop-up does', 'tooltips or pop-ups do')} not behave as people need`, why: 'What shows on hover or focus has to close with Escape (it can cover what a magnifier user reads), stay while the pointer moves onto it, and stay until the person moves away.', fix: 'Close it on Escape, keep it open while the pointer is over it, and do not hide it on a timer.' },
  shortcut: { title: (n) => `${plural(n, 'shortcut is', 'shortcuts are')} a single key`, why: 'A single letter or number as a shortcut fires by mistake for people using voice control or who type with one finger.', fix: 'Add a modifier (Ctrl, Alt, Cmd), or let it work only while the component has the focus, or let the person turn it off.' },
  timing: { title: (n) => `${plural(n, 'thing disappears', 'things disappear')} on a short timer`, why: 'People who read slowly, or use a screen reader, need longer than a few seconds.', fix: 'Keep it until the person closes it, or pause the timer while it has the pointer or the focus, or give at least 20 seconds.' },
  pause: { title: (n) => `${plural(n, 'thing moves', 'things move')} by itself with no way to stop it`, why: 'Movement that lasts more than 5 seconds distracts people who need to concentrate on the rest.', fix: 'Stop the animation after 5 seconds, or give a pause button (a loading indicator is fine).' },
  flash: { title: (n) => `${plural(n, 'thing flashes', 'things flash')} more than three times a second`, why: 'Fast flashing can cause seizures.', fix: 'Slow the animation to fewer than three flashes a second.' },
  link: { title: (n) => `${plural(n, 'link does', 'links do')} not say where it goes`, why: 'A screen reader lists the links of a page by their words; "click here" or no words says nothing.', fix: 'Say where it goes in the link\'s words ("Read the export guide"), or add aria-describedby to the sentence around it.' },
  placeholderlabel: { title: (n) => `${plural(n, 'field is', 'fields are')} labelled only by a placeholder`, why: 'A placeholder disappears as soon as someone types, so they forget what the field asks for, and it is usually too faint to read.', fix: 'Add a visible <label> (or aria-label when the design shows no label), and keep the placeholder as an example only.' },
  emptylabel: { title: (n) => `${plural(n, 'heading or label is', 'headings or labels are')} empty`, why: 'A screen reader announces an empty heading or label, with nothing after it.', fix: 'Give it words, or remove it.' },
  pointerdown: { title: (n) => `${plural(n, 'control acts', 'controls act')} as soon as it is pressed`, why: 'People who press by mistake (a tremor, a touch screen) expect to slide off to cancel; acting on the press takes that away.', fix: 'Act on click (when the pointer is released), not on pointerdown or mousedown.' },
  labelname: { title: (n) => `${plural(n, 'control is', 'controls are')} named differently from what it shows`, why: 'Voice control users say the words they see ("click Save"); if the name a screen reader hears does not contain them, nothing happens.', fix: 'Start the aria-label with the visible words, or remove the aria-label and let the visible text name it.' },
  motionact: { title: (n) => `${plural(n, 'action works', 'actions work')} by moving the device`, why: 'People with a mounted device or tremors cannot shake or tilt it.', fix: 'Offer a button for the same action, and let shaking be turned off.' },
  gesture: { title: (n) => `${plural(n, 'action needs', 'actions need')} two fingers or a drawn path`, why: 'Some people can use only one finger or a single tap.', fix: 'Offer the same action with a single tap (buttons for zoom, arrows for swipe).' },
  onfocus: { title: (n) => `${plural(n, 'control changes', 'controls change')} things when it takes the focus`, why: 'Moving through with Tab should never open a page, a dialog or move the focus somewhere else.', fix: 'Do it on click or Enter, not on focus.' },
  oninput: { title: (n) => `${plural(n, 'field changes', 'fields change')} things as soon as a value changes`, why: 'Choosing an option or typing should not open a page, send a form or move the focus without warning.', fix: 'Act when the person confirms (a button), or say beforehand what will happen.' },
  dupid: { title: (n) => `${plural(n, 'id is', 'ids are')} used more than once`, why: 'A label, an error message or aria-labelledby can point to the wrong element when two share an id.', fix: 'Give each element its own id (a component used twice needs ids made unique per instance).' },
  aria: { title: (n) => `${plural(n, 'ARIA attribute or role is', 'ARIA attributes or roles are')} not valid`, why: 'A role or an aria- attribute that does not exist, or a value it does not take, or a reference to a missing id, is ignored or misread by screen readers.', fix: 'Use the role and the attribute values ARIA defines, and point aria-labelledby and aria-describedby at ids on the page.' },
  dragging: { title: (n) => `${plural(n, 'thing is', 'things are')} moved only by dragging`, why: 'People who cannot hold a button down while moving (a tremor, a head pointer, a switch) cannot drag.', fix: 'Offer the same with one click or tap: buttons to move it up and down, a click on the track, or a menu with the places it can go.' },
  authpaste: { title: (n) => `${plural(n, 'password field stops', 'password fields stop')} pasting`, why: 'A password manager, or a code copied from a message, is how many people sign in without having to remember or retype it.', fix: 'Let the field take paste: remove the handler that cancels it (onpaste, preventDefault on paste).' },
  authfill: { title: (n) => `${plural(n, 'password field turns', 'password fields turn')} autofill off`, why: 'Turning autocomplete off tells a password manager not to fill the field, so people have to remember and type it.', fix: 'Use autocomplete="current-password" (or "new-password", "one-time-code"), never "off".' },
  fakelink: { title: (n) => `${plural(n, 'link acts', 'links act')} as a button`, why: 'A link with nowhere to go (href="#", javascript:) that runs an action is announced as a link, so a screen reader user expects a new page, and Space does nothing on it.', fix: 'Use a <button type="button"> for an action, and keep <a href> for a place to go.' },
  homeend: { title: (n) => `${plural(n, 'group moves', 'groups move')} with the arrows but not with Home and End`, why: 'In a tab list, a menu or a list box, the ARIA pattern people learn takes Home to the first item and End to the last; without them a long list is walked one item at a time.', fix: 'On Home, move the focus to the first item; on End, to the last.' },
  comboboxkeys: { title: (n) => `${plural(n, 'combobox does', 'comboboxes do')} not answer its keys`, why: 'A keyboard user opens a combobox\'s list with the Down arrow and closes it with Escape, staying in the field; without them the list is reached only with a mouse.', fix: 'Open the list on Down (aria-expanded="true"), close it on Escape (aria-expanded="false") and keep the focus in the field.' },
  weakname: { title: (n) => `${plural(n, 'control has', 'controls have')} a name that says little`, why: 'A screen reader says the name, then the role: "icon, button", "chevron-down, button" or "Close button, button" tells the person little or says the same thing twice.', fix: 'Name it for what it does ("Close", "Next month", "Delete invoice"), never for its look, its icon or its role.' },
  samename: { title: (n) => `${plural(n, 'set of links says', 'sets of links say')} the same words for different places`, why: 'A screen reader lists the links by their words; two that read the same but go to different places cannot be told apart.', fix: 'Give each its own words ("Edit invoice 12", "Edit invoice 13"), or add the difference with aria-describedby or visually hidden text.' },
  // Tried on a product's own pages and across them (page-criteria.mjs).
  pagetitle: { title: (n) => `${plural(n, 'page has', 'pages have')} no title of its own`, why: 'The title is the first thing a screen reader says and the name of the tab: with none, or the same on every page, people cannot tell where they are.', fix: 'Give each page a <title> that says what it is ("Order summary - Acme").' },
  pagelang: { title: (n) => `${plural(n, 'page does', 'pages do')} not say its language`, why: 'A screen reader reads the words with the voice of the page\'s language; with none said, it guesses and can read them in the wrong one.', fix: 'Put lang on <html>, as a language tag (lang="en", lang="pt-BR").' },
  bypass: { title: (n) => `${plural(n, 'page gives', 'pages give')} no way past its repeated blocks`, why: 'Someone on a keyboard or a screen reader goes through the header and the menu again on every page before reaching what it is about.', fix: 'Put the page\'s content in <main>, and add a skip link to it as the first stop ("Skip to content", href="#main").' },
  navorder: { title: (n) => `${plural(n, 'page puts', 'pages put')} its navigation in another order`, why: 'People learn where each item of a menu is; one that moves from page to page has to be read again each time.', fix: 'Keep the items a navigation repeats in the same order on every page (one shared navigation component).' },
  namedalike: { title: (n) => `${plural(n, 'link reads', 'links read')} otherwise than on another page`, why: 'A link to the same place named differently on each page reads as two different things to a screen reader user.', fix: 'Name what does the same thing the same way on every page (one shared header, navigation and footer).' },
  helpplace: { title: (n) => `${plural(n, 'page moves', 'pages move')} its help`, why: 'People who need help look for it where they found it before; help that moves is hard to find again.', fix: 'Keep the help (a help page, a contact, a chat) in the same part of every page, in the same order among what the pages repeat.' },
  askedagain: { title: (n) => `${plural(n, 'field asks', 'fields ask')} again for what the flow was given`, why: 'Typing the same thing twice is hard for people with memory or motor difficulties, and errors creep in.', fix: 'Fill it in from the earlier step, or offer it to pick ("Same as the delivery address"). A password asked again to keep an account safe is fine.' },
  legalstep: { title: (n) => `${plural(n, 'form commits', 'forms commit')} money, a signature or data with no review found`, why: 'A payment, a signature or a deletion sent by mistake can be costly; people need to check it first, or undo it after.', fix: 'Add a step that shows what will be sent and lets it be corrected, a checkbox to confirm it, or a way to undo it after. A person checks the flow.' },
  status: { title: (n) => `${plural(n, 'message is', 'messages are')} not announced`, why: 'A toast, a "saved" message or a loader appears without a screen reader being told, so people who cannot see it miss it.', fix: 'Put it in role="status" (role="alert" for errors) or aria-live="polite", present on the page before the message arrives.' },
};

// ── Who acts on each finding, and in how many steps ────────────────────────────────────────────────────────────────
// A criterion is not a task: one criterion can owe work to several people, and the same finding can owe two steps to
// two of them (a colour pair is picked in Figma, then used in the code). The profile belongs to the finding kind, not
// to the criterion, so it is decided here once and read everywhere - the style guide, the audit's output and
// `a11y.json`, which carries it to any agent.
//
//   designer   - what is decided in Figma: a colour pair, a focus state, a target size, a visible label.
//   developer  - what is written in the code: markup, ARIA, keyboard, focus, ids, reading order.
//   content    - the words: alternative text, a link's words, a label, a heading, a title, captions.
//   product    - the pages and the flow: help in the same place, navigation alike, a step that can be undone.
//   a11y       - what no machine decides: a person reads it and says.
export const WHO_PROFILES = ['designer', 'developer', 'content', 'product', 'a11y'];

// The tasks a finding kind owes, in the order they are done. A step with no words of its own uses the kind's own fix
// (A11Y_GUIDE), so the one wording stays in one place; a step that is somebody else's says what that person does.
// A kind not named here is the code's, in one step.
export const WCAG_TASKS = {
  // Colour and size are picked in Figma, then used in the code.
  contrast: [{ who: 'designer', todo: 'Pick a pair that reaches 4.5:1 (3:1 for large text) in Figma.' }, { who: 'developer', todo: 'Use that colour in the component, in every theme it has.' }],
  hovercontrast: [{ who: 'designer', todo: 'Give the hover state a pair that reaches 4.5:1 in Figma.' }, { who: 'developer', todo: 'Use that colour for the hover state.' }],
  statecontrast: [{ who: 'designer', todo: 'Give the focused and pressed states a pair that reaches 4.5:1 in Figma (3:1 for large text).' }, { who: 'developer', todo: 'Use those colours for the states.' }],
  cvdcontrast: [{ who: 'designer', todo: 'Open a lightness gap between the text and its background, not only a difference of hue.' }, { who: 'developer', todo: 'Use that colour in the component.' }],
  cvdvariant: [{ who: 'designer', todo: 'Tell the variants apart by more than colour: an icon, a word, a border or a pattern.' }, { who: 'developer', todo: 'Build what tells them apart into the component.' }],
  boundary: [{ who: 'designer', todo: 'Give the control an edge (or a fill) at 3:1 against what is around it.' }, { who: 'developer', todo: 'Use that border or fill in the component.' }],
  iconcontrast: [{ who: 'designer', todo: 'Pick an icon colour at 3:1 against its background, in every theme.' }, { who: 'developer', todo: 'Draw the icon in currentColor or that token.' }],
  focuscontrast: [{ who: 'designer', todo: 'Make the focus ring stand out at 3:1 against whatever is behind it.' }, { who: 'developer', todo: 'Use that focus ring in the component.' }],
  stateedge: [{ who: 'designer', todo: "Give every state an edge at 3:1 against what is around it." }, { who: 'developer', todo: "Use the state's border or fill token in the component." }],
  forcedcontrast: [{ who: 'developer' }],
  target: [{ who: 'designer', todo: 'Give the control 24 by 24 pixels in Figma, or 24 pixels of space around it.' }, { who: 'developer', todo: 'Build it at that size (padding counts), or keep that space around it.' }],
  target44: [{ who: 'designer', todo: 'Give the control 44 by 44 pixels in Figma where it is used on touch screens.' }, { who: 'developer', todo: 'Build it at that size, with padding or an invisible hit area.' }],
  placeholderlabel: [{ who: 'designer', todo: 'Show a label above the field in Figma, or say it carries no visible label.' }, { who: 'developer', todo: 'Add that <label> (or aria-label where the design shows none) and keep the placeholder as an example only.' }],

  // The words are written first; the code then carries them.
  textalt: [{ who: 'content', todo: 'Write what the image shows, in a few words (nothing, when it is only decoration).' }, { who: 'developer', todo: 'Put those words in alt (alt="" when it is only decoration), or aria-label on a role="img".' }],
  name: [{ who: 'content', todo: 'Write the words that name it, for what it does.' }, { who: 'developer', todo: 'Give it those words: aria-label on an icon button, a <label> on an input.' }],
  tooltipname: [{ who: 'content', todo: 'Write the words that name the icon.' }, { who: 'developer', todo: 'Put them beside the icon as a visible label; at least give it aria-label.' }],
  weakname: [{ who: 'content', todo: 'Name it for what it does ("Close", "Next month", "Delete invoice"), never for its look, its icon or its role.' }, { who: 'developer', todo: 'Use those words as its name.' }],
  heading: [{ who: 'content', todo: 'Write the words of the heading that names the page.' }, { who: 'developer', todo: 'Give the page one <h1> with those words (it can be visually hidden); make the other headings <h2> or below.' }],
  pagetitle: [{ who: 'content', todo: 'Write a title for each page that says what it is.' }, { who: 'developer', todo: 'Put it in the page\u2019s <title>.' }],
  emptylabel: [{ who: 'content' }],
  link: [{ who: 'content' }],
  samename: [{ who: 'content' }],
  captions: [{ who: 'content', todo: 'Write the captions for the video.' }, { who: 'developer', todo: 'Add a <track kind="captions"> with them.' }],

  // The pages and the flow, not one component.
  helpplace: [{ who: 'product' }],
  navorder: [{ who: 'product' }],
  namedalike: [{ who: 'product' }],
  legalstep: [{ who: 'product' }],
  askedagain: [{ who: 'product' }],
};

// A criterion with no finding of its own still owes somebody something: what only a person decides is a person's, a
// recording's words are the content's, and what belongs to the product's pages is the product's.
const PERSON_WHO = { media: 'content', page: 'product' };
export function whoForCriterion(sc) {
  const c = WCAG22.find((k) => k.sc === sc);
  return !c ? 'developer' : c.how === 'person' ? 'a11y' : PERSON_WHO[c.how] ?? 'developer';
}

// The tasks one finding owes: [{ who, todo, step, steps }]. `fix` is the kind's own wording (A11Y_GUIDE), used by a
// step that has none of its own, so it is never written twice.
export function tasksFor(kind, fix) {
  const steps = WCAG_TASKS[kind] ?? [{ who: 'developer' }];
  return steps.map((t, i) => ({ who: t.who, todo: t.todo ?? String(fix ?? '').trim(), step: i + 1, steps: steps.length }))
    .filter((t) => t.todo);
}

// No jargon: every issue says what is wrong, why it matters to a real person, and what to
// do about it. `title` returns the count sentence, singular/plural aware.
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const A11Y_GUIDE = {
  contrast: {
    title: (n) => `${count(n, 'piece of text is', 'pieces of text are')} hard to read`,
    why: 'The text colour is too close to its background, so it is hard to read — and can be invisible when the page is shown in the other theme (light vs dark).',
    fix: 'Use a darker or lighter text colour, or add the colour for the theme that is missing.',
  },
  name: {
    title: (n) => `${count(n, 'button or field has', 'buttons or fields have')} no label for screen readers`,
    why: 'A button that is only an icon, or a field with no label, is silent to someone using a screen reader — they hear nothing when they reach it.',
    fix: 'Give it a name: add aria-label to an icon button, or a <label> to an input.',
  },
  focus: {
    title: (n) => `${count(n, 'control does', 'controls do')} not show where the keyboard is`,
    why: 'When someone moves through the page with the Tab key, nothing lights up, so they cannot tell which control they are on.',
    fix: 'Add a visible outline (a focus ring) on the control itself when it is focused — not only on a box around it.',
  },
  focuscontrast: {
    title: (n) => `${count(n, 'focus outline is', 'focus outlines are')} too faint to see`,
    why: 'The control does light up when focused, but the outline is so close in colour to its background that a keyboard user still cannot tell where they are.',
    fix: 'Make the focus outline stand out clearly — a stronger colour or a thicker ring, so it is at least three times the contrast of whatever is behind it.',
  },
  hovercontrast: {
    title: (n) => `${count(n, 'control becomes', 'controls become')} hard to read on hover`,
    why: 'When the mouse is over the control its colours change to something too faint — readable at rest, but not while it is being used.',
    fix: 'Give the hover state the same care as the normal state: keep the text at least 4.5 times the contrast of its background.',
  },
  statecontrast: {
    title: (n) => `${count(n, 'control becomes', 'controls become')} hard to read when focused or pressed`,
    why: 'While the keyboard is on the control, or while it is pressed, its colours change to something too faint: readable at rest, but not while it is being used.',
    fix: 'Give the focused and pressed states the same care as the normal state: keep the text at least 4.5 times the contrast of its background (3 times for large text).',
  },
  cvdcontrast: {
    title: (n) => `${count(n, 'piece of text is', 'pieces of text are')} hard to read for people who are colour blind`,
    why: 'The text passes WCAG, but for people who do not see red, green or blue its colour comes too close to its background (red on black is the usual case), as a colour-blindness simulator shows it.',
    fix: 'Make the text lighter or darker against its background, not only a different hue: a lightness gap reads for everyone.',
  },
  forcedcontrast: {
    title: (n) => `${count(n, 'icon or text disappears', 'icons or texts disappear')} in high-contrast mode`,
    why: 'Windows high-contrast mode paints the page in the person\'s own colours. An icon drawn as a background colour (a CSS mask) takes the page\'s colour and vanishes, and text kept in a fixed colour can no longer be told from its background.',
    fix: 'Draw icons in currentColor (an SVG fill, or a mask with background-color: currentColor), or keep them with forced-color-adjust: none and a colour the mode allows (CanvasText).',
  },
  stateedge: {
    title: (n) => `${count(n, 'control edge fades', 'control edges fade')} when hovered, focused or pressed`,
    why: 'The border of a field, a checkbox, a radio or a switch stands out at rest, but in one of its states it comes too close to what is around it, so people with low vision lose the control while using it.',
    fix: 'Keep the edge in every state at least 3 times the contrast of the background around it (the state\'s border or fill token).',
  },
  ariastate: {
    title: (n) => `${count(n, 'control shows', 'controls show')} their state only by looks`,
    why: 'Something is marked selected, checked or open only with colour or a CSS class, so a screen reader never announces that state.',
    fix: 'Also set the matching accessibility attribute: aria-selected, aria-checked, aria-expanded, and so on.',
  },
  keyboard: {
    title: (n) => `${count(n, 'control cannot', 'controls cannot')} be used with the keyboard`,
    why: 'The control works with a mouse, but the Tab key skips over it, so people who only use a keyboard cannot reach it.',
    fix: 'Use a real <button> or link, or add tabindex="0" so it can be focused.',
  },
  target: {
    title: (n) => `${count(n, 'control is', 'controls are')} too small to tap or click reliably`,
    why: 'A control smaller than 24 by 24 pixels, with other controls close by, is easy to miss or to hit the wrong one — hard for anyone with a tremor or on a touch screen.',
    fix: 'Make the control at least 24 by 24 pixels (padding counts), or keep 24 pixels of space around it.',
  },
  target44: {
    title: (n) => `${count(n, 'control is', 'controls are')} smaller than a comfortable touch target`,
    why: 'Between 24 and 44 pixels a control passes WCAG AA, but on a touch screen a finger covers about 44 pixels: people with a tremor, or on the move, miss it or hit the one beside it.',
    fix: 'Where it is used on touch screens, make the control at least 44 by 44 pixels (its padding or an invisible hit area counts).',
  },
  tabtrap: {
    title: (n) => `${count(n, 'place traps', 'places trap')} the keyboard`,
    why: 'Pressing Tab stops moving at some point, so someone using only a keyboard cannot get past it.',
    fix: 'Let Tab move on (or Escape close) whatever is holding the focus.',
  },
  tooltipname: {
    title: (n) => `${count(n, 'control says', 'controls say')} what it does only in a tooltip`,
    why: 'The control is an icon whose name is only its title, shown as a tooltip when a mouse rests on it. On a touch screen, or moving with the keyboard, no one sees it, so they cannot tell what the control does.',
    fix: 'Put words beside the icon (a visible label); at least give it aria-label.',
  },
  iconcontrast: {
    title: (n) => `${count(n, 'icon is', 'icons are')} hard to see`,
    why: 'The icon is the only thing that says what the control or the message is, and its colour is too close to its background (often only in the dark theme, when the icon kept its light-theme colour).',
    fix: 'Draw the icon in currentColor or a token that changes with the theme, at least three times the contrast of its background.',
  },
  pageorder: {
    title: (n) => `${count(n, 'place sends', 'places send')} Tab back up the page`,
    why: 'Pressing Tab moves the focus to a control above the one before it, in the same column, so someone using a keyboard is taken back over what they have read and loses their place.',
    fix: 'Put the controls in the code in the order they are seen, or move them on the page. Never fix it with tabindex or a CSS order.',
  },
  focushidden: {
    title: (n) => `${count(n, 'control takes', 'controls take')} the focus where no one can see it`,
    why: 'Tab stops on something hidden (off the screen, with no size, or see-through), so someone using a keyboard cannot tell where they are.',
    fix: 'Take it out of the Tab order while it is hidden (hidden, inert or tabindex="-1"), or show it when it has the focus, as a skip link does.',
  },
  tabindex: {
    title: (n) => `${count(n, 'control jumps', 'controls jump')} the Tab order`,
    why: 'A positive tabindex makes the Tab key visit this control out of reading order, which is confusing to follow.',
    fix: 'Use tabindex="0" (or none) and put the control where it belongs in the page order.',
  },
  unannounced: {
    title: (n) => `${count(n, 'message shows', 'messages show')} without a screen reader being told`,
    why: 'Something that appears after an action (a toast, an alert, an error) is seen but not heard: it sits in no live region and the focus does not go to it, so a screen reader user never learns it is there. A live region put in the page already holding its words is not said by most screen readers either.',
    fix: 'Keep a live region in the page from the start (role="status" for news, role="alert" for an error) and put the message\'s words into it; or move the focus to the message.',
  },
  cvdvariant: {
    title: (n) => `${count(n, 'pair of variants differs', 'pairs of variants differ')} only by a colour some people cannot tell apart`,
    why: 'Two variants that are the same but for their colour (a success and an error badge, say) look like one to a person who does not see red, green or blue: the colour is the only thing that tells them apart (WCAG 1.4.1).',
    fix: 'Tell them apart by more than the colour: an icon, a word, a border or a pattern; or pick colours far enough apart in lightness that every kind of colour vision tells them apart.',
  },
  forcedstate: {
    title: (n) => `${count(n, 'state looks', 'states look')} like the rest in high-contrast mode`,
    why: 'Windows high-contrast mode replaces the page\'s colours with the reader\'s own. A selected, checked, pressed or current item drawn only by its background or text colour then looks exactly like the items beside it, so the reader cannot tell which one is chosen.',
    fix: 'Give the state something the mode keeps: a border or an outline, a check mark or an icon, a heavier weight or an underline; or keep its colours with forced-color-adjust: none and the system colour Highlight.',
  },
  modalescape: {
    title: (n) => `${count(n, 'modal dialog lets', 'modal dialogs let')} Tab leave it for the page behind`,
    why: 'A modal dialog covers the page and takes the focus. When Tab moves past its last control to the page it covers, a keyboard or screen reader user is lost behind it, acting on what they cannot see.',
    fix: 'Keep the focus inside the dialog while it is open: show it with showModal(), or make the page behind it inert, or move the focus back to its first control after its last.',
  },
  tapcontent: {
    title: (n) => `${count(n, 'tip shows', 'tips show')} on hover but never on a tap`,
    why: 'A touch screen has no hover. What a tip says is lost to everyone on a phone or a tablet when a tap never shows it (often because the tap also closes it as it opens).',
    fix: 'Show the tip on a tap (on the click that follows a touch), and close it on a second tap or a tap elsewhere.',
  },
  escape: {
    title: (n) => `${count(n, 'dialog does', 'dialogs do')} not close with Escape`,
    why: 'People who use the keyboard expect Escape to close a dialog; without it they can get stuck.',
    fix: 'Close the dialog on Escape and return the focus to what opened it.',
  },
  focusreturn: {
    title: (n) => `${count(n, 'dialog or menu leaves', 'dialogs or menus leave')} the focus elsewhere when Escape closes it`,
    why: 'After Escape closes it, the focus is not back on the control that opened it, so someone using the keyboard or a screen reader loses their place.',
    fix: 'When it closes, move the focus back to the control that opened it.',
  },
  heading: {
    title: (n) => `${count(n, 'page has', 'pages have')} no main heading, or several`,
    why: 'A screen reader jumps to the main heading (h1) to learn what a page is about; with none, or several, it cannot.',
    fix: 'Give each page one <h1> that names it (it can be visually hidden); make the other headings <h2> or below.',
  },
  motion: {
    title: (n) => `${count(n, 'thing still moves', 'things still move')} when the person asked for less motion`,
    why: 'The system setting "reduce motion" is on, but these still animate. Movement can make some people dizzy or sick.',
    fix: 'Inside @media (prefers-reduced-motion: reduce), set the transition and animation to none (or near zero).',
  },
  forcedfocus: {
    title: (n) => `${count(n, 'focus indicator disappears', 'focus indicators disappear')} in high-contrast mode`,
    why: 'Windows high-contrast mode removes shadows and background colours, so a focus style made only of those vanishes.',
    fix: 'Add a real outline (it can be transparent normally: outline: 2px solid transparent) so high-contrast mode can show it.',
  },
  spacing: {
    title: (n) => `${count(n, 'piece of text gets', 'pieces of text get')} cut off with wider text spacing`,
    why: 'People who need more space between letters, words and lines (a common reading aid) lose part of this text.',
    fix: 'Do not fix the height or hide the overflow of text boxes; let them grow with their text.',
  },
  activate: {
    title: (n) => `${count(n, 'control does', 'controls do')} nothing when Enter or Space is pressed`,
    why: 'A control built from a plain element (a div with role="button") only responds to the mouse unless it also listens for the keys, so a keyboard user can reach it but not use it.',
    fix: 'Use a real <button> (or <a href>), or handle Enter (and Space for buttons, checkboxes and switches) on the element.',
  },
  arrows: {
    title: (n) => `${count(n, 'group does', 'groups do')} not move with the arrow keys`,
    why: 'In a radio group, tab list, menu or list box, keyboard users expect the arrow keys to move between the items; Tab moves out of the group.',
    fix: 'Move focus to the next and previous item on the arrow keys (a roving tabindex), or use native radio buttons.',
  },
  zoom: {
    title: (n) => `${count(n, 'piece of text is', 'pieces of text are')} cut off at 200% zoom`,
    why: 'People who zoom the page to twice its size need all the text to stay readable; here it is clipped.',
    fix: 'Let the box grow with its text (no fixed height with overflow hidden), or allow the text to wrap.',
  },
  obscured: {
    title: (n) => `${count(n, 'control is', 'controls are')} hidden under other content when focused`,
    why: 'When someone tabs to it, the control is completely covered (by a sticky header or a banner, for example), so they cannot see where they are.',
    fix: 'Keep sticky content from covering focused controls: add scroll-padding for the sticky area, or move the content.',
  },
  focusthin: {
    title: (n) => `${count(n, 'focus ring is', 'focus rings are')} thinner than 2 pixels`,
    why: 'A thin focus ring is easy to miss. The enhanced level of WCAG (AAA) asks for at least 2 CSS pixels.',
    fix: 'Draw the focus ring at least 2px thick (outline-width: 2px).',
  },
  rolecontract: {
    title: (n) => `${count(n, 'component does', 'components do')} not expose what its role requires`,
    why: 'The contract or a Figma note says what the component is (a toggle button, a checkbox, a text field, a tab). Assistive technology needs the matching wiring: the pressed or checked state, a label, the error link, the selected tab.',
    fix: 'Add what the finding names (aria-pressed that changes on click, a real checkbox input with a label, aria-invalid and aria-describedby on an errored field, aria-selected on the selected tab, disabled or aria-disabled).',
  },
  annotation: {
    title: (n) => `${count(n, 'component does', 'components do')} not render what its Figma accessibility note says`,
    why: 'A Figma annotation on the component states its role, name, heading level or alt text; the rendered page says something else.',
    fix: 'Render what the annotation says, or update the annotation in Figma if the design changed.',
  },
  reflow: {
    title: (n) => `${count(n, 'page or component does', 'pages or components do')} not fit a narrow screen`,
    why: 'At 320 pixels wide (a phone, or a page zoomed to 400%) the content does not fit, so people have to scroll in two directions to read it.',
    fix: 'Let the layout wrap or stack at narrow widths instead of keeping a fixed width.',
  },
  partrole: {
    title: (n) => `${count(n, 'part does', 'parts do')} not do what its Figma part role says`,
    why: 'Figma marks an inner layer as the label, the error message, the indicator or a step button of its component. Each owes the control something: a label names it, an error message is linked while it shows, an indicator stays silent, a step button has a name.',
    fix: 'Wire the part as the finding says (a <label for>, aria-describedby, aria-hidden="true", aria-label), or correct the annotation in Figma.',
  },
  partnotyet: {
    title: (n) => `${count(n, 'label is', 'labels are')} outside the shadow root its control sits in: wiring no browser makes yet`,
    why: 'The label is outside another component, and the control it names is inside that component\'s shadow root. An id does not reach into a shadow root, so neither a <label for> nor aria-labelledby can tie them: browsers are still adding a way (reference target). Until one ships, a screen reader may hear the control without its name.',
    fix: 'Meanwhile, give the control its name inside the component (pass the label\'s words in, for its own <label> or aria-label), or make the component form-associated so the label names the component itself.',
  },
  behaviour: {
    title: (n) => `${count(n, 'component does', 'components do')} not behave as its role or its Figma note says`,
    why: 'What a person can do with a component comes with its role: Space flips a toggle, a click opens a disclosure, a tab takes the selection, a text box takes typing. Figma notes can add more (Escape closes, the arrow keys move).',
    fix: 'Make the component do it (the finding says what was tried and what happened), or record the person\'s exception with a link to its decision in contract.authored.json → behaviourExceptions.',
  },
  statefollows: {
    title: (n) => `${count(n, 'state changes', 'states change')} the look but not what a screen reader hears`,
    why: 'An option that shows a state (selected, checked, expanded, in error) changes only a class here, so a screen reader still announces the component as it was.',
    fix: 'Set the attribute the finding names together with the class (aria-pressed, aria-checked, aria-expanded, aria-invalid), from the same prop.',
  },
  semantics: {
    title: (n) => `${count(n, 'component is', 'components are')} announced as something else than the design system says`,
    why: 'A screen reader announces the element by its role. The contract says what each component is; this one renders as something different.',
    fix: 'Use the element or role the contract names (contract.authored.json → semantics), or correct the contract.',
  },
  // WCAG 2.1 A and AA, the rest of what a component can be checked for (wcag-page.js, wcag21.mjs).
  ...WCAG21_GUIDE,
};
