import { FunctionBreakdownMetric } from "forma-embedded-view-sdk/areaMetrics";
import { Forma } from "forma-embedded-view-sdk/auto";
import { useEffect, useMemo, useState } from "react";

export const METER_TO_FEET = 3.28084;

const LOCAL_STORAGE_KEY = "cost-calculator-extension";

interface CostSettings {
  costPerSqmPerFunction: Record<string, number>;
  softCostPercent: number;
  contingencyPercent: number;
  currencySymbol: string;
}

const getLocalStorage = (): Partial<CostSettings> => {
  const value = localStorage.getItem(LOCAL_STORAGE_KEY);
  return value ? JSON.parse(value) : {};
};

const setLocalStorage = (value: CostSettings): void => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value));
};

function formatNumber(value: number, currencySymbol: string): string {
  const formatted = Math.round(value).toLocaleString("en-US");
  return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
}

function CostPerSqmInput({
  value,
  onChange,
  imperialUnits,
  currencySymbol,
}: {
  value: number;
  onChange: (value: number) => void;
  imperialUnits: boolean;
  currencySymbol: string;
}) {
  function onInput(event: Event) {
    const { value: inputValue } = event.target as HTMLInputElement;
    if (isNaN(Number(inputValue))) {
      return;
    }
    const convertedValue = imperialUnits
      ? Number(inputValue) / METER_TO_FEET / METER_TO_FEET
      : Number(inputValue);
    onChange(convertedValue);
  }

  const displayValue = imperialUnits
    ? Math.round(value * METER_TO_FEET * METER_TO_FEET)
    : value;

  return (
    <div class="cost-input-wrapper">
      {/* @ts-ignore */}
      <weave-input
        class="cost-input"
        onInput={onInput}
        type="number"
        value={displayValue || 0}
        unit={currencySymbol || undefined}
      />
      <span class="unit-suffix">{imperialUnits ? "/ft²" : "/m²"}</span>
    </div>
  );
}

function Floating() {
  return <p>The floating panel</p>;
}

export function App() {
  const floating = new URLSearchParams(window.location.search).get("floating");
  if (floating) {
    return <Floating />;
  }
  return <RightPanel />;
}

