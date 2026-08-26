import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FaPlus, FaTrash, FaToggleOn, FaToggleOff, FaSearch, FaArrowRight, FaTools } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function ReferenceList({ title, items, onAdd, onToggle, onDelete, initialQuery }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState(initialQuery || '');

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(name.trim());
      setName('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = query.trim()
    ? items.filter((item) => item.name?.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-neutral">
        <h2 className="font-bold text-textDark text-sm">{title}</h2>
        <span className="text-xs text-textGray font-semibold bg-neutral px-2.5 py-0.5 rounded-full">{items.length} مهنة مسجلة</span>
      </div>

      <div className="relative">
        <FaSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`بحث في ${title}...`}
          className="input-field pr-9 text-xs py-2"
        />
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="إضافة تخصص جديد..."
          className="input-field flex-1 text-xs"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || submitting}
          className="btn-primary text-xs py-2 px-4 shadow-sm disabled:opacity-50"
        >
          <FaPlus size={11} /> إضافة
        </button>
      </div>

      <div className="space-y-2 pt-1">
        {filteredItems.length === 0 && (
          <p className="py-6 text-center text-xs text-textGray">
            {query.trim() ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد تخصصات مضافة بعد'}
          </p>
        )}
        {filteredItems.map((item) => (
          <div key={item._id} className="flex items-center justify-between rounded-xl border border-neutral bg-neutral/30 px-3.5 py-2.5 transition hover:bg-neutral/60">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${item.isActive ? 'bg-tertiary' : 'bg-borderGray'}`} />
              <span className={`text-xs font-bold ${item.isActive ? 'text-textDark' : 'text-textGray line-through'}`}>{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onToggle(item)} className="text-primary hover:opacity-80 transition" title="تفعيل/تعطيل">
                {item.isActive ? <FaToggleOn size={22} className="text-tertiary" /> : <FaToggleOff size={22} className="text-textGray" />}
              </button>
              <button type="button" onClick={() => onDelete(item)} className="text-textGray hover:text-emergency transition p-1" title="حذف">
                <FaTrash size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminReferenceDataPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminService.getServiceTypes()
      .then((s) => {
        setServiceTypes(s.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(load, []);

  if (loading) return <LoadingSpinner text="جاري تحميل التخصصات..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">إدارة التخصصات والمهن</h1>
          <p className="text-xs text-textGray mt-0.5">
            التحكم في قائمة المهن المتاحة للحرفيين وتفعيلها أو تعطيلها ديناميكياً
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <ReferenceList
          key={`services-${initialQuery}`}
          title="قائمة التخصصات والمهن"
          items={serviceTypes}
          initialQuery={initialQuery}
          onAdd={async (name) => {
            await adminService.createServiceType({ name });
            load();
          }}
          onToggle={async (item) => {
            await adminService.updateServiceType(item._id, { isActive: !item.isActive });
            load();
          }}
          onDelete={async (item) => {
            await adminService.deleteServiceType(item._id);
            load();
          }}
        />
      </div>
    </div>
  );
}
