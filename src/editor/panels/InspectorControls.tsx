import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useDirectorStore } from "../store/directorStore";

type InspectorTab = {
  label: string;
  active: boolean;
  onClick: () => void;
};

type FieldValue = string | number;

type AxisControl = {
  axis: "X" | "Y" | "Z";
  ariaLabel: string;
  value: FieldValue;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
  max?: string;
};

type TextFieldProps = {
  label: string;
  ariaLabel: string;
  value: FieldValue;
  onChange: (value: string) => void;
  type?: "text" | "number";
  step?: string;
  min?: string;
  max?: string;
};

type RangeNumberFieldProps = {
  label: string;
  rangeAriaLabel: string;
  numberAriaLabel: string;
  value: FieldValue;
  onValueChange: (value: string) => void;
  onRangeChange?: (value: string) => void;
  onNumberChange?: (value: string) => void;
  onNumberBlur?: (value: string) => void;
  min: string | number;
  max: string | number;
  step: string | number;
  axisPrefix?: string;
};

type InspectorSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type OptionElementProps = {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
};

function clampValue(value: number, min?: string | number, max?: string | number) {
  const parsedMin = parseFiniteNumber(min);
  const parsedMax = parseFiniteNumber(max);
  const lowerBounded = parsedMin === null ? value : Math.max(parsedMin, value);

  return parsedMax === null ? lowerBounded : Math.min(parsedMax, lowerBounded);
}

function getRangeProgressStyle(value: FieldValue, min: string | number, max: string | number): CSSProperties {
  const parsedValue = Number(value);
  const parsedMin = Number(min);
  const parsedMax = Number(max);

  if (
    !Number.isFinite(parsedValue) ||
    !Number.isFinite(parsedMin) ||
    !Number.isFinite(parsedMax) ||
    parsedMax <= parsedMin
  ) {
    return {};
  }

  const percent = Math.min(100, Math.max(0, ((parsedValue - parsedMin) / (parsedMax - parsedMin)) * 100));

  return { "--range-progress": `${percent}%` } as CSSProperties;
}

function parseFiniteNumber(value: FieldValue | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyOptionLabel(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("")
    .trim();
}

function parseSelectOptions(children: ReactNode): InspectorSelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionElementProps>(child)) return [];

    const optionValue = child.props.value;
    if (optionValue === undefined || optionValue === null) return [];

    return [
      {
        value: String(optionValue),
        label: stringifyOptionLabel(child.props.children) || String(optionValue),
        disabled: child.props.disabled,
      },
    ];
  });
}

function useUndoBatchInteraction() {
  const beginUndoBatch = useDirectorStore((state) => state.beginUndoBatch);
  const endUndoBatch = useDirectorStore((state) => state.endUndoBatch);
  const isBatchActiveRef = useRef(false);

  const beginInteraction = useCallback(() => {
    if (isBatchActiveRef.current) return;

    isBatchActiveRef.current = true;
    beginUndoBatch();
  }, [beginUndoBatch]);

  const endInteraction = useCallback(() => {
    if (!isBatchActiveRef.current) return;

    isBatchActiveRef.current = false;
    endUndoBatch();
  }, [endUndoBatch]);

  useEffect(() => endInteraction, [endInteraction]);

  return { beginInteraction, endInteraction };
}

