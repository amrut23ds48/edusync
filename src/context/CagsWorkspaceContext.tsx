import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAcademic } from './AcademicContext';
import {
  ALLOWED_COS,
  ALLOWED_OUTCOMES,
  buildMatrix,
  calculatePoSummary,
  calculateTableA,
} from '../lib/cagsCalculations';
import type {
  CagsMappingDocument,
  CagsMatrix,
  CagsPoSummaryItem,
  CourseOutcome,
  GlobalOutcome,
  MappingLevel,
} from '../types';
import { OFFICIAL_GLOBAL_OUTCOMES } from '../services/seedService';
import type { TableAResult } from '../lib/cagsCalculations';

interface CagsWorkspaceValue {
  subjectId: string;
  cos: CourseOutcome[];
  cosLoading: boolean;
  outcomes: { id: string; description: string }[];
  savedMapping: CagsMappingDocument | null;
  mappingLoading: boolean;
  matrix: CagsMatrix;
  setCellLevel: (coCode: string, outcome: string, level: MappingLevel) => void;
  setCellRationale: (coCode: string, outcome: string, rationale: string) => void;
  replaceMatrix: (m: CagsMatrix) => void;
  reviewMeetingLink: string;
  setReviewMeetingLink: (v: string) => void;
  reviewerNames: string;
  setReviewerNames: (v: string) => void;
  dirty: boolean;
  markClean: () => void;
  tableA: TableAResult;
  poSummary: Record<string, CagsPoSummaryItem>;
}

const Ctx = createContext<CagsWorkspaceValue | undefined>(undefined);

