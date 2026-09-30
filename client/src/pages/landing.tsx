import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Utensils, BarChart3, Package, Receipt, Truck, Users, Shield, Smartphone, DollarSign, TrendingUp, Clock, AlertTriangle, ChefHat, Target } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Custom Background with Food-themed Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-orange-400 blur-3xl"></div>
        <div className="absolute top-40 right-32 w-24 h-24 rounded-full bg-green-400 blur-2xl"></div>
        <div className="absolute bottom-32 left-1/3 w-40 h-40 rounded-full bg-yellow-400 blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 rounded-full bg-red-400 blur-2xl"></div>
      </div>
      
      {/* Schema.org structured data for better SEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Restaurant Inventory Management Software - RestroFlow",
          "description": "Professional restaurant inventory management software with real-time food cost tracking, recipe costing, and waste reduction features.",
          "mainEntity": {
            "@type": "SoftwareApplication",
            "name": "RestroFlow",
            "applicationCategory": "Restaurant Management Software",
            "operatingSystem": "Web-based"
          }
        })
      }} />
      
      <div className="relative z-10">
        {/* Navigation Bar */}
        <nav className="container mx-auto px-4 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 mr-3 shadow-lg">
                <ChefHat className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">RestroFlow</span>
            </div>
            <Button 
              variant="outline"
              className="bg-transparent border-2 border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white px-6 py-2 font-semibold rounded-full transition-all duration-300"
              onClick={() => window.location.href = '/login'}
            >
              Login
            </Button>
          </div>
        </nav>

        {/* Unique Hero Section */}
        <header className="container mx-auto px-4 pt-14 pb-32">
          <div className="text-center max-w-6xl mx-auto">
            {/* Logo and Brand */}
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-red-500 mb-6 shadow-2xl">
                <ChefHat className="h-12 w-12 text-white" />
              </div>
              <h1 className="text-7xl font-black text-white mb-4 tracking-tight">
                RestroFlow
              </h1>
              <div className="h-1 w-32 bg-gradient-to-r from-orange-400 to-red-500 mx-auto mb-8"></div>
            </div>
            
            {/* Powerful Headline */}
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Stop Bleeding Money on
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
                Food Costs
              </span>
            </h2>
            
            <p className="text-xl text-slate-300 max-w-4xl mx-auto leading-relaxed mb-12">
              The restaurant <strong className="text-white">inventory management software</strong> that actually works. 
              Track every ingredient, calculate real costs, and turn your kitchen chaos into profit-generating precision.
            </p>
            
            {/* Dramatic Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
              <div className="text-center">
                <div className="text-4xl font-black text-orange-400 mb-2">30%</div>
                <div className="text-sm text-slate-400 uppercase tracking-wide">Waste Cut</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-black text-green-400 mb-2">50%</div>
                <div className="text-sm text-slate-400 uppercase tracking-wide">Less Than Competitors</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-black text-blue-400 mb-2">15min</div>
                <div className="text-sm text-slate-400 uppercase tracking-wide">Daily Setup</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-black text-purple-400 mb-2">2,400+</div>
                <div className="text-sm text-slate-400 uppercase tracking-wide">Restaurants</div>
              </div>
            </div>
            
            {/* CTA Button */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-12 py-4 text-lg font-bold rounded-full shadow-2xl transform hover:scale-105 transition-all duration-300"
                onClick={() => window.location.href = '/pricing'}
              >
                See Pricing
              </Button>
              <div className="text-slate-400 text-sm">
                No long-term contracts • Cancel anytime • Setup in 15 minutes
              </div>
            </div>
          </div>
        </header>

        {/* Features with Unique Design */}
        <section className="container mx-auto px-4 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              The Kitchen Command Center
            </h2>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto">
              Built by restaurant operators who understand the chaos. Every feature solves a real problem.
            </p>
          </div>
          
          {/* Hexagon Grid Layout */}
          <div className="relative max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-orange-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center mb-6">
                    <Target className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Precision Tracking</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Know exactly what you have, when you'll run out, and what it's really costing you. 
                    No more guessing, no more waste.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-green-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6">
                    <DollarSign className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">True Cost Analysis</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Every recipe down to the penny. Automatic price updates from vendors. 
                    Price your menu to actually make money.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-blue-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center mb-6">
                    <BarChart3 className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Profit Intelligence</h3>
                  <p className="text-slate-300 leading-relaxed">
                    See exactly which dishes make money and which ones don't. 
                    Turn data into decisions that boost your bottom line.
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-indigo-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-purple-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center mb-6">
                    <Truck className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Vendor Mastery</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Compare prices instantly. Automate orders. Never run out of ingredients again. 
                    Your suppliers work for you, not the other way around.
                  </p>
                </div>
              </div>

              {/* Feature 5 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-orange-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-yellow-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mb-6">
                    <AlertTriangle className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Waste Elimination</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Track every type of waste. Identify patterns. Stop throwing money in the trash. 
                    Most restaurants save their subscription cost in the first week.
                  </p>
                </div>
              </div>

              {/* Feature 6 */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-blue-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                <div className="relative bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 hover:border-teal-500/50 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center mb-6">
                    <Smartphone className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Always Connected</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Works on any device. Syncs with your POS. Your entire operation in your pocket. 
                    Manage inventory from anywhere, anytime.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="container mx-auto px-4 py-20">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-800 to-slate-700 rounded-3xl transform rotate-1"></div>
            <div className="relative bg-slate-800 rounded-3xl p-12 border border-slate-600">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-white mb-6">
                  "This Thing Actually Works"
                </h2>
                <p className="text-xl text-slate-300 max-w-2xl mx-auto">
                  Real results from real restaurants. No corporate BS, just owners saving serious money.
                </p>
              </div>
              
              {/* Testimonials Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                <div className="text-center">
                  <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-4">
                    $180K
                  </div>
                  <div className="text-white font-semibold mb-2">"Saved in first year"</div>
                  <div className="text-sm text-slate-400">- Maria's Kitchen, Chicago</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-500 mb-4">
                    40%
                  </div>
                  <div className="text-white font-semibold mb-2">"Cut food waste in half"</div>
                  <div className="text-sm text-slate-400">- Tony's Pizzeria, Brooklyn</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-4">
                    3 hrs
                  </div>
                  <div className="text-white font-semibold mb-2">"Daily time saved"</div>
                  <div className="text-sm text-slate-400">- The Corner Bistro, Austin</div>
                </div>
              </div>
              
              {/* Quote */}
              <div className="text-center max-w-4xl mx-auto">
                <div className="text-6xl text-orange-400 mb-4">"</div>
                <blockquote className="text-2xl text-white font-medium italic mb-6">
                  I was skeptical of another software promising to solve all my problems. 
                  But RestroFlow actually delivered. My food costs dropped 28% in three months, 
                  and I finally know what everything actually costs me.
                </blockquote>
                <div className="text-slate-300">
                  <div className="font-semibold">Sarah Chen</div>
                  <div className="text-sm">Owner, Golden Dragon Restaurant</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem/Solution with Bold Design */}
        <section className="container mx-auto px-4 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Problems */}
            <div className="order-2 lg:order-1">
              <h2 className="text-4xl font-bold text-white mb-8">
                Every Restaurant's Nightmare
              </h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-2xl">💸</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Money Down the Drain</h3>
                    <p className="text-slate-300">
                      Food spoils. You overorder. Portions are inconsistent. 
                      Your profit margins are a complete mystery.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-2xl">📊</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Flying Blind</h3>
                    <p className="text-slate-300">
                      Spreadsheets everywhere. Guessing at costs. 
                      Making pricing decisions with zero real data.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-2xl">⏰</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Time Vampire</h3>
                    <p className="text-slate-300">
                      Hours every week counting, calculating, and reconciling. 
                      Time you should spend growing your business.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Solution */}
            <div className="order-1 lg:order-2 relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-orange-400 to-red-500 rounded-3xl blur-2xl opacity-30"></div>
              <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 p-10 rounded-3xl border border-slate-600">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center mx-auto mb-4">
                    <ChefHat className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-white">RestroFlow Fixes It All</h3>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <span className="text-white">Real-time tracking of every ingredient</span>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <span className="text-white">Exact recipe costs updated automatically</span>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <span className="text-white">Smart alerts before you run out</span>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <span className="text-white">Profit analysis that actually makes sense</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA with Urgency */}
        <section className="container mx-auto px-4 py-20">
          <div className="relative max-w-6xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-600 rounded-3xl transform -rotate-1"></div>
            <div className="relative bg-gradient-to-br from-slate-900 to-black rounded-3xl p-12 border border-orange-500/50">
              <div className="text-center">
                <h2 className="text-5xl font-black text-white mb-6">
                  Stop Losing Money
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
                    Today
                  </span>
                </h2>
                
                <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-12 leading-relaxed">
                  Every day you wait is money down the drain. Join 2,400+ restaurants already saving 
                  with <strong className="text-white">RestroFlow inventory management software</strong>. 
                  Start your transformation in the next 15 minutes.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-16 py-6 text-xl font-black rounded-full shadow-2xl transform hover:scale-105 transition-all duration-300 border-2 border-orange-400"
                    onClick={() => window.location.href = '/login'}
                  >
                    GET STARTED NOW →
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl mx-auto text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                      <span className="text-green-400 text-xl">✓</span>
                    </div>
                    <span className="text-slate-300 font-medium">15-Minute Setup</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                      <span className="text-green-400 text-xl">✓</span>
                    </div>
                    <span className="text-slate-300 font-medium">No Long-term Contract</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                      <span className="text-green-400 text-xl">✓</span>
                    </div>
                    <span className="text-slate-300 font-medium">6 POS Integrations</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Distinctive Footer */}
        <footer className="container mx-auto px-4 py-16 border-t border-slate-700">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-red-500 mb-6">
              <ChefHat className="h-8 w-8 text-white" />
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4">
              RestroFlow - Restaurant Inventory Management Software
            </h3>
            
            <p className="text-slate-400 max-w-4xl mx-auto mb-8 leading-relaxed">
              Built by restaurant operators for restaurant operators. RestroFlow is the only 
              <strong className="text-white"> inventory management software</strong> that understands the chaos of running a kitchen. 
              Real-time tracking, precise costing, waste elimination, and profit optimization - all in one powerful platform. 
              Perfect for independent restaurants, chains, bars, cafes, and multi-location operations.
            </p>
            
            <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-500 mb-8">
              <span className="hover:text-orange-400 transition-colors">Restaurant Inventory Software</span>
              <span>•</span>
              <span className="hover:text-orange-400 transition-colors">Food Cost Management</span>
              <span>•</span>
              <span className="hover:text-orange-400 transition-colors">Recipe Costing Tools</span>
              <span>•</span>
              <span className="hover:text-orange-400 transition-colors">Vendor Management</span>
              <span>•</span>
              <span className="hover:text-orange-400 transition-colors">POS Integration</span>
            </div>
            
            <div className="text-slate-500 text-sm">
              <p>&copy; 2025 RestroFlow. Stop bleeding money. Start making profit.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
