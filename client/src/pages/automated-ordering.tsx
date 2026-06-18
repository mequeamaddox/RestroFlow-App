import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Zap, TrendingUp, Clock, Settings, AlertCircle } from 'lucide-react';

export default function AutomatedOrdering() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Bot className="h-8 w-8 text-blue-400" />
            Automated Ordering
            <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white">COMING SOON</Badge>
          </h1>
          <p className="text-slate-400 mt-2">
            AI-powered automatic purchase orders based on consumption patterns
          </p>
        </div>
      </div>

      {/* Coming Soon Card */}
      <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 p-4 bg-blue-500/20 rounded-full w-fit">
            <Bot className="h-12 w-12 text-blue-400" />
          </div>
          <CardTitle className="text-2xl text-white">Advanced AI Ordering Intelligence</CardTitle>
          <p className="text-slate-300">Revolutionary automated purchasing system coming soon</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Feature Preview Cards */}
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="h-6 w-6 text-yellow-400" />
                <h3 className="font-semibold text-white">Smart Triggers</h3>
              </div>
              <p className="text-sm text-slate-400">
                Automatically generate purchase orders based on inventory levels, consumption patterns, and demand forecasting
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="h-6 w-6 text-green-400" />
                <h3 className="font-semibold text-white">Predictive Analytics</h3>
              </div>
              <p className="text-sm text-slate-400">
                AI learns from your usage patterns to predict optimal order quantities and timing
              </p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="h-6 w-6 text-blue-400" />
                <h3 className="font-semibold text-white">Time Savings</h3>
              </div>
              <p className="text-sm text-slate-400">
                Save hours weekly by automating repetitive ordering tasks and vendor management
              </p>
            </div>
          </div>

          {/* Planned Features */}
          <div className="bg-slate-800/30 p-6 rounded-lg border border-slate-600/30">
            <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-400" />
              Planned Features
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Intelligent Reorder Points</div>
                  <div className="text-slate-400">Dynamic calculation based on lead times and consumption</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Vendor Integration</div>
                  <div className="text-slate-400">Direct API connections with major food suppliers</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Cost Optimization</div>
                  <div className="text-slate-400">Automatic price comparison and best deal selection</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-white font-medium">Seasonal Adjustments</div>
                  <div className="text-slate-400">AI adapts to seasonal demand patterns and trends</div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-8">
            <p className="text-slate-300 mb-4">
              This powerful feature is in final development stages
            </p>
            <Button 
              disabled 
              className="bg-slate-600 text-slate-300 cursor-not-allowed"
              data-testid="button-coming-soon"
            >
              Available Soon - Professional Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}