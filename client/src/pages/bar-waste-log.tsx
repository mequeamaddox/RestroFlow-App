import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, AlertTriangle, DollarSign, List, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "@/contexts/LocationContext";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WasteEntry {
  id: string;
  itemName: string;
  quantity: string;
  unit: string;
  cost: string | null;
  reason: string;
  notes: string | null;
  loggedBy: string;
  logDate: string;
  shift: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  isAlcoholic: boolean;
  pricePerOz: string | null;
  costPerUnit: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  spillage: "Spillage",
  breakage: "Breakage",
  comp: "Comp / Courtesy",
  over_pour: "Over-Pour",
  theft: "Theft / Unexplained",
  other: "Other",
};

const REASON_BADGE_CLASSES: Record<string, string> = {
  spillage: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  breakage: "bg-red-500/20 text-red-300 border-red-500/30",
  comp: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  over_pour: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  theft: "bg-red-900/40 text-red-200 border-red-800/50",
  other: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const UNIT_OPTIONS = ["oz", "ml", "bottle", "pint", "shot", "each"];
const SHIFT_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];
const DAY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const wasteFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  inventoryItemId: z.string().optional(),
  quantity: z
    .string()
    .min(1, "Quantity is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Quantity must be a positive number",
    }),
  unit: z.string().min(1, "Unit is required"),
  reason: z.string().min(1, "Reason is required"),
  cost: z.string().optional(),
  shift: z.string().optional(),
  notes: z.string().optional(),
});

