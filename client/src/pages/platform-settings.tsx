import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, CheckCircle, XCircle, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PlatformSettingsResponse {
  settings: Record<string, {
    value: string | null;
    description: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  }>;
  env: {
    stripeConfigured: boolean;
    stripePriceCoreEnv: string;
    clerkConfigured: boolean;
    encryptionConfigured: boolean;
    sentryConfigured: boolean;
  };
}

interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  createdAt: string | null;
}

const quickConfigItems = [
  {
    key: "stripe_price_core",
    label: "Stripe Price ID — Core Plan",
    description: "Stripe Price ID for RestroFlow Core plan (price_xxx)",
    type: "text",
  },
  {
    key: "ocr_free_credits",
    label: "OCR Free Credits",
    description: "OCR credits allocated to free plan users",
    type: "number",
    defaultValue: "5",
  },
  {
    key: "trial_days",
    label: "Trial Days",
    description: "Trial days for new Core subscriptions",
    type: "number",
    defaultValue: "0",
  },
  {
    key: "billing_enabled",
    label: "Billing Enabled",
    description: "Enable Stripe billing/checkout flow",
    type: "toggle",
    defaultValue: "true",
  },
];

function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle className="h-4 w-4 text-green-400" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
      <span className={ok ? "text-green-300" : "text-red-300"}>{label}</span>
    </div>
  );
}

export default function PlatformSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const isPlatformAdmin = (user as any)?.role === "platform_admin";

  const { data: platformData, isLoading: settingsLoading } =
    useQuery<PlatformSettingsResponse>({
      queryKey: ["/api/platform/settings"],
      enabled: isPlatformAdmin,
    });

  const { data: usersData, isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/platform/users"],
    enabled: isPlatformAdmin,
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return apiRequest("PUT", `/api/platform/settings/${key}`, { value });
    },
    onSuccess: (_data, { key }) => {
      toast({
        title: "Setting saved",
        description: `${key} has been updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/settings"] });
      setEditingKey(null);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Card className="bg-slate-800 border-slate-700 p-8 text-center max-w-md">
          <Shield className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">
            This page is restricted to platform administrators only.
          </p>
        </Card>
      </div>
    );
  }

  const settings = platformData?.settings ?? {};
  const env = platformData?.env;

  function startEdit(key: string, currentValue: string | null) {
    setEditingKey(key);
    setEditValue(currentValue ?? "");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
  }

  function saveEdit(key: string) {
    updateSetting.mutate({ key, value: editValue });
  }

  function getSettingValue(key: string, defaultValue?: string) {
    return settings[key]?.value ?? defaultValue ?? "";
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-500/20 rounded-lg">
          <Shield className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
          <p className="text-slate-400 text-sm">
            System configuration and user management
          </p>
        </div>
        <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30">
          ADMIN ONLY
        </Badge>
      </div>

      {/* System Status */}
      <Card className="bg-slate-800/80 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">System Status</CardTitle>
        </CardHeader>
        <CardContent>
          {env ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatusIndicator ok={env.stripeConfigured} label="Stripe Secret Key" />
              <StatusIndicator
                ok={env.stripePriceCoreEnv === "set"}
                label={`Stripe Price Core (env: ${env.stripePriceCoreEnv})`}
              />
              <StatusIndicator ok={env.clerkConfigured} label="Clerk Secret Key" />
              <StatusIndicator ok={env.encryptionConfigured} label="PII Encryption Key" />
              <StatusIndicator ok={env.sentryConfigured} label="Sentry DSN" />
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Loading...</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Config */}
      <Card className="bg-slate-800/80 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Quick Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <p className="text-slate-400 text-sm">Loading settings...</p>
          ) : (
            quickConfigItems.map((item) => {
              const currentValue = getSettingValue(item.key, item.defaultValue);
              const isEditing = editingKey === item.key;

              return (
                <div
                  key={item.key}
                  className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm">
                        {item.label}
                      </span>
                      <code className="text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
                        {item.key}
                      </code>
                    </div>
                    <p className="text-slate-400 text-xs">{item.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.type === "toggle" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={currentValue === "true"}
                          onCheckedChange={(checked) => {
                            updateSetting.mutate({
                              key: item.key,
                              value: String(checked),
                            });
                          }}
                          disabled={updateSetting.isPending}
                        />
                        <span className="text-slate-300 text-sm">
                          {currentValue === "true" ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    ) : isEditing ? (
                      <>
                        <Input
                          type={item.type}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white w-48 h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(item.key);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveEdit(item.key)}
                          disabled={updateSetting.isPending}
                          className="h-8 text-green-400 hover:text-green-300"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          className="h-8 text-slate-400 hover:text-slate-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-300 text-sm font-mono min-w-[80px] text-right">
                          {currentValue || (
                            <span className="text-slate-500 italic">not set</span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(item.key, currentValue)}
                          className="h-8 text-slate-400 hover:text-white"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* All Platform Settings */}
      <Card className="bg-slate-800/80 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">
            All Settings
            <span className="ml-2 text-sm font-normal text-slate-400">
              ({Object.keys(settings).length} stored)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(settings).length === 0 ? (
            <p className="text-slate-400 text-sm">
              No settings stored yet. Use Quick Config above to add some.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Key</TableHead>
                  <TableHead className="text-slate-400">Value</TableHead>
                  <TableHead className="text-slate-400">Description</TableHead>
                  <TableHead className="text-slate-400">Updated</TableHead>
                  <TableHead className="text-slate-400 w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(settings).map(([key, row]) => {
                  const isEditing = editingKey === key;
                  return (
                    <TableRow key={key} className="border-slate-700/50">
                      <TableCell className="text-white font-mono text-xs">
                        {key}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-40"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(key);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveEdit(key)}
                              disabled={updateSetting.isPending}
                              className="h-7 text-green-400 hover:text-green-300"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEdit}
                              className="h-7 text-slate-400 hover:text-slate-300"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-xs">
                            {row.value ?? (
                              <span className="text-slate-500 italic">null</span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {row.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {row.updatedAt
                          ? new Date(row.updatedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(key, row.value)}
                            className="h-7 text-slate-400 hover:text-white"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card className="bg-slate-800/80 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">
            All Users
            {usersData && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({usersData.length} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <p className="text-slate-400 text-sm">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Role</TableHead>
                    <TableHead className="text-slate-400">Plan</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usersData ?? []).map((u) => (
                    <TableRow key={u.id} className="border-slate-700/50">
                      <TableCell className="text-white text-sm">
                        {u.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") ||
                          "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            u.role === "platform_admin"
                              ? "bg-red-500/20 text-red-400 border-red-500/30"
                              : u.role === "owner"
                              ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                              : "bg-slate-600/40 text-slate-300 border-slate-600"
                          }
                        >
                          {u.role ?? "employee"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            u.subscriptionPlan === "core"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-slate-600/40 text-slate-300 border-slate-600"
                          }
                        >
                          {u.subscriptionPlan ?? "free"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            u.subscriptionStatus === "active"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : u.subscriptionStatus === "past_due"
                              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              : "bg-slate-600/40 text-slate-400 border-slate-600"
                          }
                        >
                          {u.subscriptionStatus ?? "inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {u.createdAt
                          ? new Date(u.createdAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
