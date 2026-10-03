# Figma MCP: get_design_context for node 3:21 (field)

```tsx
type FieldProps = {
  className?: string;
  state?: "Default" | "Error";
};

export default function Field({ className, state = "Default" }: FieldProps) {
  const isError = state === "Error";
  return (
    <div className={className || `border-[length:var(--stroke-default,1px)] border-solid content-stretch flex h-[36px] items-center p-[var(--padding-s,8px)] relative rounded-[var(--radii-field,6px)] w-[200px] ${isError ? "border-[var(--field-border-error,#c4231b)]" : "border-[var(--field-border,#7d8799)]"}`} id={isError ? "node-3_19" : "node-3_17"}>
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--text-primary,#1b2433)] whitespace-nowrap" id={isError ? "node-3_20" : "node-3_18"}>
        Ada
      </p>
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

Component descriptions:

## field
**Node ID:** 3:21

A one-line text input.

Screenshot: field.png

---

# Figma MCP: get_variable_defs for node 3:21

```json
{"var(--text-primary)": "#1b2433", "m": "Font(family: \"Inter\", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0)", "var(--padding-s)": "8", "var(--radii-field)": "6", "var(--stroke-default)": "1", "var(--field-border)": "#7d8799", "var(--field-border-error)": "#c4231b"}
```
