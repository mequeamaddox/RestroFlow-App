import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ClipboardList, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "@/contexts/LocationContext";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";

// ─── Types ────────────────────────────────────────────────────────────────────

type Shift = "morning" | "afternoon" | "end_of_day" | "weekly";

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  costPerUnit: number;
  pricePerOz?: number;
  bottleSize?: string;
  isAlcoholic?: boolean;
  packageMl?: number;
}

interface CountSession {
  id: number;
  locationId: number;
  countedBy: string;
  countDate: string;
  shift: Shift;
  notes: string;
  status: "draft" | "complete";
  createdAt: string;
}

interface CountItem {
  id: number;
  inventoryItemId: number;
  fillLevel: number;
  quantityMl: number;
  unitCost: number;
  itemName: string;
  bottleSize: string;
  unit: string;
  costPerUnit: number;
}

interface CountDetail extends CountSession {
  items: CountItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHIFT_LABELS: Record<Shift, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  end_of_day: "End of Day",
  weekly: "Weekly",
};

const FILL_OPTIONS: { label: string; value: number }[] = [
  { label: "Full", value: 1.0 },
  { label: "¾", value: 0.75 },
  { label: "½", value: 0.5 },
  { label: "¼", value: 0.25 },
  { label: "Empty", value: 0.0 },
];

const ALCOHOL_KEYWORDS = ["spirit", "beer", "wine", "whiskey", "whisky", "vodka", "gin", "rum", "tequila", "bourbon", "brandy", "liqueur", "champagne", "cider", "ale", "lager", "stout", "porter", "mead", "sake"];
const BAR_CATEGORY_KEYWORDS = ["bar", "spirit", "beer", "wine", "mixer", "liquor", "beverage", "alcohol", "cocktail"];

function isBarItem(item: InventoryItem): boolean {
  if (item.isAlcoholic) return true;
  const nameLower = item.name.toLowerCase();
  const categoryLower = item.category.toLowerCase();
  return (
    BAR_CATEGORY_KEYWORDS.some((kw) => categoryLower.includes(kw)) ||
    ALCOHOL_KEYWORDS.some((kw) => nameLower.includes(kw))
  );
}

function parseBottleMl(bottleSize?: string): number {
  if (!bottleSize) return 750;
  const match = bottleSize.match(/(\d+(?:\.\d+)?)\s*(ml|l|oz)/i);
  if (!match) return 750;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "l") return num * 1000;
  if (unit === "oz") return num * 29.5735;
  return num;
}

function computeEstValue(item: InventoryItem, fillLevel: number): number {
  const ml = item.packageMl ?? parseBottleMl(item.bottleSize);
  if (item.pricePerOz && item.pricePerOz > 0) {
    const oz = ml / 29.5735;
    return fillLevel * oz * item.pricePerOz;
  }
  // fallback: costPerUnit is per bottle
  return fillLevel * item.costPerUnit;
}

function groupItemsByCategory(items: InventoryItem[]): Record<string, InventoryItem[]> {
  const groups: Record<string, InventoryItem[]> = {
    "Spirits": [],
    "Beer & Wine": [],
    "Mixers & Other": [],
  };

  for (const item of items) {
    const cat = item.category.toLowerCase();
    const name = item.name.toLowerCase();
    if (
      cat.includes("spirit") ||
      cat.includes("liquor") ||
      cat.includes("whiskey") ||
      cat.includes("whisky") ||
      ALCOHOL_KEYWORDS.some((kw) =>
        ["whiskey", "whisky", "vodka", "gin", "rum", "tequila", "bourbon", "brandy", "liqueur"].includes(kw) && name.includes(kw)
      )
    ) {
      groups["Spirits"].push(item);
    } else if (
      cat.includes("beer") ||
      cat.includes("wine") ||
      cat.includes("champagne") ||
      cat.includes("cider") ||
      name.includes("beer") ||
      name.includes("wine") ||
      name.includes("ale") ||
      name.includes("lager") ||
      name.includes("stout") ||
      name.includes("champagne")
    ) {
      groups["Beer & Wine"].push(item);
    } else {
      groups["Mixers & Other"].push(item);
    }
  }

  return groups;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "draft" | "complete" }) {
  return status === "complete" ? (
    <Badge className="bg-green-600/20 text-green-400 border-green-600/30">Complete</Badge>
  ) : (
    <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">Draft</Badge>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="rounded-full bg-purple-600/20 p-4">
          <ClipboardList className="h-8 w-8 text-purple-400" />
        </div>
        <p className="text-white font-semibold text-lg">No counts yet</p>
        <p className="text-slate-400 text-sm text-center max-w-sm">
          Take your first inventory count to start tracking your bar stock levels.
        </p>
        <Button
          data-testid="empty-start-count-btn"
          onClick={onStart}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white mt-2"
        >
          Take your first count
        </Button>
      </CardContent>
    </Card>
  );
}

