import { useState, useEffect, type FormEvent } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  Building2, 
  Plus, 
  Search, 
  Edit2, 
  Archive, 
  RotateCcw, 
  Loader2, 
  X,
  CheckCircle2
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Department } from '../../types';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Real-time listener for departments
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'departments'),
      (snapshot) => {
        const list: Department[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Department);
        });
        // Sort active first, then alphabetical by code
        list.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          return a.code.localeCompare(b.code);
        });
        setDepartments(list);
        setLoading(false);
      },
      (error) => {
        console.error('[EduSync] Error fetching departments:', error);
        toast.error('Failed to load departments.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  function openCreateModal() {
    setEditingDept(null);
    setCode('');
    setName('');
    setShowModal(true);
  }

  function openEditModal(dept: Department) {
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingDept(null);
    setCode('');
    setName('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedCode || !trimmedName) {
      toast.error('Code and Name are required.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingDept) {
        // Update existing department
        const docRef = doc(db, 'departments', editingDept.id);
        await updateDoc(docRef, {
          code: trimmedCode,
          name: trimmedName,
          updatedAt: serverTimestamp(),
        });
        toast.success(`Updated department: ${trimmedCode}`);
      } else {
        // Create new department
        const deptId = `dept_${trimmedCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const docRef = doc(db, 'departments', deptId);
        
        await setDoc(docRef, {
          id: deptId,
          code: trimmedCode,
          name: trimmedName,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
        });
        toast.success(`Created department: ${trimmedCode}`);
      }
      closeModal();
    } catch (err: any) {
      console.error('[EduSync] Error saving department:', err);
      toast.error(err?.message || 'Failed to save department.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(dept: Department) {
    const newStatus = dept.status === 'active' ? 'archived' : 'active';
    try {
      await updateDoc(doc(db, 'departments', dept.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(
        newStatus === 'active'
          ? `Restored department: ${dept.code}`
          : `Archived department: ${dept.code}`
      );
    } catch (err: any) {
      console.error('[EduSync] Error updating department status:', err);
      toast.error('Failed to change department status.');
    }
  }

  const filtered = departments.filter(
    (d) =>
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Departments Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure institutional departments for curriculum, classes, and outcome alignment.
          </p>
        </div>
        <button
          id="btn-create-department"
          type="button"
          onClick={openCreateModal}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          <span>Add Department</span>
        </button>
      </div>

      {/* Controls: Search and Counter */}
      <div className="glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field !py-2 !pl-9"
          />
        </div>
        <div className="text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-800">{filtered.length}</span> of{' '}
          <span className="font-bold text-slate-800">{departments.length}</span> departments
        </div>
      </div>

      {/* Departments Table / Cards */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading departments...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700">No departments found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search ? 'No department matches your search filter.' : 'Get started by creating your first department (e.g. CSE-DS).'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary mt-4 !py-2 !text-xs"
            >
              <Plus className="h-4 w-4" /> Add Department
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Department Code</th>
                <th className="py-3.5 px-6">Full Department Name</th>
                <th className="py-3.5 px-6">Document ID</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((dept) => {
                const isActive = dept.status === 'active';
                return (
                  <tr key={dept.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-900 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-brand-50 text-brand-700 font-mono text-xs flex items-center justify-center font-bold">
                        {dept.code.slice(0, 3)}
                      </div>
                      <span>{dept.code}</span>
                    </td>
                    <td className="py-4 px-6 text-slate-700 font-medium">
                      {dept.name}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-slate-400">
                      {dept.id}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`badge ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {dept.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(dept)}
                        className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                        title="Edit Department"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(dept)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                          isActive
                            ? 'border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={isActive ? 'Archive Department' : 'Restore Department'}
                      >
                        {isActive ? (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            <span>Archive</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Restore</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create / Edit Department */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-up">
          <div className="glass-card max-w-lg w-full p-6 shadow-2xl relative bg-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900">
                <Building2 className="h-5 w-5 text-brand-600" />
                <h2 className="text-lg font-bold">
                  {editingDept ? 'Edit Department' : 'Create New Department'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Department Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE-DS, AIML, IT"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="input-field uppercase font-mono font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Short institutional identifier (used for course mappings and class codes).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science & Engineering (Data Science)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Official name as printed on course outcomes and accreditation reports.
                </p>
              </div>

              {!editingDept && code.trim() && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 font-mono">
                  <span className="text-slate-400">Generated Firestore ID: </span>
                  <span className="font-bold text-brand-700">
                    dept_{code.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-department"
                  type="submit"
                  disabled={submitting || !code.trim() || !name.trim()}
                  className="btn-primary"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>{editingDept ? 'Update Department' : 'Save Department'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
