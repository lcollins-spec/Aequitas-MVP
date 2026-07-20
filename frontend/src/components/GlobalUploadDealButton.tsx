import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import * as sourcingApi from '../services/sourcingApi';
import type { MarketEntry, SourcingProperty, SourcingOperator, SourcingBroker } from '../services/sourcingApi';
import { gpApi } from '../services/gpApi';
import type { GP } from '../types/gp';
import UploadDealModal from './UploadDealModal';

interface GlobalUploadDealButtonProps {
  onBeforeOpen?: () => void;
}

const GlobalUploadDealButton = ({ onBeforeOpen }: GlobalUploadDealButtonProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [markets, setMarkets] = useState<MarketEntry[]>([]);
  const [gps, setGps] = useState<GP[]>([]);
  const [operators, setOperators] = useState<SourcingOperator[]>([]);
  const [brokers, setBrokers] = useState<SourcingBroker[]>([]);

  const handleOpen = async () => {
    onBeforeOpen?.();
    setOpen(true);
    const [m, g, o, b] = await Promise.all([
      sourcingApi.fetchMarkets().catch(() => []),
      gpApi.getAllGPs().catch(() => []),
      sourcingApi.fetchOperators().catch(() => []),
      sourcingApi.fetchBrokers().catch(() => []),
    ]);
    setMarkets(m);
    setGps(g);
    setOperators(o);
    setBrokers(b);
  };

  const handleSave = async (p: SourcingProperty) => {
    await sourcingApi.createProperty(p);
    setOpen(false);
    const marketParam = p.market ? `&uploadedMarket=${encodeURIComponent(p.market)}` : '';
    navigate(`/sourcing?uploadedPropertyId=${p.id}${marketParam}`);
  };

  return (
    <>
      <div className="px-4 pb-3">
        <button
          onClick={handleOpen}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <UploadCloud size={18} />
          Upload Deal
        </button>
      </div>
      {open && (
        <UploadDealModal
          mode="om"
          market=""
          markets={markets}
          gps={gps}
          operators={operators}
          brokers={brokers}
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default GlobalUploadDealButton;
