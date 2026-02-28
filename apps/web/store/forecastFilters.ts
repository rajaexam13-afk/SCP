import { create } from "zustand";

export type TimeKey = "past_4w" | "next_8w" | "next_13w" | "past_26w";

interface ForecastFilterState {
  search:    string;
  scenario:  string;
  timeRange: TimeKey;
  category:  string;
  location:  string;
  statusF:   string;
  page:      number;

  setSearch:    (v: string)  => void;
  setScenario:  (v: string)  => void;
  setTimeRange: (v: TimeKey) => void;
  setCategory:  (v: string)  => void;
  setLocation:  (v: string)  => void;
  setStatusF:   (v: string)  => void;
  setPage:      (v: number)  => void;
  clearAll:     () => void;
}

export const useForecastFilters = create<ForecastFilterState>((set) => ({
  search:    "",
  scenario:  "",
  timeRange: "next_8w",
  category:  "",
  location:  "",
  statusF:   "",
  page:      1,

  setSearch:    (v) => set({ search:    v, page: 1 }),
  setScenario:  (v) => set({ scenario:  v, page: 1 }),
  setTimeRange: (v) => set({ timeRange: v, page: 1 }),
  setCategory:  (v) => set({ category:  v, page: 1 }),
  setLocation:  (v) => set({ location:  v, page: 1 }),
  setStatusF:   (v) => set({ statusF:   v, page: 1 }),
  setPage:      (v) => set({ page: v }),
  clearAll:     () => set({ search: "", scenario: "", timeRange: "next_8w", category: "", location: "", statusF: "", page: 1 }),
}));
