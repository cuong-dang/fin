import type {
  BillType,
  CashFlowQuery,
  ChartItem,
  Granularity,
} from "@fin/schemas";

// ─── Types ────────────────────────────────────────────────────────────────

export type Direction = "out" | "in" | "net";

export type DrillSegment =
  | { kind: "bucket"; id: "expense" | "loan" | "bill" }
  | { kind: "category"; id: string; label: string }
  | { kind: "billType"; id: BillType }
  | { kind: "loanEntity"; id: string; label: string }
  | { kind: "billEntity"; id: string; label: string };

export type ChartState = {
  direction: Direction;
  drill: DrillSegment[];
};

// ─── Labels ───────────────────────────────────────────────────────────────

export const DIRECTION_LABEL: Record<Direction, string> = {
  out: "Out",
  in: "In",
  net: "Net",
};

export const BUCKET_LABEL: Record<"expense" | "loan" | "bill", string> = {
  expense: "Expense",
  loan: "Loan",
  bill: "Bill",
};

export const BILL_TYPE_LABEL: Record<BillType, string> = {
  utility: "Utility",
  subscription: "Subscription",
  other: "Other",
};

/** Label for a single breadcrumb crumb. */
export function crumbLabel(seg: DrillSegment): string {
  switch (seg.kind) {
    case "bucket":
      return BUCKET_LABEL[seg.id];
    case "billType":
      return BILL_TYPE_LABEL[seg.id];
    case "category":
    case "loanEntity":
    case "billEntity":
      return seg.label;
  }
}

/**
 * Display name for a server-returned ChartItem, given the current
 * drill state. Maps raw enum ids (e.g., "expense", "utility") to
 * human-friendly labels at the levels where the server returns the
 * enum value as both id and name. Everything else uses the server-
 * provided name verbatim.
 */
export function displayItemName(state: ChartState, item: ChartItem): string {
  if (item.id === null) return item.name;
  const { direction, drill } = state;
  if (direction === "out" && drill.length === 0) {
    return BUCKET_LABEL[item.id as "expense" | "loan" | "bill"] ?? item.name;
  }
  const bucket = drill[0];
  if (
    direction === "out" &&
    drill.length === 1 &&
    bucket?.kind === "bucket" &&
    bucket.id === "bill"
  ) {
    return BILL_TYPE_LABEL[item.id as BillType] ?? item.name;
  }
  return item.name;
}

// ─── State transitions ────────────────────────────────────────────────────

/** Direction switch resets the drill to empty. */
export function withDirection(state: ChartState, dir: Direction): ChartState {
  return state.direction === dir ? state : { direction: dir, drill: [] };
}

/** Pop the drill back to a given depth (0 = root). */
export function popToDepth(state: ChartState, depth: number): ChartState {
  if (depth >= state.drill.length) return state;
  return { ...state, drill: state.drill.slice(0, depth) };
}

/** Append a new drill segment. */
export function appendSegment(
  state: ChartState,
  seg: DrillSegment,
): ChartState {
  return { ...state, drill: [...state.drill, seg] };
}

// ─── Server-query mapping ────────────────────────────────────────────────

/**
 * Map a (direction, drill) state plus the toolbar's shared
 * granularity/range/currency into the server's `CashFlowQuery`. The
 * server's `dimension` and filter params are derived deterministically
 * from the drill path.
 */
export function stateToQuery(
  state: ChartState,
  base: {
    granularity: Granularity;
    start: string;
    end: string;
    currency: string;
    /** Optional account-group filter — applied at every dimension. */
    groupId?: string | undefined;
  },
): CashFlowQuery {
  const { direction, drill } = state;
  // The schema's `groupId` field is optional under
  // exactOptionalPropertyTypes; build a partial-spread so we never emit
  // an explicit `groupId: undefined`.
  const common = base.groupId ? { ...base, groupId: base.groupId } : base;

  if (direction === "net") return { ...common, dimension: "net" };

  if (direction === "in") {
    const cat = drill.find((s) => s.kind === "category");
    if (cat && cat.kind === "category") {
      return { ...common, dimension: "inByCategory", categoryId: cat.id };
    }
    return { ...common, dimension: "inTop" };
  }

  // direction === "out"
  const bucket = drill[0];
  if (!bucket || bucket.kind !== "bucket") {
    return { ...common, dimension: "outTop" };
  }

  if (bucket.id === "expense") {
    const cat = drill[1];
    if (cat && cat.kind === "category") {
      return {
        ...common,
        dimension: "outExpensesByCategory",
        categoryId: cat.id,
      };
    }
    return { ...common, dimension: "outExpenses" };
  }

  if (bucket.id === "loan") {
    const entity = drill[1];
    if (entity && entity.kind === "loanEntity") {
      return { ...common, dimension: "outLoans", loanId: entity.id };
    }
    return { ...common, dimension: "outLoans" };
  }

  // bucket.id === "bill"
  const typeSeg = drill[1];
  if (!typeSeg || typeSeg.kind !== "billType") {
    return { ...common, dimension: "outBillsByType" };
  }
  const entity = drill[2];
  if (entity && entity.kind === "billEntity") {
    return {
      ...common,
      dimension: "outBills",
      billType: typeSeg.id,
      billId: entity.id,
    };
  }
  return { ...common, dimension: "outBills", billType: typeSeg.id };
}

// ─── Drill interpretation ─────────────────────────────────────────────────

/**
 * Given the current state and a server-returned ChartItem, return the
 * DrillSegment that "drilling into" that item would produce, or null
 * if the item isn't drillable (null id, or already at a leaf).
 */
export function interpretItem(
  state: ChartState,
  item: ChartItem,
): DrillSegment | null {
  if (item.id === null) return null;
  if (isLeaf(state)) return null;

  const { direction, drill } = state;

  if (direction === "in") {
    if (drill.length === 0) {
      return { kind: "category", id: item.id, label: item.name };
    }
    return null;
  }

  if (direction === "out") {
    if (drill.length === 0) {
      if (item.id === "expense" || item.id === "loan" || item.id === "bill") {
        return { kind: "bucket", id: item.id };
      }
      return null;
    }
    const bucket = drill[0];
    if (bucket?.kind !== "bucket") return null;

    if (bucket.id === "expense") {
      if (drill.length === 1) {
        return { kind: "category", id: item.id, label: item.name };
      }
      return null;
    }
    if (bucket.id === "loan") {
      if (drill.length === 1) {
        return { kind: "loanEntity", id: item.id, label: item.name };
      }
      return null;
    }
    if (bucket.id === "bill") {
      if (drill.length === 1) {
        if (
          item.id === "utility" ||
          item.id === "subscription" ||
          item.id === "other"
        ) {
          return { kind: "billType", id: item.id };
        }
        return null;
      }
      if (drill.length === 2) {
        return { kind: "billEntity", id: item.id, label: item.name };
      }
      return null;
    }
  }

  return null;
}

/** True when the current state has no further drillable level. */
export function isLeaf(state: ChartState): boolean {
  const { direction, drill } = state;
  if (direction === "net") return true;
  if (direction === "in") {
    return drill.some((s) => s.kind === "category");
  }
  // direction === "out"
  if (drill.length === 0) return false;
  const bucket = drill[0];
  if (bucket?.kind !== "bucket") return true;
  if (bucket.id === "expense") return drill.some((s) => s.kind === "category");
  if (bucket.id === "loan") return drill.some((s) => s.kind === "loanEntity");
  if (bucket.id === "bill") return drill.some((s) => s.kind === "billEntity");
  return true;
}
