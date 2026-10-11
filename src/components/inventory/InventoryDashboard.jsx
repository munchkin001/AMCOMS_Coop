import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Factory, Package, PackageCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { useTimeOfDayGreeting } from '../../hooks/useTimeOfDayGreeting';
import { toDateString } from '../../lib/dashboardAccounting';
import DashboardMetricCard from '../common/DashboardMetricCard';

const InventoryDashboard = () => {
  const navigate = useNavigate();
  const greeting = useTimeOfDayGreeting();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    todayProduction: 0,
    todayStockIn: 0,
    todayStockOut: 0,
    products: [],
    lowStockProducts: [],
    recentActivities: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = toDateString(new Date());

      // Fetch total active products
      const { count: totalProducts, error: productCountError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      if (productCountError) throw productCountError;

      // Fetch products with their inventory
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(category_name),
          stock_inventory(quantity_on_hand, quantity_available)
        `)
        .eq('is_active', true);
      if (productsError) throw productsError;

      // Calculate low stock and out of stock
      const lowStockProducts = productsData?.filter(p => {
        const qty = p.stock_inventory?.[0]?.quantity_on_hand || 0;
        return qty > 0 && qty <= p.reorder_level;
      }) || [];

      const outOfStockProducts = productsData?.filter(p => {
        const qty = p.stock_inventory?.[0]?.quantity_on_hand || 0;
        return qty === 0;
      }) || [];

      // Fetch today's production
      const { data: productionData, error: productionError } = await supabase
        .from('production_records')
        .select('quantity_produced')
        .eq('production_date', today);
      if (productionError) throw productionError;

      const todayProduction = productionData?.reduce((sum, p) => sum + (p.quantity_produced || 0), 0) || 0;

      // Fetch today's stock movements
      const { data: stockInData, error: stockInError } = await supabase
        .from('stock_movements')
        .select('quantity')
        .eq('movement_date', today)
        .in('movement_type', ['purchase', 'production', 'return']);
      if (stockInError) throw stockInError;

      const todayStockIn = stockInData?.reduce((sum, s) => sum + (s.quantity || 0), 0) || 0;

      const { data: stockOutData, error: stockOutError } = await supabase
        .from('stock_movements')
        .select('quantity')
        .eq('movement_date', today)
        .in('movement_type', ['sale', 'transfer', 'waste']);
      if (stockOutError) throw stockOutError;

      const todayStockOut = stockOutData?.reduce((sum, s) => sum + Math.abs(s.quantity || 0), 0) || 0;

      // Fetch recent stock movements for activities
      const { data: recentMovements, error: movementsError } = await supabase
        .from('stock_movements')
        .select(`
          movement_date,
          movement_type,
          quantity,
          created_at,
          products(product_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);
      if (movementsError) throw movementsError;

      const recentActivities = recentMovements?.map(m => {
        const activityTypeMap = {
          purchase: 'Stock In',
          production: 'Production',
          sale: 'Stock Out',
          transfer: 'Transfer Out',
          return: 'Return In',
          waste: 'Waste/Loss',
          adjustment: 'Adjustment'
        };
        
        const activityType = m.movement_type === 'purchase' || m.movement_type === 'production' || m.movement_type === 'return' 
          ? 'in' 
          : m.movement_type === 'production' 
          ? 'production' 
          : 'out';

        const date = new Date(m.created_at);
        
        return {
          date: m.movement_date,
          time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          product: m.products?.product_name || 'Unknown Product',
          activity: activityTypeMap[m.movement_type] || m.movement_type,
          type: activityType,
          quantity: (m.movement_type === 'purchase' || m.movement_type === 'production' || m.movement_type === 'return' ? '+' : '-') + Math.abs(m.quantity)
        };
      }) || [];

      setDashboardData({
        totalProducts: totalProducts || 0,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        todayProduction,
        todayStockIn,
        todayStockOut,
        products: productsData || [],
        lowStockProducts,
        recentActivities
      });
      setError('');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(`Unable to load inventory data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useMultipleRealtimeSubscriptions(
    ['products', 'product_categories', 'stock_inventory', 'stock_movements', 'production_records']
      .map((table) => ({ table, onUpdate: fetchDashboardData })),
    []
  );

  const summaryCards = [
    { label: 'Total Products', value: loading ? '...' : dashboardData.totalProducts.toString(), detail: 'Active products', icon: Package, tone: 'blue' },
    { label: 'Low Stock', value: loading ? '...' : dashboardData.lowStockCount.toString(), detail: 'Needs attention', icon: AlertTriangle, tone: 'yellow' },
    { label: 'Out of Stock', value: loading ? '...' : dashboardData.outOfStockCount.toString(), detail: dashboardData.outOfStockCount === 0 ? 'No issues' : 'Action needed', icon: Boxes, tone: dashboardData.outOfStockCount > 0 ? 'red' : 'green' },
    { label: "Today's Production", value: loading ? '...' : `${dashboardData.todayProduction} units`, detail: 'Items produced', icon: Factory, tone: 'green' },
    { label: "Today's Stock In", value: loading ? '...' : dashboardData.todayStockIn.toString(), detail: 'Units received', icon: ArrowDownToLine, tone: 'emerald' },
    { label: "Today's Stock Out", value: loading ? '...' : dashboardData.todayStockOut.toString(), detail: 'Units sold/released', icon: ArrowUpFromLine, tone: 'red' }
  ];

  const recentActivities = dashboardData.recentActivities;

  const getStatusBadge = (status, color) => {
    const colors = {
      green: 'bg-green-100 text-green-800 border-green-200',
      amber: 'bg-amber-100 text-amber-800 border-amber-200',
      red: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[color] || colors.green;
  };

  const getActivityBadge = (type) => {
    const types = {
      production: 'bg-blue-100 text-blue-800',
      in: 'bg-green-100 text-green-800',
      out: 'bg-orange-100 text-orange-800',
      damaged: 'bg-red-100 text-red-800'
    };
    return types[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{greeting}, Inventory Staff</h2>
        <p className="text-gray-600 mt-1">Here's today's inventory status and activities</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} icon={card.icon} tone={card.tone} />
        ))}
      </div>

      {/* Alerts */}
      {!loading && dashboardData.lowStockCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-900">Low Stock Alert</h4>
              <p className="text-sm text-amber-800 mt-1">
                <strong>{dashboardData.lowStockCount} product(s)</strong> are running low on stock. Check inventory status below.
              </p>
            </div>
          </div>
        </div>
      )}
      {!loading && dashboardData.outOfStockCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900">Out of Stock Alert</h4>
              <p className="text-sm text-red-800 mt-1">
                <strong>{dashboardData.outOfStockCount} product(s)</strong> are out of stock. Immediate restocking needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Status */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Inventory Status</h3>
        </div>
        <div className="p-6">
          {loading || dashboardData.products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-sm">No products in inventory</p>
              <p className="text-xs mt-1">Add products to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dashboardData.products.map((item, idx) => {
                const stock = item.stock_inventory?.[0]?.quantity_on_hand || 0;
                const status = stock === 0 ? 'Out of Stock' : stock <= item.reorder_level ? 'Low' : 'Good';
                const statusColor = stock === 0 ? 'red' : stock <= item.reorder_level ? 'amber' : 'green';
                
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <PackageCheck aria-hidden="true" className="size-7 shrink-0 text-slate-500" />
                        <div>
                          <h4 className="font-semibold text-gray-900">{item.product_name}</h4>
                          <p className="text-xs text-gray-500">Min: {item.reorder_level} {item.unit_of_measure}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(status, statusColor)}`}>
                        {status}
                      </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600">Current Stock</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stock} {item.unit_of_measure}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activities</h3>
            <button 
              onClick={() => navigate('/staff/sales')}
              className="text-sm text-orange-600 hover:text-orange-700 font-medium cursor-pointer"
            >
              View All →
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading || recentActivities.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No recent activities</p>
              <p className="text-xs mt-1">Stock movements will appear here</p>
            </div>
          ) : (
            <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date & Time</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Product</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Activity</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {recentActivities.map((activity, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">
                    {activity.date}
                    <span className="text-gray-500 ml-2">{activity.time}</span>
                  </td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{activity.product}</td>
                  <td className="py-3 px-6">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getActivityBadge(activity.type)}`}>
                      {activity.activity}
                    </span>
                  </td>
                  <td className={`py-3 px-6 text-sm text-right font-semibold ${
                    activity.quantity.startsWith('+') ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {activity.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => navigate('/staff/products')} className="flex flex-col items-center justify-center p-4 border-2 border-orange-300 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
            <svg className="w-8 h-8 text-orange-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Add Product</span>
          </button>
          <button onClick={() => navigate('/staff/stock')} className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Stock In</span>
          </button>
          <button onClick={() => navigate('/staff/stock')} className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-red-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Stock Out</span>
          </button>
          <button onClick={() => navigate('/staff/production')} className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Record Production</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;
