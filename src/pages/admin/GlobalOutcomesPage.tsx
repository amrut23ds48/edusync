import { useState, useEffect, type FormEvent } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  Award, 
  Plus, 
  Edit2, 
  Archive, 
  RotateCcw, 
  Loader2, 
  X, 
  CheckCircle2, 
  Sprout, 
  Building2
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { OFFICIAL_GLOBAL_OUTCOMES } from '../../services/seedService';
import type { GlobalOutcome, Department, OutcomeType } from '../../types';

export default function GlobalOutcomesPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [outcomes, setOutcomes] = useState<GlobalOutcome[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PO' | 'PEO' | 'PSO'>('ALL');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState<GlobalOutcome | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('PO');
  const [code, setCode] = useState('PO 01');
  const [shortLabel, setShortLabel] = useState('PO1');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [description, setDescription] = useState('');

  // 1. Fetch active departments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'departments'), (snap) => {
      const list: Department[] = [];
      snap.forEach((d) => {
        const data = d.data() as Department;
        if (data.status === 'active') list.push(data);
      });
      list.sort((a, b) => a.code.localeCompare(b.code));
      setDepartments(list);

      if (list.length > 0) {
        setSelectedDeptId((prev) => {
          if (prev && list.some((d) => d.id === prev)) return prev;
          const ds = list.find((d) => d.code.includes('DS') || d.name.toLowerCase().includes('data science'));
          return ds ? ds.id : list[0].id;
        });
      }
    });
    return () => unsub();
  }, []);

  // 2. Fetch outcomes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'global_outcomes'), (snap) => {
      const list: GlobalOutcome[] = [];
      snap.forEach((d) => {
        list.push(d.data() as GlobalOutcome);
      });
      setOutcomes(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  // Filter outcomes for the selected department
  // Note: Outcomes with no departmentId or matching selectedDeptId are shown
  const deptOutcomes = outcomes.filter((o) => {
    if (!selectedDeptId) return true;
    return o.departmentId === selectedDeptId || (!o.departmentId && selectedDept?.code === 'CSE-DS');
  });

  const filtered = deptOutcomes.filter((o) => {
    if (typeFilter === 'ALL') return true;
    return o.type === typeFilter;
  });

  filtered.sort((a, b) => {
    if (a.type !== b.type) {
      const order = { PO: 1, PEO: 2, PSO: 3 };
      return order[a.type] - order[b.type];
    }
    return a.sortOrder - b.sortOrder;
  });

  // Open Create Modal
  function openCreateModal() {
    setEditingOutcome(null);
    setOutcomeType('PO');
    setCode('PO 01');
    setShortLabel('PO1');
    setSortOrder(deptOutcomes.length + 1);
    setDescription('');
    setShowModal(true);
  }

  // Open Edit Modal
  function openEditModal(outcome: GlobalOutcome) {
    setEditingOutcome(outcome);
    setOutcomeType(outcome.type);
    setCode(outcome.code);
    setShortLabel(outcome.shortLabel);
    setSortOrder(outcome.sortOrder);
    setDescription(outcome.description);
    setShowModal(true);
  }

  // Save Outcome (Create or Update)
  async function handleSaveOutcome(e: FormEvent) {
    e.preventDefault();
    if (!user || !selectedDeptId) {
      toast.error('Please choose a department.');
      return;
    }

    setSubmitting(true);
    try {
      const docId = editingOutcome
        ? editingOutcome.id
        : `${selectedDeptId}_${shortLabel.trim().toUpperCase()}`;

      const data: Partial<GlobalOutcome> = {
        id: docId,
        departmentId: selectedDeptId,
        type: outcomeType,
        code: code.trim(),
        shortLabel: shortLabel.trim().toUpperCase(),
        sortOrder: Number(sortOrder),
        description: description.trim(),
        status: editingOutcome ? editingOutcome.status : 'active',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      await setDoc(doc(db, 'global_outcomes', docId), data, { merge: true });
      toast.success(editingOutcome ? 'Outcome updated.' : 'Outcome created.');
      setShowModal(false);
      setEditingOutcome(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save outcome.');
    } finally {
      setSubmitting(false);
    }
  }

  // Seed default 19 outcomes for the selected department
  async function handleSeedForDepartment() {
    if (!user || !selectedDeptId) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      for (const item of OFFICIAL_GLOBAL_OUTCOMES) {
        // Scope each outcome to the selected department
        const docId = `${selectedDeptId}_${item.id}`;
        const ref = doc(db, 'global_outcomes', docId);
        batch.set(
          ref,
          {
            ...item,
            id: docId,
            departmentId: selectedDeptId,
            status: 'active',
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
      }
      await batch.commit();
      toast.success(`Seeded 19 official outcomes for ${selectedDept?.code}.`);
    } catch (err: any) {
      console.error('[EduSync] Seeding error:', err);
      toast.error('Failed to seed outcomes.');
    } finally {
      setSeeding(false);
    }
  }

  // Toggle archive status
  async function toggleStatus(outcome: GlobalOutcome) {
    const newStatus = outcome.status === 'active' ? 'archived' : 'active';
    try {
      await updateDoc(doc(db, 'global_outcomes', outcome.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Outcome marked as ${newStatus}.`);
    } catch {
      toast.error('Failed to update status.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Global Outcomes Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure Program Outcomes (POs), Educational Objectives (PEOs), and Specific Outcomes (PSOs) per department.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!selectedDeptId}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            <span>Add Outcome</span>
          </button>
        </div>
      </div>

      {/* Department Selector & Filters */}
      <div className="glass-card p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Department Dropdown */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
            <Building2 className="h-4 w-4 text-brand-600" />
            <span>Department:</span>
          </div>
          {departments.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              No departments yet. Add a department in the Departments tab first.
            </p>
          ) : (
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="input-field !py-2 !text-sm font-semibold text-slate-900 w-full md:w-80"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
          {(['ALL', 'PO', 'PEO', 'PSO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                typeFilter === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t === 'ALL' ? 'All Types' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Seed Helper for Data Science or New Departments */}
      {selectedDept && (
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/50 via-white to-violet-50/50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Official Outcomes Seeder ({selectedDept.code})
              </p>
              <p className="text-xs text-slate-500">
                Populate 12 POs, 5 PEOs, and 2 PSOs verbatim from <code>project-outcome.pdf</code> for this department.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSeedForDepartment}
            disabled={seeding}
            className="btn-secondary !py-1.5 !px-3 !text-xs shrink-0"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5 text-brand-600" />}
            <span>Seed 19 Default Outcomes</span>
          </button>
        </div>
      )}

      {/* Outcomes Roster Table */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading outcomes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Award className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700">No outcomes configured</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {departments.length === 0
              ? 'Please add a department first before creating outcomes.'
              : 'Add custom Program Outcomes or click "Seed 19 Default Outcomes" above.'}
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Code / Label</th>
                <th className="py-3.5 px-6">Type</th>
                <th className="py-3.5 px-6">Outcome Description</th>
                <th className="py-3.5 px-6">Order</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const isActive = item.status === 'active';
                const typeColors = {
                  PO: 'bg-blue-50 text-blue-700 border-blue-200',
                  PEO: 'bg-purple-50 text-purple-700 border-purple-200',
                  PSO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                };

                return (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-900 flex items-center gap-2">
                      <span className="text-brand-700">{item.code}</span>
                      <span className="text-slate-400 text-xs font-normal">({item.shortLabel})</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`badge border ${typeColors[item.type]}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-700 text-xs leading-relaxed max-w-xl">
                      {item.description}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-slate-400">
                      #{item.sortOrder}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`badge ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(item)}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        {isActive ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create / Edit Outcome */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-lg w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-brand-600" />
                <span>{editingOutcome ? 'Edit Global Outcome' : 'Create Global Outcome'}</span>
              </h2>
              <button type="button" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveOutcome} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Type</label>
                  <select
                    value={outcomeType}
                    onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
                    className="input-field"
                  >
                    <option value="PO">Program Outcome (PO)</option>
                    <option value="PEO">Educational Objective (PEO)</option>
                    <option value="PSO">Specific Outcome (PSO)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PO 01, PSO 01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input-field uppercase font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Short Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PO1, PSO1"
                    value={shortLabel}
                    onChange={(e) => setShortLabel(e.target.value)}
                    className="input-field uppercase font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Text / Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter the official accreditation outcome statement..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Outcome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
