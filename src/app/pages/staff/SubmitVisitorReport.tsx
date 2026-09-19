import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Save, Send, Plus, Trash2, AlertTriangle} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { canSubmitVisitorReport } from "../../../lib/establishmentReportForms";

interface VisitorEntry {
  id: number;
  groupName: string;
  breakdown: {
    THIS_PROVINCE: { male: number; female: number; placeOfResidence: string };
    OTHER_PROVINCE: { male: number; female: number; placeOfResidence: string };
    FOREIGN: { male: number; female: number; placeOfResidence: string };
  };
}

const residenceTypes = [
  { key: "THIS_PROVINCE", label: "This Province / Batangas", placeLabel: "" },
  { key: "OTHER_PROVINCE", label: "Other Province / Domestic", placeLabel: "Province or municipality" },
  { key: "FOREIGN", label: "Foreign Residence", placeLabel: "Country" },
] as const;
type ResidenceTypeKey = typeof residenceTypes[number]["key"];

const createEmptyBreakdown = (): VisitorEntry["breakdown"] => ({
  THIS_PROVINCE: { male: 0, female: 0, placeOfResidence: "" },
  OTHER_PROVINCE: { male: 0, female: 0, placeOfResidence: "" },
  FOREIGN: { male: 0, female: 0, placeOfResidence: "" },
});

const createEmptyEntry = (id: number): VisitorEntry => ({ id, groupName: "", breakdown: createEmptyBreakdown() });
const residenceTotal = (entry: VisitorEntry, key: keyof VisitorEntry["breakdown"]) => entry.breakdown[key].male + entry.breakdown[key].female;
const entryTotal = (entry: VisitorEntry) => residenceTypes.reduce((sum, type) => sum + residenceTotal(entry, type.key), 0);

