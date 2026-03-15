import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import FundReturns from './pages/FundReturns';
import Underwriting from './pages/Underwriting';
import MapPage from './pages/MapPage';
import Sourcing from './pages/Sourcing';
import GPPortfolio from './pages/GPPortfolio';
import Regulations from './pages/Regulations';
import MarketAnalysis from './pages/MarketAnalysis';
import DealExecution from './pages/DealExecution';
import DealExecutionIndex from './pages/DealExecutionIndex';
import AssetManagement from './pages/AssetManagement';

function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 lg:ml-60 w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fund-returns" element={<FundReturns />} />
            <Route path="/underwriting" element={<Underwriting />} />
            <Route path="/sourcing" element={<Sourcing />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/market-analysis" element={<MarketAnalysis />} />
            <Route path="/gp-portfolio" element={<GPPortfolio />} />
            <Route path="/regulations" element={<Regulations />} />
            <Route path="/deal-execution" element={<DealExecutionIndex />} />
            <Route path="/deal-execution/:dealId" element={<DealExecution />} />
            <Route path="/asset-management" element={<AssetManagement />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
