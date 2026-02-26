"use client";

import { clsx } from "clsx";

const CATEGORIES = ["Beverages", "Dairy", "Snacks", "Personal Care", "Household", "Frozen"];
const WEEKS = Array.from({ length: 13 }, (_, i) => `W${String(i + 1).padStart(2, "0")}`);

function getMockMAPE(): number[][] {
  return CATEGORIES.map(() =>
    WEEKS.map(() => Math.round(Math.random() * 25))
  );
}

function getColor(mape: number): string {
  if (mape < 5)  return "bg-green-100 text-green-800";
  if (mape < 10) return "bg-green-200 text-green-900";
  if (mape < 15) return "bg-yellow-100 text-yellow-800";
  if (mape < 20) return "bg-orange-200 text-orange-900";
  return "bg-red-200 text-red-900";
}

export function AccuracyHeatmap() {
  const data = getMockMAPE();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="text-left font-medium text-gray-400 pb-2 pr-4 w-32">Category</th>
            {WEEKS.map((w) => (
              <th key={w} className="text-center font-medium text-gray-400 pb-2 px-0.5 min-w-[3rem]">
                {w}
              </th>
            ))}
            <th className="text-center font-medium text-gray-400 pb-2 px-2">Avg</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat, ci) => {
            const row = data[ci];
            const avg = Math.round(row.reduce((a, b) => a + b, 0) / row.length);
            return (
              <tr key={cat}>
                <td className="text-gray-700 font-medium pr-4 py-0.5 whitespace-nowrap">{cat}</td>
                {row.map((mape, wi) => (
                  <td key={wi} className="p-0.5">
                    <div
                      className={clsx(
                        "rounded text-center py-1.5 font-medium leading-none",
                        getColor(mape)
                      )}
                    >
                      {mape}%
                    </div>
                  </td>
                ))}
                <td className="p-0.5">
                  <div className={clsx("rounded text-center py-1.5 font-semibold leading-none", getColor(avg))}>
                    {avg}%
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
