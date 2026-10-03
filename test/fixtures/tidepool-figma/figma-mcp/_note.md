# What the Figma MCP returned

Each file here is the output of the Figma MCP's `get_design_context` for one node of the Tidepool Figma file
(https://www.figma.com/design/b0LpOCBsaRgo8lUqbkQNaY), captured once, word for word, with the screenshot it returned
(`<name>.png`), followed by what `get_variable_defs` returned for the same node. The build evaluation gives these files to every run, so each one sees the same design the way the
Figma MCP shows it. Tidepool is a fictional design system; every name is invented.

One thing differs from a live session: the asset URLs in the code have expired. The only asset is the chip's icon, a 12px
circle filled with the chip's text colour.

The Figma MCP's design-to-code tools show each variable in one mode only (Light here): no dark values come
through them. The engine's capture reads every mode.
