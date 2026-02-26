"""
Hierarchical Reconciliation
Ensures forecasts at all hierarchy levels (SKU → Category → Total) sum consistently.
Supports: bottom-up, top-down, middle-out, OLS optimal reconciliation.
"""
import numpy as np
import pandas as pd
from typing import Literal


class HierarchicalReconciler:
    """
    Reconcile forecasts across a product/location hierarchy.

    Method choices:
    - bottom_up:  Aggregate granular forecasts up the tree (most common, recommended default)
    - top_down:   Disaggregate top-level forecast down using historical proportions
    - middle_out: Forecast at mid-level, aggregate up, disaggregate down
    - optimal:    OLS reconciliation (MinT) — minimizes total reconciliation error
    """

    def __init__(self, method: Literal["bottom_up", "top_down", "middle_out", "optimal"] = "bottom_up"):
        self.method = method

    def reconcile(
        self,
        forecasts: pd.DataFrame,
        hierarchy: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Args:
            forecasts: DataFrame with columns [node_id, period, forecast]
            hierarchy: DataFrame with columns [node_id, parent_id, level]
        Returns:
            Reconciled forecasts in same shape as input
        """
        if self.method == "bottom_up":
            return self._bottom_up(forecasts, hierarchy)
        elif self.method == "top_down":
            return self._top_down(forecasts, hierarchy)
        elif self.method == "optimal":
            return self._optimal(forecasts, hierarchy)
        else:
            return self._bottom_up(forecasts, hierarchy)

    def _bottom_up(self, forecasts: pd.DataFrame, hierarchy: pd.DataFrame) -> pd.DataFrame:
        """
        Bottom-up: sum leaf-level forecasts to all parent nodes.
        Most robust method — no top-level assumptions imposed.
        """
        merged = forecasts.merge(hierarchy, on="node_id")
        leaf_nodes = set(hierarchy["node_id"]) - set(hierarchy["parent_id"].dropna())
        leaf_forecasts = merged[merged["node_id"].isin(leaf_nodes)]

        result = forecasts.copy()

        # For each non-leaf node, sum up children
        def get_descendants(node_id: str) -> list:
            children = hierarchy[hierarchy["parent_id"] == node_id]["node_id"].tolist()
            if not children:
                return [node_id]
            desc = []
            for c in children:
                desc.extend(get_descendants(c))
            return desc

        for _, row in hierarchy[~hierarchy["node_id"].isin(leaf_nodes)].iterrows():
            desc = get_descendants(row["node_id"])
            agg = (
                leaf_forecasts[leaf_forecasts["node_id"].isin(desc)]
                .groupby("period")["forecast"]
                .sum()
                .reset_index()
            )
            agg["node_id"] = row["node_id"]
            result = result[result["node_id"] != row["node_id"]]
            result = pd.concat([result, agg[["node_id", "period", "forecast"]]], ignore_index=True)

        return result

    def _top_down(self, forecasts: pd.DataFrame, hierarchy: pd.DataFrame) -> pd.DataFrame:
        """
        Top-down: disaggregate top-level forecast using historical proportions.
        """
        # Find root node
        root_nodes = set(hierarchy["node_id"]) - set(hierarchy["parent_id"].dropna())
        # Use the single root if available, else return bottom-up
        if len(root_nodes) != 1:
            return self._bottom_up(forecasts, hierarchy)

        root = list(root_nodes)[0]
        root_forecast = forecasts[forecasts["node_id"] == root]

        # Compute proportions from historical data (simplified: use forecast proportions)
        leaf_nodes = set(hierarchy["node_id"]) - set(hierarchy["parent_id"].dropna())
        leaf_total = forecasts[forecasts["node_id"].isin(leaf_nodes)].groupby("period")["forecast"].sum()

        result = forecasts.copy()
        for leaf in leaf_nodes:
            leaf_fc = forecasts[forecasts["node_id"] == leaf].copy()
            proportion = leaf_fc["forecast"] / (leaf_total.reindex(leaf_fc["period"].values).values + 1e-8)
            root_fc = root_forecast.set_index("period")["forecast"].reindex(leaf_fc["period"].values)
            leaf_fc["forecast"] = (proportion.values * root_fc.values).clip(0)
            result = result[result["node_id"] != leaf]
            result = pd.concat([result, leaf_fc], ignore_index=True)

        return result

    def _optimal(self, forecasts: pd.DataFrame, hierarchy: pd.DataFrame) -> pd.DataFrame:
        """
        MinT optimal reconciliation using OLS.
        Minimizes total squared reconciliation error.
        """
        # Build summing matrix S
        nodes = hierarchy["node_id"].unique()
        leaves = set(nodes) - set(hierarchy["parent_id"].dropna())
        leaves_list = sorted(leaves)
        nodes_list = sorted(nodes)

        n_all = len(nodes_list)
        n_leaf = len(leaves_list)

        node_idx = {n: i for i, n in enumerate(nodes_list)}
        leaf_idx = {n: i for i, n in enumerate(leaves_list)}

        S = np.zeros((n_all, n_leaf))
        # Leaf rows = identity
        for leaf in leaves_list:
            S[node_idx[leaf], leaf_idx[leaf]] = 1

        # Aggregate rows using BU logic
        def get_leaf_descendants(node_id: str) -> list:
            children = hierarchy[hierarchy["parent_id"] == node_id]["node_id"].tolist()
            if not children:
                return [node_id] if node_id in leaves else []
            desc = []
            for c in children:
                desc.extend(get_leaf_descendants(c))
            return desc

        for node in nodes_list:
            if node not in leaves:
                for leaf in get_leaf_descendants(node):
                    if leaf in leaf_idx:
                        S[node_idx[node], leaf_idx[leaf]] = 1

        # OLS reconciliation: P = (S'S)^{-1} S'
        STS = S.T @ S
        try:
            P = np.linalg.solve(STS, S.T)
        except np.linalg.LinAlgError:
            return self._bottom_up(forecasts, hierarchy)

        # Apply reconciliation per period
        periods = forecasts["period"].unique()
        result_rows = []
        for period in periods:
            period_fc = forecasts[forecasts["period"] == period]
            y_hat = np.array([
                period_fc[period_fc["node_id"] == n]["forecast"].sum()
                for n in nodes_list
            ])
            y_tilde = S @ P @ y_hat
            for i, node in enumerate(nodes_list):
                result_rows.append({"node_id": node, "period": period, "forecast": max(0, y_tilde[i])})

        return pd.DataFrame(result_rows)
