# Figma MCP: get_design_context for node 3:16 (chip)

```tsx
const assetPathPrefix = "https://www.figma.com/api/mcp/asset/7ddc2f51-708b-4445-8a5c-b1ad338d4e2a";
const imgIcon = `${assetPathPrefix}/a027b.svg`;

type ChipProps = {
  className?: string;
  icon?: boolean;
  label?: string;
  size?: "M" | "L";
};

export default function Chip({ className, icon = false, label = "Filter", size = "M" }: ChipProps) {
  const isLAndIcon = size === "L" && icon;
  return (
    <div className={className || `bg-[var(--chip-background,#e8eef9)] content-stretch flex gap-[var(--gap-s,4px)] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] w-[80px] ${size === "L" ? "h-[32px]" : "h-[24px]"}`} id={isLAndIcon ? "node-3_13" : size === "L" && !icon ? "node-3_11" : "node-3_9"}>
      {!icon && (
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[12px] text-[color:var(--chip-text,#1b2433)] whitespace-nowrap" data-node-id="3:10">
          {label}
        </p>
      )}
      {isLAndIcon && (
        <>
          <div className="relative shrink-0 size-[12px]" data-node-id="3:14" data-name="Icon">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon} />
          </div>
          <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[12px] text-[color:var(--chip-text,#1b2433)] whitespace-nowrap" data-node-id="3:15">
            {label}
          </p>
        </>
      )}
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

These styles are contained in the design: s: Font(family: "Inter", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0).

Component descriptions:

## chip
**Node ID:** 3:16

A filter people switch on and off.

Images and SVGs will be stored as constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These constants will be used in the code as the source for the image, ex: <img src={image} />. Image assets are stored on a remote server for 7 days and can be fetched using the provided URLs until they expire.

Some elements have annotation data attributes. They provide extra information about how the element should be implemented. IMPORTANT: Do not ignore these annotation attributes. They should not appear in your final code.

Screenshot: chip.png

---

# Figma MCP: get_variable_defs for node 3:16

```json
{"var(--chip-text)": "#1b2433", "s": "Font(family: \"Inter\", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0)", "var(--gap-s)": "4", "var(--padding-s)": "8", "var(--padding-xs)": "4", "var(--radii-chip)": "16", "var(--chip-background)": "#e8eef9"}
```