function RightPanel() {
  const [gfaPerFunction, setGfaPerFunction] = useState<
    FunctionBreakdownMetric[]
  >([]);

  const [imperialUnits, setImperialUnits] = useState<boolean>(false);

  const [costPerSqmPerFunction, setCostPerSqmPerFunction] = useState<
    Record<string, number>
  >({});

  const [softCostPercent, setSoftCostPercent] = useState<number>(20);
  const [contingencyPercent, setContingencyPercent] = useState<number>(10);
  const [currencySymbol, setCurrencySymbol] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = getLocalStorage();
    if (stored.softCostPercent !== undefined)
      setSoftCostPercent(stored.softCostPercent);
    if (stored.contingencyPercent !== undefined)
      setContingencyPercent(stored.contingencyPercent);
    if (stored.currencySymbol !== undefined)
      setCurrencySymbol(stored.currencySymbol);
    if (stored.costPerSqmPerFunction)
      setCostPerSqmPerFunction(stored.costPerSqmPerFunction);
  }, []);

  // Poll area metrics from Forma
  useEffect(() => {
    Forma.getPresentationUnitSystem().then((value) =>
      setImperialUnits(value === "imperial"),
    );

    const intervalId = setInterval(() => {
      Forma.areaMetrics.calculate({}).then((metrics) => {
        const functionBreakdownMetrics =
          metrics.builtInMetrics.grossFloorArea.functionBreakdown.filter(
            (func) => func.functionId != "unspecified",
          );
        setGfaPerFunction(functionBreakdownMetrics);

        // Initialize costs for new functions
        setCostPerSqmPerFunction((prev) => {
          const newCosts = { ...prev };
          functionBreakdownMetrics.forEach((metric) => {
            if (!(metric.functionId in newCosts)) {
              newCosts[metric.functionId] = 0;
            }
          });
          return newCosts;
        });
      });
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Save to localStorage whenever settings change
  useEffect(() => {
    setLocalStorage({
      costPerSqmPerFunction,
      softCostPercent,
      contingencyPercent,
      currencySymbol,
    });
  }, [
    costPerSqmPerFunction,
    softCostPercent,
    contingencyPercent,
    currencySymbol,
  ]);

  function setCostForFunction(functionId: string): (cost: number) => void {
    return function (cost: number) {
      setCostPerSqmPerFunction((prev) => ({
        ...prev,
        [functionId]: cost,
      }));
    };
  }

  // Calculate costs
  const costPerFunction: Record<string, number> = useMemo(() => {
    const costs: Record<string, number> = {};
    gfaPerFunction.forEach((metric) => {
      if (metric.value === "UNABLE_TO_CALCULATE") {
        costs[metric.functionId] = 0;
      } else {
        const costPerSqm = costPerSqmPerFunction[metric.functionId] || 0;
        costs[metric.functionId] = metric.value * costPerSqm;
      }
    });
    return costs;
  }, [gfaPerFunction, costPerSqmPerFunction]);

  const hardCostSubtotal = useMemo(() => {
    return Object.values(costPerFunction).reduce((acc, curr) => acc + curr, 0);
  }, [costPerFunction]);

  const softCosts = hardCostSubtotal * (softCostPercent / 100);
  const contingency = hardCostSubtotal * (contingencyPercent / 100);
  const totalDevelopmentCost = hardCostSubtotal + softCosts + contingency;

  return (
    <div class="wrapper">
      <p class="header">Cost Calculator</p>

      {/* Tab Bar */}
      <div class="tab-bar">
        <div class="tab tab-active">Sqm</div>
        <div class="tab tab-disabled" title="Coming soon">
          Units
        </div>
      </div>

      <p class="section-header">Cost per function</p>

      {/* Cost inputs per function */}
      {gfaPerFunction.map((metric) => {
        const area =
          metric.value === "UNABLE_TO_CALCULATE"
            ? 0
            : imperialUnits
              ? metric.value * METER_TO_FEET * METER_TO_FEET
              : metric.value;

        return (
          <div class="function-block" key={metric.functionId}>
            <div class="function-info">
              <div
                class="function-color"
                style={`background: ${metric.functionColor}`}
              ></div>
              <div class="function-name">{metric.functionName}</div>
              <div class="function-area">
                {formatNumber(area, "")} {imperialUnits ? "ft²" : "m²"}
              </div>
            </div>
            <div class="function-input">
              <CostPerSqmInput
                value={costPerSqmPerFunction[metric.functionId] || 0}
                onChange={setCostForFunction(metric.functionId)}
                imperialUnits={imperialUnits}
                currencySymbol={currencySymbol}
              />
            </div>
          </div>
        );
      })}

      <hr class="divider" />

      {/* Advanced Settings */}
      <div
        class="advanced-header"
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <span>{advancedOpen ? "▼" : "▶"} Advanced settings</span>
      </div>

      {advancedOpen && (
        <div class="advanced-content">
          <div class="advanced-row">
            <label>Currency symbol:</label>
            {/* @ts-ignore */}
            <weave-input
              type="text"
              value={currencySymbol}
              onInput={(e: Event) =>
                setCurrencySymbol((e.target as HTMLInputElement).value)
              }
              placeholder="Optional (e.g., $, €, £)"
            />
          </div>

          <div class="advanced-row">
            <label>Soft costs:</label>
            {/* @ts-ignore */}
            <weave-input
              type="number"
              value={softCostPercent}
              onInput={(e: Event) =>
                setSoftCostPercent(Number((e.target as HTMLInputElement).value))
              }
              unit="%"
            />
          </div>

          <div class="advanced-row">
            <label>Contingency:</label>
            {/* @ts-ignore */}
            <weave-input
              type="number"
              value={contingencyPercent}
              onInput={(e: Event) =>
                setContingencyPercent(
                  Number((e.target as HTMLInputElement).value),
                )
              }
              unit="%"
            />
          </div>
        </div>
      )}

      <hr class="divider" />

      {/* Summary */}
      <p class="section-header">Summary</p>

      <div class="summary-row">
        <span>Hard cost</span>
        <span>{formatNumber(hardCostSubtotal, currencySymbol)}</span>
      </div>

      {softCostPercent > 0 && (
        <div class="summary-row">
          <span>Soft costs ({softCostPercent}%)</span>
          <span>{formatNumber(softCosts, currencySymbol)}</span>
        </div>
      )}

      {contingencyPercent > 0 && (
        <div class="summary-row">
          <span>Contingency ({contingencyPercent}%)</span>
          <span>{formatNumber(contingency, currencySymbol)}</span>
        </div>
      )}

      <hr class="divider" />

      <div class="summary-row summary-total">
        <span>Total Development Cost</span>
        <span>{formatNumber(totalDevelopmentCost, currencySymbol)}</span>
      </div>
    </div>
  );
}
