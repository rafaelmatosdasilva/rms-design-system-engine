# Figma MCP: get_design_context for node 17:2 (stepper)

```tsx
type StepperProps = {
  className?: string;
  value?: string;
};

export default function Stepper({ className, value = "1" }: StepperProps) {
  return (
    <div className={className || "bg-[var(--surface-page,white)] border-[length:var(--stroke-default,1px)] border-[var(--field-border,#7d8799)] border-solid content-stretch flex gap-[var(--gap-s,4px)] items-center p-[var(--padding-xs,4px)] relative rounded-[var(--radii-field,6px)]"} data-node-id="17:2" data-annotations="Role: spinbutton" data-name="stepper">
      <div className="bg-[var(--chip-background,#e8eef9)] content-stretch flex items-center justify-center overflow-clip p-[var(--padding-xs,4px)] relative rounded-[var(--radii-button,8px)] shrink-0" data-node-id="17:3" data-annotations="Role: decrement" data-name="Decrement">
        <div className="overflow-clip relative shrink-0 size-[12px]" data-node-id="17:4" data-name="Minus">
          <div className="absolute bg-[var(--text-primary,#1b2433)] h-[2px] left-px top-[5px] w-[10px]" data-node-id="17:5" data-name="Bar" />
        </div>
      </div>
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--text-primary,#1b2433)] text-center w-[32px]" data-node-id="17:6" data-annotations="Role: value">
        {value}
      </p>
      <div className="bg-[var(--chip-background,#e8eef9)] content-stretch flex items-center justify-center overflow-clip p-[var(--padding-xs,4px)] relative rounded-[var(--radii-button,8px)] shrink-0" data-node-id="17:7" data-annotations="Role: increment" data-name="Increment">
        <div className="overflow-clip relative shrink-0 size-[12px]" data-node-id="17:8" data-name="Plus">
          <div className="absolute bg-[var(--text-primary,#1b2433)] h-[2px] left-px top-[5px] w-[10px]" data-node-id="17:9" data-name="Bar" />
          <div className="absolute bg-[var(--text-primary,#1b2433)] h-[10px] left-[5px] top-px w-[2px]" data-node-id="17:10" data-name="Bar" />
        </div>
      </div>
    </div>
  );
}
```

SUPER CRITICAL: The generated React+Tailwind code MUST be converted to match the target project's technology stack and styling system.
1. Analyze the target codebase to identify: technology stack, styling approach, component patterns, and design tokens
2. Convert React syntax to the target framework/library
3. Transform all Tailwind classes to the target styling system while preserving exact visual design
4. Follow the project's existing patterns and conventions
DO NOT install any Tailwind as a dependency unless the user instructs you to do so.

Node ids have been added to the code as data attributes, e.g. `data-node-id="1:2"`.

These styles are contained in the design: m: Font(family: "Inter", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0).

Component descriptions: The following components have usage descriptions or documentation links defined in Figma. These descriptions provide important context about the intended usage, best practices, and any constraints for each component. Follow these guidelines when implementing or using these components.

## stepper
**Node ID:** 17:2

Picks a whole number from 0 to 10 by stepping it down or up.

Images and SVGs will be stored as constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These constants will be used in the code as the source for the image, ex: <img src={image} />. Image assets are stored on a remote server for 7 days and can be fetched using the provided URLs until they expire.

Some elements have annotation data attributes. They provide extra information about how the element should be implemented.IMPORTANT: Do not ignore these annotation attributes. They should not appear in your final code.

Screenshot: stepper.png

---

# Figma MCP: get_variable_defs for node 17:2

```json
{"var(--text-primary)":"#1b2433","var(--padding-xs)":"4","var(--radii-button)":"8","var(--chip-background)":"#e8eef9","m":"Font(family: \"Inter\", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0)","var(--gap-s)":"4","var(--radii-field)":"6","var(--stroke-default)":"1","var(--surface-page)":"#ffffff","var(--field-border)":"#7d8799"}
```