export function CagsWorkspaceProvider({
  subjectId,
  children,
}: {
  subjectId: string;
  children: ReactNode;
}) {
  const { activeSubject } = useAcademic();
  const [cos, setCos] = useState<CourseOutcome[]>([]);
  const [cosLoading, setCosLoading] = useState(true);
  const [allOutcomes, setAllOutcomes] = useState<GlobalOutcome[]>([]);
  const [savedMapping, setSavedMapping] = useState<CagsMappingDocument | null>(null);
  const [mappingLoading, setMappingLoading] = useState(true);

  const [matrix, setMatrix] = useState<CagsMatrix>({});
  const [reviewMeetingLink, setReviewMeetingLinkState] = useState('');
  const [reviewerNames, setReviewerNamesState] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Course outcomes CO1–CO4 (real-time)
  useEffect(() => {
    setCosLoading(true);
    const q = query(collection(db, 'course_outcomes'), where('subjectId', '==', subjectId));
    return onSnapshot(
      q,
      (snap) => {
        const list: CourseOutcome[] = [];
        snap.forEach((d) => {
          const data = d.data() as CourseOutcome;
          if (
            (ALLOWED_COS as readonly string[]).includes(data.coCode) &&
            data.status !== 'archived'
          ) {
            list.push(data);
          }
        });
        list.sort((a, b) => a.coNumber - b.coNumber);
        setCos(list);
        setCosLoading(false);
      },
      (err) => {
        console.error('[EduSync] course_outcomes listener failed:', err);
        setCosLoading(false);
      }
    );
  }, [subjectId]);

  // Global outcomes (PO/PSO)
  useEffect(() => {
    return onSnapshot(
      collection(db, 'global_outcomes'),
      (snap) => {
        const list: GlobalOutcome[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as GlobalOutcome), id: d.id }));
        setAllOutcomes(list);
      },
      (err) => console.error('[EduSync] global_outcomes listener failed:', err)
    );
  }, []);

  // Saved mapping document
  useEffect(() => {
    setMappingLoading(true);
    return onSnapshot(
      doc(db, 'cags_mappings', subjectId),
      (snap) => {
        setSavedMapping(snap.exists() ? (snap.data() as CagsMappingDocument) : null);
        setMappingLoading(false);
      },
      (err) => {
        console.error('[EduSync] cags_mappings listener failed:', err);
        setMappingLoading(false);
      }
    );
  }, [subjectId]);

  // Outcomes list (14), preferring department-scoped docs over unscoped ones, with fallback to official seeded definitions
  const outcomes = useMemo(() => {
    const deptId = activeSubject?.departmentId;
    return ALLOWED_OUTCOMES.map((code) => {
      const cleanCode = code.replace(/\s+/g, '').toUpperCase();
      const matches = allOutcomes.filter(
        (o) =>
          (o.code?.replace(/\s+/g, '').toUpperCase() === cleanCode ||
            o.shortLabel?.replace(/\s+/g, '').toUpperCase() === cleanCode ||
            o.id?.toUpperCase() === cleanCode ||
            o.id?.toUpperCase().endsWith(`_${cleanCode}`)) &&
          o.status !== 'archived' &&
          (o.type === 'PO' || o.type === 'PSO')
      );
      const pick =
        matches.find((o) => deptId && o.departmentId === deptId) ||
        matches.find((o) => !o.departmentId) ||
        matches[0];

      // Fallback to official verbatim definition if Firestore doc has empty/missing description
      const officialFallback = OFFICIAL_GLOBAL_OUTCOMES.find(
        (fo) => fo.shortLabel.replace(/\s+/g, '').toUpperCase() === cleanCode
      );

      const description = pick?.description?.trim() || officialFallback?.description || '';
      return { id: code, description };
    });
  }, [allOutcomes, activeSubject?.departmentId]);

  // (Re)build the draft matrix from saved data whenever sources change and there are no local edits
  useEffect(() => {
    if (cosLoading || mappingLoading) return;
    if (dirtyRef.current) {
      // keep local edits but make sure hours/rows follow the latest COs
      setMatrix((prev) => buildMatrix(cos, prev));
      return;
    }
    setMatrix(buildMatrix(cos, savedMapping?.matrix || {}));
    setReviewMeetingLinkState(savedMapping?.reviewMeetingLink || '');
    setReviewerNamesState((savedMapping?.reviewerNames || []).join(', '));
  }, [cos, savedMapping, cosLoading, mappingLoading]);

  const setCellLevel = useCallback((coCode: string, outcome: string, level: MappingLevel) => {
    setMatrix((prev) => {
      const row = prev[coCode];
      if (!row) return prev;
      const cell = row.mappings[outcome];
      return {
        ...prev,
        [coCode]: {
          ...row,
          mappings: {
            ...row.mappings,
            [outcome]: {
              ...cell,
              level,
              status: level === null ? 'unmapped' : 'approved',
            },
          },
        },
      };
    });
    setDirty(true);
  }, []);

  const setCellRationale = useCallback((coCode: string, outcome: string, rationale: string) => {
    setMatrix((prev) => {
      const row = prev[coCode];
      if (!row) return prev;
      return {
        ...prev,
        [coCode]: {
          ...row,
          mappings: { ...row.mappings, [outcome]: { ...row.mappings[outcome], rationale } },
        },
      };
    });
    setDirty(true);
  }, []);

  const replaceMatrix = useCallback((m: CagsMatrix) => {
    setMatrix(m);
    setDirty(true);
  }, []);

  const setReviewMeetingLink = useCallback((v: string) => {
    setReviewMeetingLinkState(v);
    setDirty(true);
  }, []);
  const setReviewerNames = useCallback((v: string) => {
    setReviewerNamesState(v);
    setDirty(true);
  }, []);
  const markClean = useCallback(() => setDirty(false), []);

  const tableA = useMemo(() => calculateTableA(cos, matrix), [cos, matrix]);
  const poSummary = useMemo(() => calculatePoSummary(matrix, cos), [cos, matrix]);

  const value: CagsWorkspaceValue = {
    subjectId,
    cos,
    cosLoading,
    outcomes,
    savedMapping,
    mappingLoading,
    matrix,
    setCellLevel,
    setCellRationale,
    replaceMatrix,
    reviewMeetingLink,
    setReviewMeetingLink,
    reviewerNames,
    setReviewerNames,
    dirty,
    markClean,
    tableA,
    poSummary,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCagsWorkspace(): CagsWorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCagsWorkspace must be used within CagsWorkspaceProvider');
  return v;
}
