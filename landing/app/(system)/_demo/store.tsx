"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MAX_ACCOUNTS, SEEDS, connectedList, type Demo, type Scenario } from "./data";

type Store = {
  demo: Demo;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  update: (fn: (d: Demo) => Demo) => void;
  selected: string | null;
  select: (id: string | null) => void;
};

const Ctx = createContext<Store | null>(null);

// All prototype state lives here in memory, so it survives moving between screens and resets on reload.
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [scenario, setScenarioState] = useState<Scenario>("busy");
  const [demo, setDemo] = useState<Demo>(SEEDS.busy);
  const [selected, select] = useState<string | null>(null);
  const setScenario = useCallback((s: Scenario) => {
    setScenarioState(s);
    setDemo(SEEDS[s]);
    select(null);
  }, []);
  const value = useMemo(() => ({ demo, scenario, setScenario, update: setDemo, selected, select }), [demo, scenario, setScenario, selected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemo needs DemoProvider");
  return v;
}

export function setupSteps(d: Demo) {
  return [
    { t: "Connect your social media", b: `So Waggle can answer messages and post for you. Connect up to ${MAX_ACCOUNTS}.`, done: connectedList(d).length > 0, href: "/settings", cta: "Connect", platforms: true },
    { t: "Add your basics", b: "At least 3 topics: hours, prices, how to buy or book.", done: d.topics.length >= 3, href: "/knowledge-base", cta: "Add business info" },
    { t: "Try 3 practice messages", b: `${Math.min(d.practiced, 3)} of 3 tried. Nothing is posted.`, done: d.practiced >= 3, href: "/lab", cta: "Practice" },
  ];
}
