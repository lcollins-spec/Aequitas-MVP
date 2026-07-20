import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import * as sourcingApi from '../services/sourcingApi';
import type { MarketEntry, SourcingProperty } from '../services/sourcingApi';
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

  const handleOpen = async () => {
    onBeforeOpen?.();
    setOpen(true);
    const [m, g] = await Promise.all([
      sourcingApi.fetchMarkets().catch(() => []),
      gpApi.getAllGPs().catch(() => []),
    ]);
    setMarkets(m);
    setGps(g);
  };

  const handleSave = async (p: SourcingProperty) => {
    await sourcingApi.createProperty(p);
    setOpen(false);
    navigate(`/sourcing?uploadedPropertyId=${p.id}`);
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
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default GlobalUploadDealButton;
