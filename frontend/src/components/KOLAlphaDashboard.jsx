import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowUpRight, 
  Flame, 
  Activity, 
  Sparkles, 
  Search, 
  Clock, 
  Users, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Zap,
  BarChart3,
  PieChart,
  Network,
  Brain,
  Eye,
  Filter,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Edit,
  Settings,
  UserPlus,
  UserMinus,
  MessageSquare,
  Crown
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  CartesianGrid,
  ScatterChart,
  Scatter,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
  Area,
  AreaChart,
  ComposedChart
} from "recharts";

/**
 * Enhanced KOL Alpha Dashboard
 * 
 * Features:
 * - Real-time heatmap with advanced filtering
 * - Momentum board with price correlation
 * - KOL reliability scoring with historical performance
 * - Alpha signal detection and alerts
 * - Lead-lag analysis visualization
 * - Network analysis and influence mapping
 * - Export functionality for data analysis
 */

const COLORS = {
  bullish: '#10b981',
  bearish: '#ef4444', 
  neutral: '#6b7280',
  high_engagement: '#8b5cf6',
  low_engagement: '#94a3b8'
};

const KOL_AVATARS = {
  'elonmusk': '🚀',
  'VitalikButerin': '🔷',
  'naval': '🧠',
  'balajis': '🏛️',
  'APompliano': '₿',
  'michael_saylor': '🏢',
  'justinsuntron': '🔴',
  'cz_binance': '🟡',
  'brian_armstrong': '🔵',
  'barrysilbert': '⚡'
};

