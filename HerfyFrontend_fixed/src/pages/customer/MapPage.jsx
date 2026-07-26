import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaList } from 'react-icons/fa';
import TomTomMap from '../../components/Map/TomTomMap';

export default function MapPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-borderGray px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-primary">
            <FaArrowRight size={18} />
          </button>
          <h1 className="font-bold text-primary">الحرفيون القريبون منك</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/customer/home')}
          className="flex items-center gap-2 rounded-lg border border-borderGray px-3 py-1.5 text-sm text-textGray"
        >
          <FaList size={12} /> عرض القائمة
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        <TomTomMap />
      </div>
    </div>
  );
}
