import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Crown, Zap, FileImage, CheckCircle, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UpgradePromptProps {
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  reason?: 'credits_exhausted' | 'image_ocr_blocked' | 'upgrade_suggestion';
}

export function UpgradePrompt({ 
  trigger, 
  isOpen: controlledOpen, 
  onOpenChange: controlledOnOpenChange,
  reason = 'upgrade_suggestion' 
}: UpgradePromptProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || setInternalOpen;

  const upgradeMutation = useMutation({
    mutationFn: async (plan: string) => {
      const response = await apiRequest("POST", "/api/user/upgrade-plan", { plan });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription'] });
      toast({
        title: "Welcome to RestroFlow Core! 🎉",
        description: "You now have unlimited OCR processing with advanced image recognition",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Upgrade Failed",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  });

  const getReasonContent = () => {
    switch (reason) {
      case 'credits_exhausted':
        return {
          title: "OCR Credits Exhausted",
          description: "You've used all your free OCR processing credits this month",
          icon: <Zap className="h-6 w-6 text-amber-500" />,
          urgency: "high"
        };
      case 'image_ocr_blocked':
        return {
          title: "Premium Feature Required",
          description: "Advanced OCR for scanned images requires a RestroFlow Core subscription",
          icon: <FileImage className="h-6 w-6 text-blue-500" />,
          urgency: "medium"
        };
      default:
        return {
          title: "Upgrade to RestroFlow Core",
          description: "Unlock unlimited OCR processing and advanced features",
          icon: <Crown className="h-6 w-6 text-purple-500" />,
          urgency: "low"
        };
    }
  };

  const content = getReasonContent();
  const isHighUrgency = content.urgency === 'high';

  const DialogComponent = trigger ? Dialog : 'div';
  const dialogProps = trigger ? { open: isOpen, onOpenChange } : {};

  return (
    <DialogComponent {...dialogProps}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {content.icon}
            <div>
              <DialogTitle className="text-white">{content.title}</DialogTitle>
              <DialogDescription className="text-slate-400 mt-1">
                {content.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current vs Core Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-slate-300">Free Plan</CardTitle>
                  <Badge variant="secondary" className="text-xs">Current</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-slate-400">• 5 OCR credits/month</div>
                <div className="text-slate-400">• Text PDFs only</div>
                <div className="text-slate-400">• Basic processing</div>
                <div className="text-slate-400">• Email support</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-white flex items-center gap-1">
                    <Crown className="h-4 w-4" />
                    RestroFlow Core
                  </CardTitle>
                  <Badge className="text-xs bg-orange-500">Upgrade</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-white flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Unlimited OCR processing
                </div>
                <div className="text-white flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Images + scanned invoices
                </div>
                <div className="text-white flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Advanced AI recognition
                </div>
                <div className="text-white flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Priority phone support
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Value Proposition */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
            <div className="text-sm text-slate-300 font-medium">Why upgrade now?</div>
            <div className="space-y-2 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-orange-400" />
                Process unlimited invoices without monthly limits
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-orange-400" />
                Handle scanned documents and poor-quality images
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-orange-400" />
                Save 40% vs MarginEdge ($179 vs $330/month)
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="text-center space-y-4">
            <div>
              <div className="text-2xl font-bold text-white">$179<span className="text-base text-slate-400">/month</span></div>
              <div className="text-sm text-slate-400">per location • Cancel anytime</div>
              <div className="text-xs text-orange-400 font-medium">Save $1,848/year vs MarginEdge</div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => onOpenChange(false)}
                disabled={upgradeMutation.isPending}
              >
                Maybe Later
              </Button>
              <Button 
                className={`flex-1 gap-2 ${
                  isHighUrgency 
                    ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                } text-white shadow-lg`}
                onClick={() => upgradeMutation.mutate('core')}
                disabled={upgradeMutation.isPending}
              >
                <Crown className="h-4 w-4" />
                {upgradeMutation.isPending ? "Upgrading..." : "Upgrade Now"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogComponent>
  );
}