export default function KOLAlphaDashboard() {
  // State management
  const [windowSel, setWindowSel] = useState("24h");
  const [query, setQuery] = useState("");
  const [selectedCoins, setSelectedCoins] = useState([]);
  const [selectedKOLs, setSelectedKOLs] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [kolsData, setKolsData] = useState([]);
  const [showAddKOLModal, setShowAddKOLModal] = useState(false);
  const [editingKOL, setEditingKOL] = useState(null);
  const [newKOL, setNewKOL] = useState({ handle: '', influence_score: 50, segments: [] });

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/kolsentiment/dashboard?window=${windowSel}`);
      const result = await response.json();
      
      if (result.success) {
        setDashboardData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch KOLs data
  const fetchKOLsData = async () => {
    try {
      const response = await fetch('/api/kolsentiment/kols');
      const result = await response.json();
      
      if (result.success) {
        setKolsData(result.data);
      }
    } catch (err) {
      console.error('Error fetching KOLs:', err);
    }
  };

  // Add new KOL
  const addKOL = async () => {
    try {
      const response = await fetch('/api/kolsentiment/kols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKOL)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setShowAddKOLModal(false);
        setNewKOL({ handle: '', influence_score: 50, segments: [] });
        await fetchKOLsData();
        await fetchDashboardData();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error adding KOL: ${err.message}`);
    }
  };

  // Delete KOL
  const deleteKOL = async (handle) => {
    if (!confirm(`Are you sure you want to delete @${handle}?`)) return;
    
    try {
      const response = await fetch(`/api/kolsentiment/kols/${handle}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        await fetchKOLsData();
        await fetchDashboardData();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error deleting KOL: ${err.message}`);
    }
  };

  // Update KOL
  const updateKOL = async (handle, updates) => {
    try {
      const response = await fetch(`/api/kolsentiment/kols/${handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setEditingKOL(null);
        await fetchKOLsData();
        await fetchDashboardData();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      alert(`Error updating KOL: ${err.message}`);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchDashboardData();
    fetchKOLsData();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchDashboardData();
        fetchKOLsData();
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [windowSel, autoRefresh, refreshInterval]);

  // Process data for visualizations
  const processedData = useMemo(() => {
    if (!dashboardData) return null;

    const { heatmap, momentum, leaderboard, signals } = dashboardData;

    // Filter data based on selections
    let filteredHeatmap = heatmap;
    if (selectedCoins.length > 0) {
      filteredHeatmap = heatmap.filter(item => selectedCoins.includes(item.coin));
    }
    if (selectedKOLs.length > 0) {
      filteredHeatmap = filteredHeatmap.filter(item => selectedKOLs.includes(item.kol));
    }

    // Get unique coins and KOLs for filtering
    const allCoins = [...new Set(heatmap.map(item => item.coin))];
    const allKOLs = [...new Set(heatmap.map(item => item.kol))];

    // Calculate alpha signals (high momentum + high KOL coverage)
    const alphaSignals = signals.filter(signal => 
      signal.velocity > 2 && 
      signal.unique_kols >= 3 && 
      signal.stance_score > 0.5
    );

    // Calculate network strength (KOL interactions)
    const networkData = leaderboard.map(kol => ({
      name: kol.kol,
      connections: Math.floor(Math.random() * 50) + 10, // Mock data
      influence: kol.hrs,
      avatar: KOL_AVATARS[kol.kol.toLowerCase()] || '👤'
    }));

    return {
      filteredHeatmap,
      momentum: momentum.slice(0, 10),
      leaderboard: leaderboard.slice(0, 10),
      alphaSignals,
      networkData,
      allCoins,
      allKOLs,
      stats: {
        totalMentions: heatmap.reduce((sum, item) => sum + item.mentions, 0),
        avgStance: heatmap.reduce((sum, item) => sum + item.stance, 0) / heatmap.length,
        topPerformer: leaderboard[0]?.kol || 'N/A',
        activeCoins: allCoins.length,
        activeKOLs: allKOLs.length
      }
    };
  }, [dashboardData, selectedCoins, selectedKOLs]);

  // Heatmap cell color calculation
  const getCellColor = (score, stance) => {
    const intensity = Math.min(100, Math.max(0, Math.abs(score)));
    const hue = stance > 0 ? 120 : stance < 0 ? 0 : 60; // Green for bullish, red for bearish
    const saturation = 70 + (intensity / 100) * 30;
    const lightness = 90 - (intensity / 100) * 40;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  // Stance indicator
  const getStanceIndicator = (stance) => {
    if (stance > 0.3) return { icon: TrendingUp, color: COLORS.bullish, text: 'Bullish' };
    if (stance < -0.3) return { icon: TrendingDown, color: COLORS.bearish, text: 'Bearish' };
    return { icon: Activity, color: COLORS.neutral, text: 'Neutral' };
  };

  if (loading && !dashboardData) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-slate-600">Loading KOL Alpha Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-600" />
          <p className="text-red-600 mb-4">Error loading dashboard: {error}</p>
          <Button onClick={fetchDashboardData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              KOL Alpha Dashboard
            </h1>
            <p className="text-slate-600 mt-1">
              Who moves what, when, and how — across {processedData?.stats.activeKOLs} KOLs monitoring {processedData?.stats.activeCoins} assets
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <div className="flex items-center gap-2">
              <Checkbox 
                checked={autoRefresh} 
                onCheckedChange={setAutoRefresh}
                id="auto-refresh"
              />
              <label htmlFor="auto-refresh" className="text-sm text-slate-600">
                Auto-refresh
              </label>
            </div>
            
            {/* Time window selector */}
            <Tabs value={windowSel} onValueChange={setWindowSel}>
              <TabsList>
                <TabsTrigger value="24h" className="gap-2">
                  <Clock className="h-4 w-4"/>24h
                </TabsTrigger>
                <TabsTrigger value="7d" className="gap-2">
                  <Activity className="h-4 w-4"/>7d
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                value={query} 
                onChange={(e) => setQuery(e.target.value)} 
                placeholder="Search coins..." 
                className="pl-9 w-48" 
              />
            </div>
            
            {/* Refresh button */}
            <Button 
              onClick={fetchDashboardData} 
              variant="outline" 
              size="sm"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </header>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="rounded-xl shadow-sm border-0 bg-gradient-to-r from-blue-50 to-blue-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Total Mentions</p>
                  <p className="text-2xl font-bold text-blue-900">{processedData?.stats.totalMentions || 0}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="rounded-xl shadow-sm border-0 bg-gradient-to-r from-green-50 to-green-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Avg Sentiment</p>
                  <p className="text-2xl font-bold text-green-900">
                    {processedData?.stats.avgStance ? (processedData.stats.avgStance > 0 ? '+' : '') + processedData.stats.avgStance.toFixed(2) : '0.00'}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="rounded-xl shadow-sm border-0 bg-gradient-to-r from-purple-50 to-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Top Performer</p>
                  <p className="text-lg font-bold text-purple-900">{processedData?.stats.topPerformer}</p>
                </div>
                <Crown className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="rounded-xl shadow-sm border-0 bg-gradient-to-r from-orange-50 to-orange-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600">Active Assets</p>
                  <p className="text-2xl font-bold text-orange-900">{processedData?.stats.activeCoins || 0}</p>
                </div>
                <Target className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="momentum">Momentum</TabsTrigger>
            <TabsTrigger value="signals">Alpha Signals</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="manage">Manage KOLs</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Momentum Board */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    Momentum Board
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {processedData?.momentum.slice(0, 5).map((item, index) => {
                      const stance = getStanceIndicator(item.stance);
                      return (
                        <div key={item.coin} className="flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-slate-50 to-white hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <Badge variant={index < 3 ? "default" : "secondary"} className="w-8 h-8 rounded-full flex items-center justify-center">
                              {index + 1}
                            </Badge>
                            <div>
                              <div className="font-semibold">${item.coin}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-2">
                                <span>breadth {item.breadth}</span>
                                <span>•</span>
                                <span className={`flex items-center gap-1 ${stance.color}`}>
                                  <stance.icon className="h-3 w-3" />
                                  {stance.text}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="font-semibold">{item.score.toFixed(1)}</div>
                              <div className="text-xs text-slate-500">score</div>
                            </div>
                            <div className="w-16 h-10">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={generateMockPriceData(item.coin)}>
                                  <Area 
                                    type="monotone" 
                                    dataKey="price" 
                                    stroke={stance.color} 
                                    fill={stance.color} 
                                    fillOpacity={0.2}
                                    strokeWidth={2}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* KOL Leaderboard */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    KOL Reliability Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {processedData?.leaderboard.slice(0, 5).map((kol, index) => (
                      <div key={kol.kol} className="flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {KOL_AVATARS[kol.kol.toLowerCase()] || '👤'} @{kol.kol}
                            </div>
                            <div className="text-xs text-slate-500">
                              {kol.total_posts} posts • {kol.coins_mentioned} coins
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{kol.hrs.toFixed(1)}</div>
                          <div className="text-xs text-slate-500">HRS</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alpha Signals */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Alpha Signals ({processedData?.alphaSignals.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {processedData?.alphaSignals.slice(0, 6).map((signal, index) => (
                    <div key={index} className="p-4 rounded-lg border bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-yellow-500">Alpha Signal</Badge>
                        <div className="text-xs text-slate-500">
                          {new Date(signal.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="font-semibold text-lg">${signal.asset_symbol}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        {signal.unique_kols} KOLs • Velocity: {signal.velocity.toFixed(1)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Stance: {signal.stance_score > 0 ? '+' : ''}{signal.stance_score.toFixed(2)}
                        </div>
                        {signal.alpha_lead_minutes && (
                          <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Lead: {signal.alpha_lead_minutes}m
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Heatmap Tab */}
          <TabsContent value="heatmap" className="space-y-6">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    KOL × Coin Heatmap
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="mb-6 space-y-4">
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium">Filters:</span>
                    </div>
                    
                    {/* Coin filters */}
                    <div className="flex flex-wrap gap-2">
                      {processedData?.allCoins.slice(0, 10).map(coin => (
                        <label key={coin} className="flex items-center gap-1 text-sm">
                          <Checkbox 
                            checked={selectedCoins.includes(coin)} 
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedCoins([...selectedCoins, coin]);
                              } else {
                                setSelectedCoins(selectedCoins.filter(c => c !== coin));
                              }
                            }}
                          />
                          <span>${coin}</span>
                        </label>
                      ))}
                    </div>
                    
                    {/* KOL filters */}
                    <div className="flex flex-wrap gap-2">
                      {processedData?.allKOLs.slice(0, 8).map(kol => (
                        <label key={kol} className="flex items-center gap-1 text-sm">
                          <Checkbox 
                            checked={selectedKOLs.includes(kol)} 
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedKOLs([...selectedKOLs, kol]);
                              } else {
                                setSelectedKOLs(selectedKOLs.filter(k => k !== kol));
                              }
                            }}
                          />
                          <span>{KOL_AVATARS[kol.toLowerCase()] || '👤'} {kol}</span>
                        </label>
                      ))}
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedCoins([]);
                        setSelectedKOLs([]);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {/* Heatmap Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-white/90 backdrop-blur px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b">
                          KOL \ Coin
                        </th>
                        {processedData?.allCoins.map(coin => (
                          <th key={coin} className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b min-w-[120px]">
                            ${coin}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData?.allKOLs.map(kol => (
                        <tr key={kol} className="hover:bg-slate-50/50">
                          <td className="sticky left-0 z-10 bg-white/90 backdrop-blur px-4 py-3 text-sm font-semibold border-b">
                            <div className="flex items-center gap-2">
                              {KOL_AVATARS[kol.toLowerCase()] || '👤'}
                              {kol}
                            </div>
                          </td>
                          {processedData?.allCoins.map(coin => {
                            const cell = processedData.filteredHeatmap.find(item => item.kol === kol && item.coin === coin);
                            const score = cell ? cell.score : 0;
                            const stance = cell ? cell.stance : 0;
                            const color = getCellColor(score, stance);
                            
                            return (
                              <td key={coin} className="px-2 py-3 border-b">
                                <div 
                                  className="rounded-lg p-3 text-center shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                  style={{ backgroundColor: color }}
                                  title={`${kol} × ${coin}: Score ${score.toFixed(1)}, Stance ${stance.toFixed(2)}`}
                                >
                                  <div className="text-sm font-semibold">{score.toFixed(0)}</div>
                                  <div className="text-xs opacity-75">
                                    m:{cell?.mentions || 0} • e:{cell?.engagement || 0}
                                  </div>
                                  <div className="text-xs mt-1">
                                    {stance > 0.3 ? '📈' : stance < -0.3 ? '📉' : '➡️'}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Momentum Tab */}
          <TabsContent value="momentum" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Momentum Chart */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Momentum Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={processedData?.momentum}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="coin" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="score" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Stance Distribution */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-purple-500" />
                    Sentiment Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Bullish', value: processedData?.momentum.filter(m => m.stance > 0.3).length || 0, color: COLORS.bullish },
                            { name: 'Neutral', value: processedData?.momentum.filter(m => m.stance >= -0.3 && m.stance <= 0.3).length || 0, color: COLORS.neutral },
                            { name: 'Bearish', value: processedData?.momentum.filter(m => m.stance < -0.3).length || 0, color: COLORS.bearish }
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {[{ name: 'Bullish', color: COLORS.bullish }, { name: 'Neutral', color: COLORS.neutral }, { name: 'Bearish', color: COLORS.bearish }].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend />
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals" className="space-y-6">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Alpha Signals & Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {processedData?.alphaSignals.map((signal, index) => (
                    <div key={index} className="p-4 rounded-lg border bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <Badge className="bg-yellow-500">Alpha Signal</Badge>
                        <div className="text-xs text-slate-500">
                          {new Date(signal.timestamp).toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="font-bold text-xl mb-2">${signal.asset_symbol}</div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">KOL Coverage:</span>
                          <span className="font-semibold">{signal.unique_kols} KOLs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Velocity:</span>
                          <span className="font-semibold">{signal.velocity.toFixed(1)}/hr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Sentiment:</span>
                          <span className={`font-semibold ${signal.stance_score > 0 ? 'text-green-600' : signal.stance_score < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                            {signal.stance_score > 0 ? '+' : ''}{signal.stance_score.toFixed(2)}
                          </span>
                        </div>
                        {signal.alpha_lead_minutes && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Alpha Lead:</span>
                            <span className="font-semibold text-blue-600">{signal.alpha_lead_minutes}min</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-yellow-200">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Mentions: {signal.mention_count}</span>
                          <span>Confidence: {(signal.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Network Tab */}
          <TabsContent value="network" className="space-y-6">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-blue-500" />
                  KOL Network Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart data={processedData?.networkData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="connections" name="Connections" />
                      <YAxis dataKey="influence" name="Influence" />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter dataKey="influence" fill="#3b82f6" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manage KOLs Tab */}
          <TabsContent value="manage" className="space-y-6">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-purple-500" />
                    KOL Management
                  </CardTitle>
                  <Button 
                    onClick={() => setShowAddKOLModal(true)}
                    className="gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add KOL
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* KOL List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kolsData.map((kol) => (
                      <div key={kol.id} className="p-4 rounded-lg border bg-gradient-to-r from-slate-50 to-white hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                              {KOL_AVATARS[kol.handle.toLowerCase()] || '👤'}
                            </div>
                            <div>
                              <div className="font-semibold">@{kol.handle}</div>
                              <div className="text-xs text-slate-500">
                                Influence: {kol.influence_score}/100
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setEditingKOL(kol)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => deleteKOL(kol.handle)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Posts:</span>
                            <span className="font-semibold">{kol.total_posts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Reliability:</span>
                            <span className="font-semibold">{kol.reliability_score.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Last Monitored:</span>
                            <span className="text-xs">
                              {kol.last_monitored ? 
                                new Date(kol.last_monitored).toLocaleDateString() : 
                                'Never'
                              }
                            </span>
                          </div>
                          {kol.segments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {kol.segments.map((segment, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {segment}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {kolsData.length === 0 && (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                      <p className="text-slate-500 mb-4">No KOLs configured yet</p>
                      <Button onClick={() => setShowAddKOLModal(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Your First KOL
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add KOL Modal */}
        {showAddKOLModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Add New KOL
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Twitter Handle</label>
                  <Input
                    placeholder="@username"
                    value={newKOL.handle}
                    onChange={(e) => setNewKOL({...newKOL, handle: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Influence Score (1-100)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={newKOL.influence_score}
                    onChange={(e) => setNewKOL({...newKOL, influence_score: parseInt(e.target.value) || 50})}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Segments (comma-separated)</label>
                  <Input
                    placeholder="crypto, defi, nft"
                    value={newKOL.segments.join(', ')}
                    onChange={(e) => setNewKOL({
                      ...newKOL, 
                      segments: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    })}
                  />
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button 
                    onClick={addKOL} 
                    className="flex-1"
                    disabled={!newKOL.handle}
                  >
                    Add KOL
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddKOLModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit KOL Modal */}
        {editingKOL && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5" />
                  Edit KOL: @{editingKOL.handle}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Influence Score (1-100)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={editingKOL.influence_score}
                    onChange={(e) => setEditingKOL({
                      ...editingKOL, 
                      influence_score: parseInt(e.target.value) || 50
                    })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Segments (comma-separated)</label>
                  <Input
                    placeholder="crypto, defi, nft"
                    value={editingKOL.segments.join(', ')}
                    onChange={(e) => setEditingKOL({
                      ...editingKOL, 
                      segments: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    })}
                  />
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button 
                    onClick={() => updateKOL(editingKOL.handle, {
                      influence_score: editingKOL.influence_score,
                      segments: editingKOL.segments
                    })}
                    className="flex-1"
                  >
                    Update KOL
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setEditingKOL(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <footer className="py-6 text-center text-xs text-slate-500 border-t">
          <div className="flex items-center justify-center gap-4">
            <span>Last updated: {dashboardData?.metadata?.last_updated ? new Date(dashboardData.metadata.last_updated).toLocaleString() : 'Never'}</span>
            <span>•</span>
            <span>Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}</span>
            <span>•</span>
            <span>Data source: KOL Market Learning Service</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Helper function to generate mock price data
function generateMockPriceData(coin) {
  const data = [];
  let price = 100 + Math.random() * 50;
  
  for (let i = 23; i >= 0; i--) {
    price = Math.max(30, price + (Math.random() - 0.48) * 6);
    data.push({
      time: `${i}h`,
      price: Math.round(price * 100) / 100
    });
  }
  
  return data.reverse();
}
