"use client";

import { useState } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { AI_PROVIDER_CONFIGS } from "@/lib/ai";
import type { AIProvider, AIModel } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ApiKeyCardProps {
  provider: AIProvider;
}

export function ApiKeyCard({ provider }: ApiKeyCardProps) {
  const { settings, setApiKey, setApiKeyValidated } = useProjectStore();
  const providerSettings = settings.aiProviders[provider];
  const config = AI_PROVIDER_CONFIGS[provider];

  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(providerSettings.apiKey || "");
  const [selectedModel, setSelectedModel] = useState(
    config.models.find((m) => m.recommended)?.id || config.models[0]?.id || ""
  );
  const [validating, setValidating] = useState(false);
  const [showModels, setShowModels] = useState(false);

  const handleSave = () => {
    setApiKey(provider, localKey);
    toast.success(`API ключ для ${config.label} збережено`);
  };

  const handleValidate = async () => {
    const keyToValidate = localKey;
    if (!keyToValidate) {
      toast.error("Введіть API ключ");
      return;
    }

    // Save first if changed
    if (keyToValidate !== providerSettings.apiKey) {
      setApiKey(provider, keyToValidate);
    }

    setValidating(true);
    try {
      const res = await fetch("/api/ai/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyToValidate, model: selectedModel }),
      });
      const data = await res.json();

      if (data.valid) {
        setApiKeyValidated(provider, true);
        toast.success(`✅ API ключ ${config.label} валідний!`);
        if (data.modelsAvailable?.length > 0) {
          toast.info(`Доступно моделей: ${data.modelsAvailable.slice(0, 3).join(", ")}...`);
        }
      } else {
        setApiKeyValidated(provider, false);
        toast.error(`❌ ${data.error || "Невалідний API ключ"}`);
      }
    } catch (err) {
      toast.error(`Помилка мережі: ${(err as Error).message}`);
    } finally {
      setValidating(false);
    }
  };

  const isValidated = providerSettings.validated;

  const PROVIDER_ICONS: Record<AIProvider, string> = {
    anthropic: "🤖",
    openrouter: "🔀",
    gemini: "✨",
    grok: "⚡",
  };

  return (
    <Card className={cn(
      "transition-colors",
      isValidated && "border-green-200 dark:border-green-900"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{PROVIDER_ICONS[provider]}</span>
            <div>
              <CardTitle className="text-base">{config.label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{config.description}</CardDescription>
            </div>
          </div>

          {/* Validation status */}
          {providerSettings.apiKey && (
            isValidated
              ? <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              : <XCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* API Key input */}
        <div className="space-y-1.5">
          <Label htmlFor={`key-${provider}`} className="text-xs">API Ключ</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={`key-${provider}`}
                type={showKey ? "text" : "password"}
                value={localKey}
                onChange={(e) => {
                  setLocalKey(e.target.value);
                  if (isValidated) setApiKeyValidated(provider, false);
                }}
                placeholder={`Введіть ${config.label} API ключ...`}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={!localKey}>
              Зберегти
            </Button>
          </div>
        </div>

        {/* Model selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Модель для тестування</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.models.map((model: AIModel) => (
                <SelectItem key={model.id} value={model.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    {model.name}
                    {model.recommended && (
                      <span className="text-[10px] bg-primary/10 text-primary rounded px-1">Рекомендовано</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Models info toggle */}
        <button
          onClick={() => setShowModels(!showModels)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showModels && "rotate-180")} />
          Доступні моделі ({config.models.length})
        </button>

        {showModels && (
          <div className="rounded-lg border divide-y text-xs overflow-hidden">
            {config.models.map((model: AIModel) => (
              <div key={model.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50">
                <div>
                  <p className="font-medium flex items-center gap-1.5">
                    {model.name}
                    {model.recommended && (
                      <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded px-1">★</span>
                    )}
                  </p>
                  <p className="text-muted-foreground font-mono">{model.id}</p>
                </div>
                <div className="text-right text-muted-foreground">
                  <p>{(model.contextWindow / 1000).toFixed(0)}K токенів</p>
                  {model.costPer1KInput === 0
                    ? <p className="text-green-600 dark:text-green-400">Безкоштовно</p>
                    : <p>${model.costPer1KInput}/1K in</p>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Validate button */}
        <Button
          onClick={handleValidate}
          disabled={!localKey || validating}
          className="w-full"
          variant={isValidated ? "outline" : "default"}
        >
          {validating ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Валідація...</>
          ) : isValidated ? (
            <><CheckCircle className="h-4 w-4 mr-2 text-green-500" />Валідований — перевірити знову</>
          ) : (
            "Валідувати API ключ"
          )}
        </Button>

        {isValidated && providerSettings.validatedAt && (
          <p className="text-xs text-center text-muted-foreground">
            Перевірено: {new Date(providerSettings.validatedAt).toLocaleString("uk-UA")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
