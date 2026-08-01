import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPlus, FaTrash, FaToggleOn, FaToggleOff, FaSearch } from 'react-icons/fa';
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
    <div className="card">
      <h3 className="mb-4 font-bold text-textDark">{title}</h3>
      <div className="mb-3 relative">
        <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`بحث في ${title}...`}
          className="input-field pr-9 text-sm"
        />
      </div>
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="اسم جديد..."
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || submitting}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          <FaPlus />
        </button>
      </div>
      <div className="space-y-2">
        {filteredItems.length === 0 && (
          <p className="py-4 text-center text-sm text-textGray">
            {query.trim() ? 'لا توجد نتائج مطابقة' : 'لا توجد عناصر بعد'}
          </p>
        )}
        {filteredItems.map((item) => (
          <div key={item._id} className="flex items-center justify-between rounded-lg border border-borderGray px-3 py-2">
            <span className={item.isActive ? 'text-textDark' : 'text-textGray line-through'}>{item.name}</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onToggle(item)} className="text-primary" title="تفعيل/تعطيل">
                {item.isActive ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
              </button>
              <button type="button" onClick={() => onDelete(item)} className="text-emergency" title="حذف">
                <FaTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminReferenceDataPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [cities, setCities] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([adminService.getCities(), adminService.getServiceTypes()])
      .then(([c, s]) => {
        setCities(c.data.data || []);
        setServiceTypes(s.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(load, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">المدن والتخصصات</h1>
        <p className="text-sm text-textGray">
          إدارة قوائم المدن والتخصصات المتاحة في نماذج التسجيل — بدل القيم الثابتة في الكود
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReferenceList
          key={`cities-${initialQuery}`}
          title="المدن"
          items={cities}
          initialQuery={initialQuery}
          onAdd={async (name) => {
            await adminService.createCity({ name });
            load();
          }}
          onToggle={async (item) => {
            await adminService.updateCity(item._id, { isActive: !item.isActive });
            load();
          }}
          onDelete={async (item) => {
            await adminService.deleteCity(item._id);
            load();
          }}
        />
        <ReferenceList
          key={`services-${initialQuery}`}
          title="التخصصات (المهن)"
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
