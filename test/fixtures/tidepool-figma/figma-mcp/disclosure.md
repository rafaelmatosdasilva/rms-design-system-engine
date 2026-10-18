# Figma MCP: get_design_context for node 15:14 (disclosure)

```tsx
const assetPathPrefix = "https://www.figma.com/api/mcp/asset/3b0fc9d4-75ec-4d33-b809-07e2af688b51";
const imgChevron = `${assetPathPrefix}/c1f2d.svg`;
const imgChevron1 = `${assetPathPrefix}/adc94.svg`;

type DisclosureProps = {
  className?: string;
  content?: string;
  expanded?: boolean;
  label?: string;
};

export default function Disclosure({ className, content = "Shipping takes two business days.", expanded = false, label = "Details" }: DisclosureProps) {
  const isExpanded = expanded;
  return (
    <div className={className || "content-stretch flex flex-col gap-[var(--gap-s,4px)] items-start relative w-[240px]"} id={isExpanded ? "node-15_8" : "node-15_2"} data-annotations={!expanded ? "Role: panel" : undefined}>
      <div className="bg-[var(--surface-page,white)] border-[length:var(--stroke-default,1px)] border-[var(--field-border,#7d8799)] border-solid content-stretch flex gap-[var(--gap-s,4px)] items-center justify-between overflow-clip p-[var(--padding-s,8px)] relative rounded-[var(--radii-field,6px)] shrink-0 w-full" id={isExpanded ? "node-15_9" : "node-15_3"} data-name="Trigger">
        <p className="[word-break:break-word] flex-[1_0_0] font-['Inter:Medium'] font-medium leading-[20px] min-w-px not-italic relative text-[14px] text-[color:var(--text-primary,#1b2433)]" data-node-id="15:4">
          {label}
        </p>
        <div className="relative shrink-0 size-[12px]" id={isExpanded ? "node-15_11" : "node-15_5"} data-annotations="Role: indicator" data-name="Chevron">
          <div className={`absolute ${isExpanded ? "inset-[-13.98%_-5.59%_-2.8%_-5.59%]" : "inset-[-2.8%_-5.59%_-13.98%_-5.59%]"}`}>
            <img alt="" className="block max-w-none size-full" src={isExpanded ? imgChevron1 : imgChevron} />
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="content-stretch flex flex-col items-start overflow-clip p-[var(--padding-s,8px)] relative shrink-0 w-full" data-node-id="15:12" data-annotations="Role: panel" data-name="Panel">
          <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[12px] text-[color:var(--text-primary,#1b2433)] w-full" data-node-id="15:13">
            {content}
          </p>
        </div>
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

These styles are contained in the design: m: Font(family: "Inter", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0), s: Font(family: "Inter", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0).

Component descriptions: The following components have usage descriptions or documentation links defined in Figma. These descriptions provide important context about the intended usage, best practices, and any constraints for each component. Follow these guidelines when implementing or using these components.

## disclosure
**Node ID:** 15:14

Shows or hides a short passage under its label.

Images and SVGs will be stored as constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These constants will be used in the code as the source for the image, ex: <img src={image} />. Image assets are stored on a remote server for 7 days and can be fetched using the provided URLs until they expire.

Some elements have annotation data attributes. They provide extra information about how the element should be implemented.IMPORTANT: Do not ignore these annotation attributes. They should not appear in your final code.

Screenshot: disclosure.png

---

# Figma MCP: get_variable_defs for node 15:14

```json
{"var(--text-primary)":"#1b2433","m":"Font(family: \"Inter\", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0)","var(--gap-s)":"4","var(--padding-s)":"8","var(--radii-field)":"6","var(--stroke-default)":"1","var(--surface-page)":"#ffffff","var(--field-border)":"#7d8799","s":"Font(family: \"Inter\", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0)"}
```
