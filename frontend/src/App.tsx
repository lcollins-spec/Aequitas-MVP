import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import FundReturns from './pages/FundReturns';
import Underwriting from './pages/Underwriting';
import MapPage from './pages/MapPage';
import GPPortfolio from './pages/GPPortfolio';
import Regulations from './pages/Regulations';
import Grants from './pages/Grants';

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
            <Route path="/map" element={<MapPage />} />
            <Route path="/gp-portfolio" element={<GPPortfolio />} />
            <Route path="/regulations" element={<Regulations />} />
            <Route path="/grants" element={<Grants />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