export function InspectorPanel({
  title,
  ariaLabel,
  tabs,
  className,
  children,
  footer,
}: {
  title: string;
  ariaLabel: string;
  tabs?: InspectorTab[];
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`panel-card right-inspector${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>
      {tabs ? (
        <div className="tab-row right-inspector-tabs" role="tablist" aria-label={`${title}面板标签`}>
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className="right-inspector-tab-button"
              type="button"
              aria-pressed={tab.active}
              onClick={tab.onClick}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`right-inspector-content ${tabs ? "" : "right-inspector-content-no-tabs"}`}>{children}</div>
      {footer}
    </section>
  );
}

export function InspectorTextField({
  label,
  ariaLabel,
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
}: TextFieldProps) {
  const { beginInteraction, endInteraction } = useUndoBatchInteraction();

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <input
        aria-label={ariaLabel}
        className="inspector-text-input"
        max={max}
        min={min}
        step={step}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={endInteraction}
        onFocus={beginInteraction}
      />
    </label>
  );
}

export function InspectorSelectField({
  label,
  ariaLabel,
  value,
  onChange,
  children,
  options,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
  options?: InspectorSelectOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resolvedOptions = options ?? parseSelectOptions(children);
  const selectedOption = resolvedOptions.find((option) => option.value === value) ?? resolvedOptions[0];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function selectOption(option: InspectorSelectOption) {
    if (option.disabled) return;

    onChange(option.value);
    setIsOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div className="inspector-field inspector-select-field">
      <span className="inspector-field-label">{label}</span>
      <div className="inspector-dropdown" ref={dropdownRef}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className="inspector-dropdown-trigger"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="inspector-dropdown-value">{selectedOption?.label ?? "请选择"}</span>
          <ChevronDown aria-hidden="true" className="inspector-dropdown-chevron" strokeWidth={1.8} />
        </button>
        {isOpen ? (
          <div aria-label={ariaLabel} className="inspector-dropdown-menu" role="listbox">
            {resolvedOptions.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  aria-selected={isSelected}
                  className={`inspector-dropdown-option${isSelected ? " is-selected" : ""}`}
                  disabled={option.disabled}
                  key={option.value}
                  role="option"
                  type="button"
                  onClick={() => selectOption(option)}
                >
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InspectorAxisGroup({ label, axes }: { label: string; axes: AxisControl[] }) {
  return (
    <div className="inspector-field inspector-axis-group" role="group" aria-label={label}>
      <span className="inspector-field-label">{label}</span>
      {axes.map((control) => (
        <AxisSliderRow key={control.ariaLabel} control={control} />
      ))}
    </div>
  );
}

function DraftNumberInput({
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
  onFocus,
  onBlur,
}: {
  ariaLabel: string;
  value: FieldValue;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const currentValue = draft ?? String(value);

  // External updates (slider drag, reset, preset) must win over an in-flight draft.
  useEffect(() => {
    setDraft(null);
  }, [value]);

  function nudge(direction: 1 | -1) {
    const parsedStep = parseFiniteNumber(step) ?? 1;
    const parsedValue = parseFiniteNumber(currentValue) ?? parseFiniteNumber(value) ?? 0;
    const nextValue = clampValue(parsedValue + direction * parsedStep, min, max);
    const formatted = String(Number(nextValue.toFixed(6)));

    setDraft(null);
    onChange(formatted);
  }

  return (
    <span className="inspector-number-input">
      <input
        aria-label={ariaLabel}
        className="inspector-text-input inspector-range-value"
        max={max}
        min={min}
        step={step}
        type="number"
        value={currentValue}
        onBlur={() => {
          const current = currentValue;

          setDraft(null);
          onBlur(current);
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);

          if (next.trim() === "" || !Number.isFinite(Number(next))) return;

          onChange(next);
        }}
        onFocus={onFocus}
      />
      <span className="inspector-number-stepper">
        <button aria-label={`${ariaLabel} 增加`} type="button" onClick={() => nudge(1)}>
          <ChevronUp aria-hidden="true" size={12} strokeWidth={2.2} />
        </button>
        <button aria-label={`${ariaLabel} 减少`} type="button" onClick={() => nudge(-1)}>
          <ChevronDown aria-hidden="true" size={12} strokeWidth={2.2} />
        </button>
      </span>
    </span>
  );
}

const AXIS_VALUE_MIN = -50;
const AXIS_VALUE_MAX = 50;
const AXIS_VALUE_STEP = "0.1";

function resolveAxisRange(control: AxisControl) {
  const min = parseFiniteNumber(control.min);
  const max = parseFiniteNumber(control.max);
  if (min !== null && max !== null) return { min, max };

  return { min: AXIS_VALUE_MIN, max: AXIS_VALUE_MAX };
}

function AxisSliderRow({ control }: { control: AxisControl }) {
  const { beginInteraction, endInteraction } = useUndoBatchInteraction();
  const range = resolveAxisRange(control);
  const step = control.step ?? AXIS_VALUE_STEP;

  return (
    <div className="inspector-field inspector-range-field has-axis-prefix">
      <span className="inspector-range-axis" aria-hidden="true">
        {control.axis}
      </span>
      <div className="inspector-range-row">
        <input
          aria-label={`${control.ariaLabel} 滑杆`}
          className="inspector-range"
          max={range.max}
          min={range.min}
          step={step}
          style={getRangeProgressStyle(control.value, range.min, range.max)}
          type="range"
          value={control.value}
          onChange={(event) => control.onChange(event.currentTarget.value)}
          onPointerCancel={endInteraction}
          onPointerDown={beginInteraction}
          onPointerUp={endInteraction}
        />
        <DraftNumberInput
          ariaLabel={control.ariaLabel}
          max={range.max}
          min={range.min}
          step={step}
          value={control.value}
          onBlur={endInteraction}
          onChange={(next) => control.onChange(next)}
          onFocus={beginInteraction}
        />
      </div>
    </div>
  );
}

export function InspectorRangeNumberField({
  label,
  rangeAriaLabel,
  numberAriaLabel,
  value,
  onValueChange,
  onRangeChange,
  onNumberChange,
  onNumberBlur,
  min,
  max,
  step,
  axisPrefix,
}: RangeNumberFieldProps) {
  const rangeDragCleanupRef = useRef<(() => void) | null>(null);
  const { beginInteraction, endInteraction } = useUndoBatchInteraction();

  useEffect(() => () => rangeDragCleanupRef.current?.(), []);

  function stopRangeDrag() {
    window.removeEventListener("pointerup", stopRangeDrag);
    window.removeEventListener("pointercancel", stopRangeDrag);
    rangeDragCleanupRef.current = null;
    endInteraction();
  }

  function beginRangeDrag() {
    rangeDragCleanupRef.current?.();
    beginInteraction();
    window.addEventListener("pointerup", stopRangeDrag);
    window.addEventListener("pointercancel", stopRangeDrag);
    rangeDragCleanupRef.current = stopRangeDrag;
  }

  return (
    <div className={`inspector-field inspector-range-field${axisPrefix ? " has-axis-prefix" : ""}`}>
      {axisPrefix ? (
        <span className="inspector-range-axis" aria-hidden="true">
          {axisPrefix}
        </span>
      ) : (
        <span className="inspector-field-label">{label}</span>
      )}
      <div className="inspector-range-row">
        <input
          aria-label={rangeAriaLabel}
          className="inspector-range"
          max={max}
          min={min}
          step={step}
          style={getRangeProgressStyle(value, min, max)}
          type="range"
          value={value}
          onChange={(event) => (onRangeChange ?? onValueChange)(event.currentTarget.value)}
          onPointerCancel={stopRangeDrag}
          onPointerDown={beginRangeDrag}
          onPointerUp={stopRangeDrag}
        />
        <DraftNumberInput
          ariaLabel={numberAriaLabel}
          max={max}
          min={min}
          step={step}
          value={value}
          onBlur={(next) => {
            onNumberBlur?.(next);
            endInteraction();
          }}
          onChange={(next) => (onNumberChange ?? onValueChange)(next)}
          onFocus={beginInteraction}
        />
      </div>
    </div>
  );
}

export function InspectorColorField({
  label,
  colorAriaLabel,
  hexAriaLabel,
  value,
  onColorChange,
  onHexChange,
}: {
  label: string;
  colorAriaLabel: string;
  hexAriaLabel: string;
  value: string;
  onColorChange: (value: string) => void;
  onHexChange: (value: string) => void;
}) {
  const { beginInteraction, endInteraction } = useUndoBatchInteraction();

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <div className="inspector-color-row">
        <input
          aria-label={colorAriaLabel}
          className="inspector-color-swatch"
          type="color"
          value={value}
          onChange={(event) => onColorChange(event.currentTarget.value)}
          onBlur={endInteraction}
          onFocus={beginInteraction}
        />
        <input
          aria-label={hexAriaLabel}
          className="inspector-text-input inspector-color-hex"
          value={value}
          onChange={(event) => onHexChange(event.currentTarget.value)}
          onBlur={endInteraction}
          onFocus={beginInteraction}
        />
      </div>
    </label>
  );
}

export function InspectorSection({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`inspector-section${className ? ` ${className}` : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
