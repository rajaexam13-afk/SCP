"use client";

import { AlertTriangle, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { clsx } from "clsx";

interface Exception {
  sku: string;
  name: string;
  mape: number;
  bias: number;
  direction: "over" | "under" | "volatile";
}

const MOCK: Exception[] = [
  { sku: "SKU-001", name: "Coca-Cola 2L", mape: 32, bias: 24, direction: "over" },
  { sku: "SKU-042", name: "Dove Shampoo 400ml", mape: 28, bias: -18, direction: "under" },
  { sku: "SKU-115", name: "Lay's Classic 180g", mape: 25, bias: 6, direction: "volatile" },
  { sku: "SKU-203", name: "Heinz Ketchup 570g", mape: 22, bias: 19, direction: "over" },
  { sku: "SKU-304", name: "Pantene Pro-V 400ml", mape: 20, bias: -14, direction: "under" },
  { sku: "SKU-401", name: "Pringles Original 165g", mape: 19, bias: 11, direction: "over" },
  { sku: "SKU-556", name: "Colgate Total 150ml", mape: 18, bias: -9, direction: "under" },
  { sku: "SKU-612", name: "Ariel Pods 30pc", mape: 16, bias: 4, direction: "volatile" },
];

const DirectionIcon = ({ direction }: { direction: Exception["direction"] }) => {
  if (direction === "over") return <TrendingUp className="w-3.5 h-3.5 text-orange-500" />;
  if (direction === "under") return <TrendingDown className="w-3.5 h-3.5 text-blue-500" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
};

interface Props {
  exceptions?: Exception[];
}

export function ExceptionPanel({ exceptions = MOCK }: Props) {
  return (
    <div className="space-y-2">
      {exceptions.map((ex) => (
        <div
          key={ex.sku}
          className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <DirectionIcon direction={ex.direction} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{ex.name}</p>
              <p className="text-xs text-gray-400">{ex.sku}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className={clsx(
              "text-xs font-semibold px-1.5 py-0.5 rounded",
              ex.mape > 25 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
            )}>
              {ex.mape}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