function CountCard({
  count,
  onClick,
}: {
  count: CountSession;
  onClick: () => void;
}) {
  return (
    <Card
      className="bg-slate-900/50 border-slate-700 cursor-pointer hover:border-purple-600/50 transition-colors"
      onClick={onClick}
      data-testid={`count-card-${count.id}`}
    >
      <CardContent className="flex items-center justify-between py-4 px-5">
        <div className="flex flex-col gap-1">
          <span className="text-white font-medium">
            {format(new Date(count.countDate), "MMM d, yyyy")}
          </span>
          <span className="text-slate-400 text-sm">
            {SHIFT_LABELS[count.shift]} shift
            {count.notes ? ` · ${count.notes}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={count.status} />
          <ChevronLeft className="h-4 w-4 text-slate-500 rotate-180" />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailView({
  detail,
  onBack,
}: {
  detail: CountDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="detail-back-btn"
          className="border-slate-600 text-slate-300 hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h2 className="text-white font-semibold">
            {format(new Date(detail.countDate), "MMMM d, yyyy")} — {SHIFT_LABELS[detail.shift]}
          </h2>
          {detail.notes && (
            <p className="text-slate-400 text-sm">{detail.notes}</p>
          )}
        </div>
        <div className="ml-auto">
          <StatusBadge status={detail.status} />
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-base">
            {detail.items.length} item{detail.items.length !== 1 ? "s" : ""} counted
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {detail.items.map((item, idx) => {
            const fillOption = FILL_OPTIONS.find((o) => o.value === item.fillLevel) ?? {
              label: `${Math.round(item.fillLevel * 100)}%`,
              value: item.fillLevel,
            };
            return (
              <div key={item.id}>
                {idx > 0 && <Separator className="bg-slate-700/50" />}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{item.itemName}</p>
                    {item.bottleSize && (
                      <p className="text-slate-500 text-xs">{item.bottleSize}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        item.fillLevel === 0
                          ? "bg-red-600/20 text-red-400 border-red-600/30"
                          : item.fillLevel >= 0.75
                          ? "bg-green-600/20 text-green-400 border-green-600/30"
                          : "bg-yellow-600/20 text-yellow-400 border-yellow-600/30"
                      }
                    >
                      {fillOption.label}
                    </Badge>
                    <span className="text-slate-400 text-sm w-16 text-right">
                      ${(item.fillLevel * item.costPerUnit).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Count Mode ───────────────────────────────────────────────────────────────

interface CountModeProps {
  barItems: InventoryItem[];
  locationId: number;
  onSaved: () => void;
  onCancel: () => void;
}

function CountMode({ barItems, locationId, onSaved, onCancel }: CountModeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [shift, setShift] = useState<Shift>("end_of_day");
  const [notes, setNotes] = useState("");
  const [fillLevels, setFillLevels] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const item of barItems) {
      init[item.id] = 1.0;
    }
    return init;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = barItems.map((item) => {
        const fillLevel = fillLevels[item.id] ?? 1.0;
        const ml = item.packageMl ?? parseBottleMl(item.bottleSize);
        return {
          inventoryItemId: item.id,
          fillLevel,
          quantityMl: fillLevel * ml,
          unitCost: item.costPerUnit,
        };
      });
      const res = await apiRequest("POST", "/api/bar/inventory-counts", {
        locationId,
        shift,
        notes,
        items,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bar/inventory-counts", locationId] });
      toast({ title: "Count saved", description: "Bar inventory count has been recorded." });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save count",
        variant: "destructive",
      });
    },
  });

  const groups = groupItemsByCategory(barItems);
  const totalEstValue = barItems.reduce(
    (sum, item) => sum + computeEstValue(item, fillLevels[item.id] ?? 1.0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                Shift
              </label>
              <Select
                value={shift}
                onValueChange={(v) => setShift(v as Shift)}
                data-testid="shift-select"
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-72">
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="end_of_day">End of Day</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-[2] space-y-1">
              <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                Notes (optional)
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this count…"
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none h-10 py-2"
                data-testid="count-notes"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Item Groups */}
      {Object.entries(groups).map(([groupName, items]) => {
        if (items.length === 0) return null;
        return (
          <Card key={groupName} className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-200 text-base">{groupName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {items.map((item, idx) => {
                const currentFill = fillLevels[item.id] ?? 1.0;
                const estValue = computeEstValue(item, currentFill);
                return (
                  <div key={item.id}>
                    {idx > 0 && <Separator className="bg-slate-700/50" />}
                    <div className="py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-white text-sm font-medium">{item.name}</p>
                          {item.bottleSize && (
                            <p className="text-slate-500 text-xs">{item.bottleSize}</p>
                          )}
                        </div>
                        <span className="text-slate-400 text-xs whitespace-nowrap pt-0.5">
                          Est. ${estValue.toFixed(2)}
                        </span>
                      </div>

                      {/* Segmented fill-level control */}
                      <div
                        className="flex rounded-md overflow-hidden border border-slate-600"
                        data-testid={`fill-control-${item.id}`}
                      >
                        {FILL_OPTIONS.map((opt, i) => {
                          const isActive = currentFill === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                setFillLevels((prev) => ({ ...prev, [item.id]: opt.value }))
                              }
                              data-testid={`fill-btn-${item.id}-${opt.label.replace(/[^a-z0-9]/gi, "")}`}
                              className={[
                                "flex-1 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500",
                                i > 0 ? "border-l border-slate-600" : "",
                                isActive
                                  ? "bg-purple-600 text-white"
                                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Summary + Actions */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
          <div>
            <p className="text-slate-400 text-sm">Estimated total bar value</p>
            <p className="text-white text-xl font-bold">${totalEstValue.toFixed(2)}</p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="cancel-count-btn"
              className="flex-1 sm:flex-none border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || barItems.length === 0}
              data-testid="save-count-btn"
              className="flex-1 sm:flex-none bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              {saveMutation.isPending ? "Saving…" : "Save Count"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BarInventoryPage() {
  const { currentLocation, hasBarAccess } = useLocation();
  const { toast } = useToast();

  // View state
  const [mode, setMode] = useState<"history" | "count">("history");
  const [selectedCountId, setSelectedCountId] = useState<number | null>(null);

  // Queries — must be called before the hasBarAccess guard
  const { data: allInventoryItems = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", currentLocation?.id],
    queryFn: () =>
      apiRequest("GET", `/api/inventory?locationId=${currentLocation?.id}`).then((r) => r.json()),
    enabled: !!currentLocation,
  });

  const { data: countSessions = [], isLoading: sessionsLoading } = useQuery<CountSession[]>({
    queryKey: ["/api/bar/inventory-counts", currentLocation?.id],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/bar/inventory-counts?locationId=${currentLocation?.id}`
      ).then((r) => r.json()),
    enabled: !!currentLocation,
  });

  const { data: selectedCount } = useQuery<CountDetail>({
    queryKey: ["/api/bar/inventory-counts", selectedCountId],
    queryFn: () =>
      apiRequest("GET", `/api/bar/inventory-counts/${selectedCountId}`).then((r) => r.json()),
    enabled: selectedCountId !== null,
  });

  // ── Bar access guard (after all hooks) ──────────────────────────────────────
  if (!hasBarAccess) {
    return (
      <BarUpgradePrompt locationName={currentLocation?.name || "this location"} />
    );
  }

  // Filter inventory to bar items
  const barItems = allInventoryItems.filter(isBarItem);
  // If nothing matched, fall back to all items so the page isn't empty
  const effectiveBarItems = barItems.length > 0 ? barItems : allInventoryItems;

  const isLoading = inventoryLoading || sessionsLoading;

  // ── Render ────────────────────────────────────────────────────────────────

  // Detail view
  if (selectedCountId !== null && selectedCount) {
    return (
      <div className="p-3 lg:p-6 space-y-6">
        <DetailView
          detail={selectedCount}
          onBack={() => setSelectedCountId(null)}
        />
      </div>
    );
  }

  // Count mode
  if (mode === "count") {
    return (
      <div className="p-3 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-3xl font-bold text-white">New Inventory Count</h1>
            <p className="text-xs lg:text-sm text-slate-400 mt-1">
              Record fill levels for all bar items
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-slate-400 text-sm py-8 text-center">Loading items…</div>
        ) : (
          <CountMode
            barItems={effectiveBarItems}
            locationId={currentLocation!.id}
            onSaved={() => setMode("history")}
            onCancel={() => setMode("history")}
          />
        )}
      </div>
    );
  }

  // History view (default)
  return (
    <div className="p-3 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-3xl font-bold text-white">Bar Inventory Counts</h1>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">
            Track bar stock levels by shift or period
          </p>
        </div>
        <Button
          data-testid="start-new-count-btn"
          onClick={() => setMode("count")}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white self-start sm:self-auto"
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          Start New Count
        </Button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading counts…</div>
      ) : countSessions.length === 0 ? (
        <EmptyState onStart={() => setMode("count")} />
      ) : (
        <div className="space-y-3">
          {countSessions.map((session) => (
            <CountCard
              key={session.id}
              count={session}
              onClick={() => {
                setSelectedCountId(session.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
