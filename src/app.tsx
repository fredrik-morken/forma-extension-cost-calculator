import { FunctionBreakdownMetric } from "forma-embedded-view-sdk/areaMetrics";
import { Forma } from "forma-embedded-view-sdk/auto";
import { useEffect, useMemo, useState } from "react";

export const METER_TO_FEET = 3.28084;

const LOCAL_STORAGE_KEY = "cost-calculator-extension";

interface CostSettings {
  costPerSqmPerFunction: Record<string, number>;
  revenuePerSqmPerFunction: Record<string, number>;
  softCostPercent: number;
  contingencyPercent: number;
  currencySymbol: string;
  landCost: number;
  earthworkCost: number;
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

  const [revenuePerSqmPerFunction, setRevenuePerSqmPerFunction] = useState<
    Record<string, number>
  >({});

  const [softCostPercent, setSoftCostPercent] = useState<number>(20);
  const [contingencyPercent, setContingencyPercent] = useState<number>(10);
  const [currencySymbol, setCurrencySymbol] = useState<string>("");
  const [landCost, setLandCost] = useState<number>(0);
  const [earthworkCost, setEarthworkCost] = useState<number>(0);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"cost" | "revenue">("cost");
  const [functionsOpen, setFunctionsOpen] = useState<boolean>(true);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = getLocalStorage();
    if (stored.softCostPercent !== undefined)
      setSoftCostPercent(stored.softCostPercent);
    if (stored.contingencyPercent !== undefined)
      setContingencyPercent(stored.contingencyPercent);
    if (stored.currencySymbol !== undefined)
      setCurrencySymbol(stored.currencySymbol);
    if (stored.landCost !== undefined)
      setLandCost(stored.landCost);
    if (stored.earthworkCost !== undefined)
      setEarthworkCost(stored.earthworkCost);
    if (stored.costPerSqmPerFunction)
      setCostPerSqmPerFunction(stored.costPerSqmPerFunction);
    if (stored.revenuePerSqmPerFunction)
      setRevenuePerSqmPerFunction(stored.revenuePerSqmPerFunction);
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

        // Initialize costs and revenue for new functions
        setCostPerSqmPerFunction((prev) => {
          const newCosts = { ...prev };
          functionBreakdownMetrics.forEach((metric) => {
            if (!(metric.functionId in newCosts)) {
              newCosts[metric.functionId] = 0;
            }
          });
          return newCosts;
        });

        setRevenuePerSqmPerFunction((prev) => {
          const newRevenue = { ...prev };
          functionBreakdownMetrics.forEach((metric) => {
            if (!(metric.functionId in newRevenue)) {
              newRevenue[metric.functionId] = 0;
            }
          });
          return newRevenue;
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
      revenuePerSqmPerFunction,
      softCostPercent,
      contingencyPercent,
      currencySymbol,
      landCost,
      earthworkCost,
    });
  }, [
    costPerSqmPerFunction,
    revenuePerSqmPerFunction,
    softCostPercent,
    contingencyPercent,
    currencySymbol,
    landCost,
    earthworkCost,
  ]);

  function setCostForFunction(functionId: string): (cost: number) => void {
    return function (cost: number) {
      setCostPerSqmPerFunction((prev) => ({
        ...prev,
        [functionId]: cost,
      }));
    };
  }

  function setRevenueForFunction(functionId: string): (revenue: number) => void {
    return function (revenue: number) {
      setRevenuePerSqmPerFunction((prev) => ({
        ...prev,
        [functionId]: revenue,
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
    const functionCosts = Object.values(costPerFunction).reduce((acc, curr) => acc + curr, 0);
    return functionCosts + landCost + earthworkCost;
  }, [costPerFunction, landCost, earthworkCost]);

  const softCosts = hardCostSubtotal * (softCostPercent / 100);
  const contingency = hardCostSubtotal * (contingencyPercent / 100);
  const totalDevelopmentCost = hardCostSubtotal + softCosts + contingency;

  // Calculate revenue
  const revenuePerFunction: Record<string, number> = useMemo(() => {
    const revenue: Record<string, number> = {};
    gfaPerFunction.forEach((metric) => {
      if (metric.value === "UNABLE_TO_CALCULATE") {
        revenue[metric.functionId] = 0;
      } else {
        const revenuePerSqm = revenuePerSqmPerFunction[metric.functionId] || 0;
        revenue[metric.functionId] = metric.value * revenuePerSqm;
      }
    });
    return revenue;
  }, [gfaPerFunction, revenuePerSqmPerFunction]);

  const totalRevenue = useMemo(() => {
    return Object.values(revenuePerFunction).reduce((acc, curr) => acc + curr, 0);
  }, [revenuePerFunction]);

  const roiPercent = useMemo(() => {
    if (totalDevelopmentCost === 0) return 0;
    return ((totalRevenue - totalDevelopmentCost) / totalDevelopmentCost) * 100;
  }, [totalRevenue, totalDevelopmentCost]);

  return (
    <div class="wrapper">
      <p class="header">Cost Calculator</p>

      {/* Tab Bar */}
      <div class="tab-bar">
        <div
          class={`tab ${activeTab === "cost" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("cost")}
        >
          Cost
        </div>
        <div
          class={`tab ${activeTab === "revenue" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("revenue")}
        >
          Revenue
        </div>
      </div>

      <div
        class="section-header section-header-collapsible"
        onClick={() => setFunctionsOpen(!functionsOpen)}
      >
        <span>{functionsOpen ? "▼" : "▶"} {activeTab === "cost" ? "Cost" : "Revenue"} per function</span>
      </div>

      {functionsOpen && gfaPerFunction.map((metric) => {
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
              <div class="function-name">
                {metric.functionName}{" "}
                <span class="function-area">
                  ({formatNumber(area, "")} {imperialUnits ? "ft²" : "m²"})
                </span>
              </div>
            </div>
            <div class="function-input">
              <CostPerSqmInput
                value={activeTab === "cost"
                  ? (costPerSqmPerFunction[metric.functionId] || 0)
                  : (revenuePerSqmPerFunction[metric.functionId] || 0)}
                onChange={activeTab === "cost"
                  ? setCostForFunction(metric.functionId)
                  : setRevenueForFunction(metric.functionId)}
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
            <label id="land-cost-label">Land cost:</label>
            <weave-input
              type="number"
              value={landCost}
              onInput={(e: Event) =>
                setLandCost(Number((e.target as HTMLInputElement).value))
              }
              unit={currencySymbol || undefined}
            />
          </div>

          <div class="advanced-row">
            <label id="earthwork-label">Earthwork:</label>
            <weave-input
              type="number"
              value={earthworkCost}
              onInput={(e: Event) =>
                setEarthworkCost(Number((e.target as HTMLInputElement).value))
              }
              unit={currencySymbol || undefined}
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

      {/* Summary - Always visible, consolidated */}
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

      <div class="summary-row summary-total">
        <span>Total Development Cost</span>
        <span>{formatNumber(totalDevelopmentCost, currencySymbol)}</span>
      </div>

      <hr class="divider" />

      <div class="summary-row">
        <span>Total Revenue</span>
        <span>{formatNumber(totalRevenue, currencySymbol)}</span>
      </div>

      <div class="summary-row">
        <span>Net Profit</span>
        <span>{formatNumber(totalRevenue - totalDevelopmentCost, currencySymbol)}</span>
      </div>

      <div class="summary-row summary-total">
        <span>ROI</span>
        <span>{roiPercent.toFixed(1)}%</span>
      </div>
    </div>
  );
}