const parseNonNegativeInteger = (value: string) => {
  if (value.trim() === "") return 0;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const numericInputValue = (value: number) => (value === 0 ? "" : String(value));

export default function SubmitVisitorReport() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<VisitorEntry[]>([createEmptyEntry(1)]);
  const [nextId, setNextId] = useState(2);
  const [visibleResidenceTypes, setVisibleResidenceTypes] = useState<Record<number, ResidenceTypeKey[]>>({ 1: ["THIS_PROVINCE"] });
  const [establishmentName, setEstablishmentName] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const draftStorageKey = (userId?: string, establishmentId?: string) =>
    userId && establishmentId ? `visitorReportDraft:${userId}:${establishmentId}` : null;

  const loadDraft = (userId: string, establishmentId: string) => {
    const key = draftStorageKey(userId, establishmentId);
    if (!key) return;

    const saved = localStorage.getItem(key);
    if (!saved) return;

    try {
      const draft = JSON.parse(saved) as { reportDate?: string; entries?: VisitorEntry[] };
      if (!Array.isArray(draft.entries)) return;

      const validEntries = draft.entries.flatMap((entry) => {
        if (!entry || typeof entry.id !== "number" || typeof entry.groupName !== "string") return [];
        if (entry.breakdown) return [entry];
        const legacy = entry as VisitorEntry & { male?: number; female?: number; residenceType?: string; placeOfResidence?: string };
        if (!legacy.residenceType || !residenceTypes.some((type) => type.key === legacy.residenceType)) return [];
        const breakdown = createEmptyBreakdown();
        const residenceType = legacy.residenceType as keyof VisitorEntry["breakdown"];
        breakdown[residenceType] = {
          male: Math.max(0, Number(legacy.male) || 0),
          female: Math.max(0, Number(legacy.female) || 0),
          placeOfResidence: legacy.placeOfResidence || "",
        };
        return [{ id: entry.id, groupName: entry.groupName, breakdown }];
      });
      if (validEntries.length === 0) return;

      setEntries(validEntries.map((entry) => ({
        id: entry.id,
        groupName: entry.groupName,
        breakdown: residenceTypes.reduce((result, type) => ({
          ...result,
          [type.key]: {
            male: Math.max(0, Number(entry.breakdown[type.key]?.male) || 0),
            female: Math.max(0, Number(entry.breakdown[type.key]?.female) || 0),
            placeOfResidence: String(entry.breakdown[type.key]?.placeOfResidence || ""),
          },
        }), createEmptyBreakdown()),
      })));
      setVisibleResidenceTypes(Object.fromEntries(validEntries.map((entry) => [entry.id, residenceTypes.filter((type) => type.key === "THIS_PROVINCE" || residenceTotal(entry, type.key) > 0 || Boolean(entry.breakdown[type.key].placeOfResidence)).map((type) => type.key)])));
      setNextId(Math.max(...validEntries.map((entry) => entry.id), 0) + 1);
      if (draft.reportDate) setReportDate(draft.reportDate);
      toast.success("Saved draft restored");
    } catch {
      localStorage.removeItem(key);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

const loadProfile = async () => {
  setLoadingProfile(true);
  setError(null);
  
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('User error:', userError);
      setError('Please log in again');
      setLoadingProfile(false);
      return;
    }
    
    if (!user) {
      setError('No user found. Please log in.');
      setLoadingProfile(false);
      return;
    }
    
    console.log('=== SUBMIT REPORT DEBUG ===');
    console.log('Current user ID:', user.id);
    console.log('Current user email:', user.email);
    
    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id);
    
    if (profileError) {
      console.error('Profile error:', profileError);
      setError('Could not load your profile');
      setLoadingProfile(false);
      return;
    }
    
    if (!profileData || profileData.length === 0) {
      setError('Profile not found');
      setLoadingProfile(false);
      return;
    }
    
    const profile = profileData[0];
    
    console.log('Profile:', profile);
    console.log('Establishment ID:', profile?.establishment_id);
    
    // Also check if establishment exists
    if (profile?.establishment_id) {
      const { data: establishment, error: estError } = await supabase
        .from('establishments')
        .select('name,reporting_mode')
        .eq('id', profile.establishment_id);
      
      if (estError) {
        console.error('Establishment fetch error:', estError);
      } else if (establishment && establishment.length > 0) {
        console.log('Establishment:', establishment[0]);
        setEstablishmentName(establishment[0]?.name || 'Your Establishment');

        if (!canSubmitVisitorReport(establishment[0])) {
          toast.error('This establishment is assigned to hotel/accommodation reports only.');
          navigate('/staff', { replace: true });
          return;
        }
      } else {
        console.warn('⚠️ Establishment not found with ID:', profile.establishment_id);
        setEstablishmentName('Establishment not found');
      }
    } else {
      console.warn("⚠️ No establishment_id found in profile!");
      setError('No establishment associated with your account. Please contact the municipal tourism officer.');
      setLoadingProfile(false);
      return;
    }
    
    setProfile(profile);
    loadDraft(profile.id, profile.establishment_id);
    
  } catch (err) {
    console.error('Unexpected error:', err);
    setError('Failed to load your information');
  } finally {
    setLoadingProfile(false);
  }
};

  const updateEntry = (id: number, field: string, value: any) => {
    setEntries(entries.map(entry => entry.id === id ? { ...entry, groupName: value } : entry));
  };

  const updateResidence = (id: number, residenceType: keyof VisitorEntry["breakdown"], field: "male" | "female" | "placeOfResidence", value: string | number) => {
    setEntries(entries.map(entry => entry.id === id ? {
      ...entry,
      breakdown: { ...entry.breakdown, [residenceType]: { ...entry.breakdown[residenceType], [field]: value } },
    } : entry));
  };

  const addEntry = () => {
    setEntries([...entries, createEmptyEntry(nextId)]);
    setVisibleResidenceTypes((current) => ({ ...current, [nextId]: ["THIS_PROVINCE"] }));
    setNextId(nextId + 1);
  };

  const removeEntry = (id: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter(entry => entry.id !== id));
      setVisibleResidenceTypes((current) => { const next = { ...current }; delete next[id]; return next; });
    } else {
      toast.error("At least one entry is required");
    }
  };

  const addResidenceCategory = (entryId: number, residenceType: ResidenceTypeKey) => {
    setVisibleResidenceTypes((current) => {
      const visible = current[entryId] || ["THIS_PROVINCE"];
      return visible.includes(residenceType) ? current : { ...current, [entryId]: [...visible, residenceType] };
    });
  };

  const removeResidenceCategory = (entryId: number, residenceType: ResidenceTypeKey) => {
    if (residenceType === "THIS_PROVINCE") return;
    setVisibleResidenceTypes((current) => ({ ...current, [entryId]: (current[entryId] || ["THIS_PROVINCE"]).filter((key) => key !== residenceType) }));
    setEntries(entries.map((entry) => entry.id === entryId ? { ...entry, breakdown: { ...entry.breakdown, [residenceType]: { male: 0, female: 0, placeOfResidence: "" } } } : entry));
  };

  const switchResidenceCategory = (entryId: number, from: ResidenceTypeKey, to: ResidenceTypeKey) => {
    setVisibleResidenceTypes((current) => {
      const visible = current[entryId] || ["THIS_PROVINCE"];
      if (visible.includes(to)) return current;
      return { ...current, [entryId]: visible.map((key) => key === from ? to : key) };
    });
    setEntries(entries.map((entry) => entry.id === entryId ? {
      ...entry,
      breakdown: {
        ...entry.breakdown,
        [from]: { male: 0, female: 0, placeOfResidence: "" },
        [to]: { ...entry.breakdown[to] },
      },
    } : entry));
  };

  const calculateTotalVisitors = () => entries.reduce((sum, entry) => sum + entryTotal(entry), 0);

  const handleSubmit = async () => {
    if (!profile?.establishment_id) {
      toast.error("No establishment associated with your account");
      return;
    }

    const hasValidEntry = entries.some(entry => entryTotal(entry) > 0);
    if (!hasValidEntry) {
      toast.error("Please enter visitor counts for at least one entry");
      return;
    }

    setSubmitting(true);

    const selectedDate = new Date(`${reportDate}T00:00:00`);
    if (!reportDate || Number.isNaN(selectedDate.getTime())) {
      toast.error("Please enter a valid report date");
      setSubmitting(false);
      return;
    }

    const invalidResidence = entries.flatMap((entry) => residenceTypes.map((type) => ({ entry, type }))).find(({ entry, type }) =>
      residenceTotal(entry, type.key) > 0 && type.key !== "THIS_PROVINCE" && !entry.breakdown[type.key].placeOfResidence.trim()
    );
    if (invalidResidence) {
      toast.error(invalidResidence.type.key === "FOREIGN" ? "Country is required for foreign visitors" : "Province or municipality is required for domestic visitors");
      setSubmitting(false);
      return;
    }

    const submissions = entries.flatMap(entry => residenceTypes
      .filter(type => residenceTotal(entry, type.key) > 0)
      .map(type => {
        const residence = entry.breakdown[type.key];
        return {
        establishment_id: profile.establishment_id,
        submitted_by: profile.id,
        report_date: reportDate,
        guest_name: entry.groupName || null,
        guest_group_name: entry.groupName || null,
        total_male: residence.male,
        total_female: residence.female,
        total_guests: residenceTotal(entry, type.key),
        male_visitors: residence.male,
        female_visitors: residence.female,
        total_visitors: residenceTotal(entry, type.key),
        residence_type: type.key,
        residence_category: type.key,
        place_of_residence: residence.placeOfResidence || null,
        municipality: type.key === "THIS_PROVINCE" ? "Balayan" : null,
        province: type.key === "OTHER_PROVINCE" ? residence.placeOfResidence || null : type.key === "THIS_PROVINCE" ? "Batangas" : null,
        country: type.key === "FOREIGN" ? residence.placeOfResidence || null : null,
        status: "submitted"
        };
      })
    );
    if (submissions.length === 0) {
      toast.error("No valid entries to submit");
      setSubmitting(false);
      return;
    }

    const { error: submitError } = await supabase
      .from("visitor_reports")
      .insert(submissions);

    if (submitError) {
      console.error('Submit error:', submitError);
      toast.error("Failed to submit: " + submitError.message);
    } else {
      toast.success(`${submissions.length} visitor record(s) submitted successfully`);
      const draftKey = draftStorageKey(profile.id, profile.establishment_id);
      if (draftKey) localStorage.removeItem(draftKey);
      // Reset form
      setEntries([createEmptyEntry(1)]);
      setVisibleResidenceTypes({ 1: ["THIS_PROVINCE"] });
      setNextId(2);
      setReportDate(new Date().toISOString().slice(0, 10));
    }
    setSubmitting(false);
  };

  const handleSaveDraft = () => {
    const key = draftStorageKey(profile?.id, profile?.establishment_id);
    if (!key) {
      toast.error("Your account is not ready to save a draft");
      return;
    }

    const draft = {
      version: 1,
      reportDate,
      entries: entries.filter((entry) => entryTotal(entry) > 0 || entry.groupName),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
    toast.success("Draft saved on this device and will be restored after you sign in again");
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1CA7C9] mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading your establishment information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Form</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Daily Tourist Arrival Encoding</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Record same-day visitors by residence category</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">Establishment</label>
            <input type="text" value={establishmentName} disabled className="block w-full min-w-0 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50" />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Date</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="block w-full min-w-0 max-w-full appearance-none px-4 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Visitor Groups</h3>
            <p className="mt-1 text-sm text-gray-500">Enter each group once, then split its visitors by residence below.</p>
          </div>
          <button onClick={addEntry} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-3 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] text-sm font-medium transition">
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>
        <div className="space-y-4 p-4">
          {entries.map((entry, entryIndex) => (
            <section key={entry.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group name <span className="font-normal text-gray-500">(optional)</span></label>
                  <input type="text" value={entry.groupName} onChange={(e) => updateEntry(entry.id, "groupName", e.target.value)} placeholder={`Visitor group ${entryIndex + 1}`} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <button type="button" onClick={() => removeEntry(entry.id)} aria-label={`Remove visitor group ${entryIndex + 1}`} className="mt-6 inline-flex rounded p-2 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-gray-500">Add another category after entering the Batangas count.</span>
                {residenceTotal(entry, "THIS_PROVINCE") > 0 && residenceTypes.filter((type) => !(visibleResidenceTypes[entry.id] || ["THIS_PROVINCE"]).includes(type.key)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addResidenceCategory(entry.id, e.target.value as ResidenceTypeKey);
                    }}
                    className="rounded-md border border-[#1CA7C9] bg-white px-3 py-2 text-xs font-medium text-[#0F4C75] hover:bg-cyan-50"
                    aria-label="Add residence category"
                  >
                    <option value="">+ Add residence category</option>
                    {residenceTypes.filter((type) => !(visibleResidenceTypes[entry.id] || ["THIS_PROVINCE"]).includes(type.key)).map((type) => (
                      <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {residenceTypes.filter((type) => (visibleResidenceTypes[entry.id] || ["THIS_PROVINCE"]).includes(type.key)).map((type) => {
                  const residence = entry.breakdown[type.key];
                  return (
                    <div key={type.key} className="rounded-lg border border-white bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#0F4C75]">{type.label}</h4>

                        <div className="flex items-center gap-2">
                          {residence.male === 0 && residence.female === 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) switchResidenceCategory(entry.id, type.key, e.target.value as ResidenceTypeKey);
                              }}
                              className="max-w-[150px] rounded border border-gray-300 bg-white px-2 py-1 text-[10px] text-gray-600"
                              aria-label={`Switch ${type.label} residence`}
                            >
                              <option value="">Switch residence</option>
                              {residenceTypes.filter((candidate) => candidate.key !== type.key && !(visibleResidenceTypes[entry.id] || ["THIS_PROVINCE"]).includes(candidate.key)).map((candidate) => (
                                <option key={candidate.key} value={candidate.key}>{candidate.label}</option>
                              ))}
                            </select>
                          )}
                          {type.key !== "THIS_PROVINCE" && <button type="button" onClick={() => removeResidenceCategory(entry.id, type.key)} className="text-xs text-gray-500 hover:text-red-600">Remove</button>}
                        </div>
                      </div>
                      {type.placeLabel && <input type="text" value={residence.placeOfResidence} onChange={(e) => updateResidence(entry.id, type.key, "placeOfResidence", e.target.value)} placeholder={type.placeLabel} className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs text-gray-600">Male<input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(residence.male)} onChange={(e) => updateResidence(entry.id, type.key, "male", parseNonNegativeInteger(e.target.value))} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-center text-sm" placeholder="0" /></label>
                        <label className="text-xs text-gray-600">Female<input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(residence.female)} onChange={(e) => updateResidence(entry.id, type.key, "female", parseNonNegativeInteger(e.target.value))} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-center text-sm" placeholder="0" /></label>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-sm"><span className="text-gray-600">Category total</span><strong className="text-[#0F4C75]">{residenceTotal(entry, type.key)}</strong></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end text-sm font-semibold text-[#0F4C75]">Group total: {entryTotal(entry)}</div>
            </section>
          ))}
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-right text-base font-bold text-[#0F4C75]">Total visitors today: {calculateTotalVisitors()}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:flex sm:gap-4">
        <button onClick={handleSaveDraft} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          <Save className="w-5 h-5" /> Save Draft
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] disabled:cursor-not-allowed disabled:opacity-60">
          <Send className="w-5 h-5" /> {submitting ? "Submitting..." : "Submit Resort Report"}
        </button>
      </div>
    </div>
  );
}