import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SupplierList from './pages/SupplierList'
import BuyerList from './pages/BuyerList'
import ProductList from './pages/ProductList'
import PartList from './pages/PartList'
import Inventory from './pages/Inventory'
import SupplierOrders from './pages/SupplierOrders'
import BuyerOrders from './pages/BuyerOrders'
import ProductOrders from './pages/ProductOrders'
import OrderList from './pages/OrderList'
import OrderDetail from './pages/OrderDetail'
import Finance from './pages/Finance'
import RecycleBin from './pages/RecycleBin'
import SettingsPage from './pages/Settings'
import Login from './pages/Login'
import { useAuth } from './auth'

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/suppliers" element={<SupplierList />} />
        <Route path="/suppliers/:id/orders" element={<SupplierOrders />} />
        <Route path="/buyers" element={<BuyerList />} />
        <Route path="/buyers/:id/orders" element={<BuyerOrders />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/parts" element={<PartList />} />
        <Route path="/inventory/products" element={<Inventory target="products" />} />
        <Route path="/inventory/parts" element={<Inventory target="parts" />} />
        <Route path="/inventory/products/:id/parts" element={<Inventory target="productParts" />} />
        <Route path="/products/:id/orders" element={<ProductOrders />} />
        <Route path="/orders" element={<OrderList />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/recycle" element={<RecycleBin />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}
