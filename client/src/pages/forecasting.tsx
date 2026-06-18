import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  TrendingUp, 
  Calendar, 
  Target,
  AlertCircle,
  BarChart3,
  Zap
} from 'lucide-react';

export default function Forecasting() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-400" />
            Demand Forecasting
            <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white">COMING SOON</Badge>
          </h1>
          <p className="text-slate-400 mt-2">
            AI-powered demand prediction using sales history, weather patterns, and seasonal trends
          </p>
        </div>
      </div>

      {/* Coming Soon Card */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 p-4 bg-purple-500/20 rounded-full w-fit">
            <Brain className="h-12 w-12 text-purple-400" />
          </div>
          <CardTitle className="text-2xl text-white">Advanced Demand Forecasting AI</CardTitle>
          <p className="text-slate-300">Predictive analytics for perfect inventory planning</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Feature Preview Cards */}
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="h-6 w-6 text-green-400" />
                <h3 className="font-semibold text-white">Sales Pattern Analysis</h3>
              </div>
              <p className="text-sm text-slate-400">
                Analyze historical sales data to identify trends, seasonality, and demand patterns
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-6 w-6 text-blue-400" />
                <h3 className="font-semibold text-white">Event Integration</h3>
              </div>
              <p className="text-sm text-slate-400">
                Factor in holidays, local events, and weather forecasts for accurate predictions
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Target className="h-6 w-6 text-red-400" />
                <h3 className="font-semibold text-white">Precision Accuracy</h3>
              </div>
              <p className="text-sm text-slate-400">
                Achieve 91%+ forecast accuracy with machine learning algorithms
              </p>
            </div>
          </div>

          {/* Planned Analytics */}
          <div className="bg-slate-800/30 p-6 rounded-lg border border-slate-600/30">
            <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              Advanced Analytics Features
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Multi-Variable Modeling</div>
                  <div className="text-slate-400">Weather, events, promotions, and seasonality analysis</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Real-Time Adjustments</div>
                  <div className="text-slate-400">Dynamic forecast updates based on current sales</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Confidence Intervals</div>
                  <div className="text-slate-400">Statistical confidence ranges for risk management</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Menu Item Correlation</div>
                  <div className="text-slate-400">Cross-item demand relationships and bundling insights</div>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-6 rounded-lg border border-purple-400/20 mt-6">
            <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              Expected Business Impact
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-400">25%</div>
                <div className="text-xs text-slate-400">Waste Reduction</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">18%</div>
                <div className="text-xs text-slate-400">Cost Savings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">91%</div>
                <div className="text-xs text-slate-400">Accuracy Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-400">3.5hrs</div>
                <div className="text-xs text-slate-400">Time Saved/Week</div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-8">
            <p className="text-slate-300 mb-4">
              Advanced machine learning algorithms are being fine-tuned for restaurant operations
            </p>
            <Button 
              disabled 
              className="bg-slate-600 text-slate-300 cursor-not-allowed"
              data-testid="button-forecasting-coming-soon"
            >
              Available Soon - Enterprise Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}