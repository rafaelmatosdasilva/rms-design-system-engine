# Figma MCP: get_design_context for node 3:28 (the Settings screen)

```tsx
const assetPathPrefix = "https://www.figma.com/api/mcp/asset/845ebb3d-6c31-49bf-84c3-63230739bbe8";
const imgIcon = `${assetPathPrefix}/a027b.svg`;

type ButtonProps = {
  className?: string;
  disabled?: boolean;
  label?: string;
  state?: "Default";
};

function Button({ className, disabled = false, label = "Save", state = "Default" }: ButtonProps) {
  return (
    <div className={className || "bg-[var(--button-background,#1f5fd6)] content-stretch flex gap-[var(--gap-s,4px)] h-[32px] items-center justify-center px-[var(--padding-m,12px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-button,8px)] w-[80px]"} data-node-id="3:2">
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--button-text,white)] whitespace-nowrap" data-node-id="3:3">
        {label}
      </p>
    </div>
  );
}

type TagProps = {
  className?: string;
  label?: string;
  tone?: "Neutral" | "Positive";
};

function Tag({ className, label = "New", tone = "Neutral" }: TagProps) {
  const isPositive = tone === "Positive";
  return (
    <div className={className || `content-stretch flex h-[20px] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] w-[80px] ${isPositive ? "bg-[#d6f5e3]" : "bg-[var(--chip-background,#e8eef9)]"}`} id={isPositive ? "node-3_24" : "node-3_22"}>
      {tone === "Neutral" && (
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[12px] text-[color:var(--chip-text,#1b2433)] whitespace-nowrap" data-node-id="3:23">
          {label}
        </p>
      )}
      {isPositive && (
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[#136c3a] text-[12px] whitespace-nowrap" data-node-id="3:25">
          {label}
        </p>
      )}
    </div>
  );
}

type ChipProps = {
  className?: string;
  icon?: boolean;
  label?: string;
  size?: "M" | "L";
};

function Chip({ className, icon = false, label = "Filter", size = "M" }: ChipProps) {
  const isLAndIcon = size === "L" && icon;
  return (
    <div className={className || `bg-[var(--chip-background,#e8eef9)] content-stretch flex gap-[var(--gap-s,4px)] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] w-[80px] ${isLAndIcon ? "h-[32px]" : "h-[24px]"}`} id={isLAndIcon ? "node-3_13" : "node-3_9"}>
      {size === "M" && !icon && (
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

type FieldProps = {
  className?: string;
  state?: "Default";
};

function Field({ className, state = "Default" }: FieldProps) {
  return (
    <div className={className || "border-[length:var(--stroke-default,1px)] border-[var(--field-border,#7d8799)] border-solid content-stretch flex h-[36px] items-center p-[var(--padding-s,8px)] relative rounded-[var(--radii-field,6px)] w-[200px]"} data-node-id="3:17">
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--text-primary,#1b2433)] whitespace-nowrap" data-node-id="3:18">
        Ada
      </p>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="bg-[var(--surface-page,white)] content-stretch flex flex-col gap-[var(--padding-m,12px)] items-start p-[var(--padding-m,12px)] relative size-full" data-node-id="3:28" data-name="Settings">
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--text-primary,#1b2433)] whitespace-nowrap" data-node-id="3:29">
        Settings
      </p>
      <Field className="border-[length:var(--stroke-default,1px)] border-[var(--field-border,#7d8799)] border-solid content-stretch flex h-[36px] items-center p-[var(--padding-s,8px)] relative rounded-[var(--radii-field,6px)] shrink-0 w-[200px]" />
      <div className="content-stretch flex gap-[var(--padding-s,8px)] items-start overflow-clip relative shrink-0" data-node-id="3:32" data-name="Filters">
        <Chip className="bg-[var(--chip-background,#e8eef9)] content-stretch flex gap-[var(--gap-s,4px)] h-[24px] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] shrink-0 w-[80px]" />
        <Chip className="bg-[var(--chip-background,#e8eef9)] content-stretch flex gap-[var(--gap-s,4px)] h-[32px] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] shrink-0 w-[80px]" icon size="L" />
        <Tag className="bg-[#d6f5e3] content-stretch flex h-[20px] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] shrink-0 w-[80px]" tone="Positive" />
      </div>
      <Button className="bg-[var(--button-background,#1f5fd6)] content-stretch flex gap-[var(--gap-s,4px)] h-[32px] items-center justify-center px-[var(--padding-m,12px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-button,8px)] shrink-0 w-[80px]" />
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

Component descriptions:

## field
**Node ID:** 3:21

A one-line text input.

## chip
**Node ID:** 3:16

A filter people switch on and off.

## tag
**Node ID:** 3:26

A small status label. @experimental Still being designed.

## button
**Node ID:** 3:8

The main action on a screen.

Screenshot: settings.png

---

# Figma MCP: get_variable_defs for node 3:28

```json
{"var(--text-primary)": "#1b2433", "m": "Font(family: \"Inter\", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0)", "var(--padding-s)": "8", "var(--radii-field)": "6", "var(--stroke-default)": "1", "var(--field-border)": "#7d8799", "var(--chip-text)": "#1b2433", "s": "Font(family: \"Inter\", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0)", "var(--gap-s)": "4", "var(--padding-xs)": "4", "var(--radii-chip)": "16", "var(--chip-background)": "#e8eef9", "var(--button-text)": "#ffffff", "var(--padding-m)": "12", "var(--radii-button)": "8", "var(--button-background)": "#1f5fd6", "var(--surface-page)": "#ffffff"}
```