type WasteFormData = z.infer<typeof wasteFormSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(cost: string | null): string {
  if (!cost) return "";
  const num = parseFloat(cost);
  if (isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getTopReasons(
  entries: WasteEntry[]
): { reason: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.reason] = (counts[e.reason] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BarWasteLog() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [days, setDays] = useState("30");
  const [useInventoryItem, setUseInventoryItem] = useState(false);

  const { toast } = useToast();
  const { currentLocation, hasBarAccess } = useLocation();
  const queryClient = useQueryClient();
  const locationId = currentLocation?.id;

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading } = useQuery<WasteEntry[]>({
    queryKey: ["/api/bar/waste-log", locationId, days],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/bar/waste-log?locationId=${locationId}&days=${days}`
      ).then((r) => r.json()),
    enabled: !!locationId,
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", locationId],
    queryFn: () =>
      apiRequest("GET", `/api/inventory?locationId=${locationId}`).then((r) =>
        r.json()
      ),
    enabled: !!locationId,
  });

  // ── Form ──────────────────────────────────────────────────────────────────

  const form = useForm<WasteFormData>({
    resolver: zodResolver(wasteFormSchema),
    defaultValues: {
      itemName: "",
      inventoryItemId: "",
      quantity: "",
      unit: "oz",
      reason: "",
      cost: "",
      shift: "",
      notes: "",
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: WasteFormData) => {
      await apiRequest("POST", "/api/bar/waste-log", {
        locationId,
        itemName: data.itemName,
        quantity: data.quantity,
        unit: data.unit,
        reason: data.reason,
        cost: data.cost || null,
        shift: data.shift || null,
        notes: data.notes || null,
        inventoryItemId: data.inventoryItemId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/bar/waste-log", locationId],
      });
      setIsDialogOpen(false);
      form.reset();
      setUseInventoryItem(false);
      toast({ title: "Entry logged", description: "Waste entry has been recorded." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to log waste entry.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/bar/waste-log/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/bar/waste-log", locationId],
      });
      toast({ title: "Deleted", description: "Waste entry removed." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete entry.",
        variant: "destructive",
      });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onSubmit = (data: WasteFormData) => createMutation.mutate(data);

  const handleInventorySelect = (id: string) => {
    const item = inventoryItems.find((i) => i.id === id);
    if (!item) return;
    form.setValue("inventoryItemId", id);
    form.setValue("itemName", item.name);
    form.setValue("unit", item.unit || "oz");
    // Auto-populate cost from pricePerOz if quantity already entered
    const qty = parseFloat(form.getValues("quantity") || "0");
    if (item.pricePerOz && qty > 0) {
      const estimated = (parseFloat(item.pricePerOz) * qty).toFixed(2);
      form.setValue("cost", estimated);
    }
  };

  const handleQuantityBlur = () => {
    const invId = form.getValues("inventoryItemId");
    if (!invId) return;
    const item = inventoryItems.find((i) => i.id === invId);
    if (!item?.pricePerOz) return;
    const qty = parseFloat(form.getValues("quantity") || "0");
    if (qty > 0) {
      form.setValue("cost", (parseFloat(item.pricePerOz) * qty).toFixed(2));
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      form.reset();
      setUseInventoryItem(false);
    }
  };

  // ── Computed summary stats ─────────────────────────────────────────────────

  const totalCost = entries.reduce((sum, e) => {
    const c = parseFloat(e.cost || "0");
    return sum + (isNaN(c) ? 0 : c);
  }, 0);

  const topReasons = getTopReasons(entries);

  // Sorted inventory: alcoholic first, then rest
  const sortedInventory = [...inventoryItems].sort((a, b) => {
    if (a.isAlcoholic && !b.isAlcoholic) return -1;
    if (!a.isAlcoholic && b.isAlcoholic) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── Bar access guard — AFTER all hooks ────────────────────────────────────

  if (!hasBarAccess) {
    return (
      <BarUpgradePrompt
        locationName={currentLocation?.name || "this location"}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-violet-400" />
            Waste & Spillage Log
          </h1>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">
            Track pour variance, breakage, and unexplained losses
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button
              data-testid="button-log-waste-entry"
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Log Waste Entry
            </Button>
          </DialogTrigger>

          {/* ── Add Waste Entry Dialog ── */}
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-semibold">
                Log Waste Entry
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 pt-2"
              >
                {/* Item Source Toggle */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={useInventoryItem ? "outline" : "secondary"}
                    className={
                      !useInventoryItem
                        ? "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
                        : "bg-slate-800 border-slate-600 text-slate-300 hover:text-white"
                    }
                    onClick={() => {
                      setUseInventoryItem(false);
                      form.setValue("inventoryItemId", "");
                    }}
                    data-testid="button-manual-entry"
                  >
                    Manual Entry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={useInventoryItem ? "secondary" : "outline"}
                    className={
                      useInventoryItem
                        ? "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
                        : "bg-slate-800 border-slate-600 text-slate-300 hover:text-white"
                    }
                    onClick={() => setUseInventoryItem(true)}
                    data-testid="button-choose-from-inventory"
                  >
                    Choose from Inventory
                  </Button>
                </div>

                {/* Item Name / Inventory Selector */}
                {useInventoryItem ? (
                  <FormField
                    control={form.control}
                    name="inventoryItemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">
                          Inventory Item
                        </FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            handleInventorySelect(val);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="bg-slate-800 border-slate-600 text-white"
                              data-testid="select-inventory-item"
                            >
                              <SelectValue placeholder="Select an item..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {sortedInventory.length === 0 && (
                              <SelectItem
                                value="__none"
                                disabled
                                className="text-slate-400"
                              >
                                No inventory items found
                              </SelectItem>
                            )}
                            {sortedInventory.some((i) => i.isAlcoholic) && (
                              <div className="px-2 py-1 text-xs text-violet-400 font-semibold uppercase tracking-wide">
                                Alcoholic
                              </div>
                            )}
                            {sortedInventory
                              .filter((i) => i.isAlcoholic)
                              .map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  className="text-white focus:bg-slate-700"
                                >
                                  {item.name}{" "}
                                  <span className="text-slate-400 text-xs ml-1">
                                    ({item.unit})
                                  </span>
                                </SelectItem>
                              ))}
                            {sortedInventory.some((i) => !i.isAlcoholic) && (
                              <div className="px-2 py-1 text-xs text-slate-400 font-semibold uppercase tracking-wide mt-1">
                                Other
                              </div>
                            )}
                            {sortedInventory
                              .filter((i) => !i.isAlcoholic)
                              .map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  className="text-white focus:bg-slate-700"
                                >
                                  {item.name}{" "}
                                  <span className="text-slate-400 text-xs ml-1">
                                    ({item.unit})
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="itemName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">
                          Item Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. House Whiskey, Draft Beer..."
                            className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                            data-testid="input-item-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Hidden itemName when inventory mode — populated by handleInventorySelect */}
                {useInventoryItem && (
                  <FormField
                    control={form.control}
                    name="itemName"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormControl>
                          <Input {...field} type="hidden" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Quantity + Unit row */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">
                          Quantity
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                            data-testid="input-quantity"
                            onBlur={handleQuantityBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Unit</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="bg-slate-800 border-slate-600 text-white"
                              data-testid="select-unit"
                            >
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {UNIT_OPTIONS.map((u) => (
                              <SelectItem
                                key={u}
                                value={u}
                                className="text-white focus:bg-slate-700"
                              >
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Reason */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Reason</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="bg-slate-800 border-slate-600 text-white"
                            data-testid="select-reason"
                          >
                            <SelectValue placeholder="Select a reason..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {Object.entries(REASON_LABELS).map(
                            ([value, label]) => (
                              <SelectItem
                                key={value}
                                value={value}
                                className="text-white focus:bg-slate-700"
                              >
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cost + Shift row */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">
                          Cost ($)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                            data-testid="input-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shift"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Shift</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="bg-slate-800 border-slate-600 text-white"
                              data-testid="select-shift"
                            >
                              <SelectValue placeholder="Select shift..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {SHIFT_OPTIONS.map(({ value, label }) => (
                              <SelectItem
                                key={value}
                                value={value}
                                className="text-white focus:bg-slate-700"
                              >
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">
                        Notes{" "}
                        <span className="text-slate-500 font-normal">
                          (optional)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Any additional context..."
                          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                          rows={3}
                          data-testid="textarea-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-slate-800 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                    onClick={() => handleDialogClose(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                    data-testid="button-submit-waste"
                  >
                    {createMutation.isPending ? "Logging..." : "Log Entry"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Summary Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <DollarSign className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                Total Cost
              </p>
              <p className="text-xl font-bold text-white">
                ${totalCost.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">this period</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <List className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                Total Entries
              </p>
              <p className="text-xl font-bold text-white">{entries.length}</p>
              <p className="text-xs text-slate-500">logged events</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10">
                <TrendingDown className="h-4 w-4 text-violet-400" />
              </div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                Top Reasons
              </p>
            </div>
            {topReasons.length === 0 ? (
              <p className="text-xs text-slate-500">No data yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {topReasons.map(({ reason, count }) => (
                  <span
                    key={reason}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                      REASON_BADGE_CLASSES[reason] ??
                      REASON_BADGE_CLASSES.other
                    }`}
                  >
                    {REASON_LABELS[reason] ?? reason}
                    <span className="opacity-70">({count})</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Filters Row ── */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 shrink-0">Show last:</span>
        <Tabs value={days} onValueChange={setDays}>
          <TabsList className="bg-slate-800 border border-slate-700">
            {DAY_OPTIONS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-slate-400"
                data-testid={`tab-days-${value}`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Table ── */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base font-semibold">
            Waste Entries
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">
              Loading entries...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 px-4">
              <AlertTriangle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No waste entries yet</p>
              <p className="text-slate-500 text-sm mt-1">
                No waste entries yet — start logging to track pour variance
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Date / Time
                    </th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Item
                    </th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Qty
                    </th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Reason
                    </th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Cost
                    </th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">
                      Shift
                    </th>
                    <th className="text-right text-slate-400 font-medium px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Date / Time */}
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {formatDate(entry.logDate)}
                      </td>

                      {/* Item */}
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">
                          {entry.itemName}
                        </span>
                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate">
                            {entry.notes}
                          </p>
                        )}
                      </td>

                      {/* Qty + Unit */}
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {entry.quantity}{" "}
                        <span className="text-slate-500">{entry.unit}</span>
                      </td>

                      {/* Reason badge */}
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs border ${
                            REASON_BADGE_CLASSES[entry.reason] ??
                            REASON_BADGE_CLASSES.other
                          }`}
                        >
                          {REASON_LABELS[entry.reason] ?? entry.reason}
                        </Badge>
                      </td>

                      {/* Cost */}
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {formatCost(entry.cost) || (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Shift */}
                      <td className="px-4 py-3 text-slate-400 capitalize">
                        {entry.shift ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                              data-testid={`button-delete-${entry.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-slate-900 border-slate-700">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">
                                Delete entry?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-400">
                                This will permanently remove the waste entry for{" "}
                                <span className="text-white font-medium">
                                  {entry.itemName}
                                </span>
                                . This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(entry.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
