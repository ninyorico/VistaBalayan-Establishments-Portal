import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Save, Send, Plus, Trash2, AlertTriangle} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { canSubmitVisitorReport } from "../../../lib/establishmentReportForms";

interface VisitorEntry {
  id: number;
  groupName: string;
  male: number;
  female: number;
  total: number;
  residenceType: string;
  placeOfResidence: string;
}

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
  const [entries, setEntries] = useState<VisitorEntry[]>([
    { id: 1, groupName: "", male: 0, female: 0, total: 0, residenceType: "THIS_PROVINCE", placeOfResidence: "" }
  ]);
  const [nextId, setNextId] = useState(2);
  const [establishmentName, setEstablishmentName] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

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
    
  } catch (err) {
    console.error('Unexpected error:', err);
    setError('Failed to load your information');
  } finally {
    setLoadingProfile(false);
  }
};

  const updateEntry = (id: number, field: string, value: any) => {
    setEntries(entries.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        if (field === "residenceType" && value !== "OTHER_PROVINCE" && value !== "FOREIGN") {
          updated.placeOfResidence = "";
        }
        if (field === "male" || field === "female") {
          updated.total = (Number(updated.male) || 0) + (Number(updated.female) || 0);
        }
        return updated;
      }
      return entry;
    }));
  };

  const addEntry = () => {
    setEntries([...entries, {
      id: nextId,
      groupName: "",
      male: 0,
      female: 0,
      total: 0,
      residenceType: "THIS_PROVINCE",
      placeOfResidence: ""
    }]);
    setNextId(nextId + 1);
  };

  const removeEntry = (id: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter(entry => entry.id !== id));
    } else {
      toast.error("At least one entry is required");
    }
  };

  const calculateTotalVisitors = () => {
    return entries.reduce((sum, entry) => sum + entry.total, 0);
  };

  const handleSubmit = async () => {
    if (!profile?.establishment_id) {
      toast.error("No establishment associated with your account");
      return;
    }

    const hasValidEntry = entries.some(entry => entry.total > 0);
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

    const invalidResidence = entries.find((entry) =>
      (entry.residenceType === "OTHER_PROVINCE" || entry.residenceType === "FOREIGN") && !entry.placeOfResidence.trim()
    );
    if (invalidResidence) {
      toast.error(invalidResidence.residenceType === "FOREIGN" ? "Country is required for foreign visitors" : "Province or municipality is required for domestic visitors");
      setSubmitting(false);
      return;
    }

    const submissions = entries
      .filter(entry => entry.total > 0)
      .map(entry => ({
        establishment_id: profile.establishment_id,
        submitted_by: profile.id,
        report_date: reportDate,
        guest_name: entry.groupName || null,
        guest_group_name: entry.groupName || null,
        total_male: entry.male,
        total_female: entry.female,
        total_guests: entry.total,
        male_visitors: entry.male,
        female_visitors: entry.female,
        total_visitors: entry.total,
        residence_type: entry.residenceType,
        residence_category: entry.residenceType,
        place_of_residence: entry.placeOfResidence || null,
        municipality: entry.residenceType === "THIS_PROVINCE" ? "Balayan" : null,
        province: entry.residenceType === "OTHER_PROVINCE" ? entry.placeOfResidence || null : entry.residenceType === "THIS_PROVINCE" ? "Batangas" : null,
        country: entry.residenceType === "FOREIGN" ? entry.placeOfResidence || null : null,
        status: "submitted"
      }));

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
      // Reset form
      setEntries([{ id: 1, groupName: "", male: 0, female: 0, total: 0, residenceType: "THIS_PROVINCE", placeOfResidence: "" }]);
      setNextId(2);
      setReportDate(new Date().toISOString().slice(0, 10));
    }
    setSubmitting(false);
  };

  const handleSaveDraft = () => {
    const draft = {
      reportDate,
      entries: entries.filter(e => e.total > 0 || e.groupName)
    };
    localStorage.setItem('visitorReportDraft', JSON.stringify(draft));
    toast.success("Draft saved locally");
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
            <h3 className="text-lg font-semibold text-gray-900">Visitor Entries</h3>
            <p className="mt-1 text-sm text-gray-500 md:hidden">Compact table for faster phone entry. Swipe only if your screen is very narrow.</p>
          </div>
          <button onClick={addEntry} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-3 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] text-sm font-medium transition">
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-full table-fixed md:min-w-[720px]">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-1.5 py-2 text-left text-[11px] font-semibold text-gray-700 md:px-3 md:text-xs">Group & Residence</th>
                <th className="px-1 py-2 text-center text-[11px] font-semibold text-gray-700 md:px-3 md:text-xs">Male</th>
                <th className="px-1 py-2 text-center text-[11px] font-semibold text-gray-700 md:px-3 md:text-xs">Female</th>
                <th className="px-1.5 py-2 text-center text-[11px] font-semibold text-gray-700 md:px-3 md:text-xs">Total</th>
                <th className="px-1 py-2 text-center text-[11px] font-semibold text-gray-700 md:px-3 md:text-xs">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-1.5 py-2 md:px-3">
                    <input type="text" value={entry.groupName} onChange={(e) => updateEntry(entry.id, "groupName", e.target.value)} placeholder="Group optional" className="block w-full min-w-0 rounded-md border border-gray-300 px-1.5 py-1.5 text-xs md:text-sm" />
                    <select value={entry.residenceType} onChange={(e) => updateEntry(entry.id, "residenceType", e.target.value)} className="mt-1 block w-full min-w-0 rounded-md border border-gray-300 px-1.5 py-1.5 text-xs md:text-sm">
                      <option value="THIS_PROVINCE">This Province / Batangas</option>
                      <option value="OTHER_PROVINCE">Other Province / Domestic</option>
                      <option value="FOREIGN">Foreign Residence</option>
                    </select>
                    {(entry.residenceType === "OTHER_PROVINCE" || entry.residenceType === "FOREIGN") && (
                      <input type="text" value={entry.placeOfResidence} onChange={(e) => updateEntry(entry.id, "placeOfResidence", e.target.value)} placeholder={entry.residenceType === "FOREIGN" ? "Country" : "Province / municipality"} required className="mt-1 block w-full min-w-0 rounded-md border border-gray-300 px-1.5 py-1.5 text-xs md:text-sm" />
                    )}
                  </td>
                  <td className="px-1 py-2 md:px-3">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(entry.male)} onChange={(e) => updateEntry(entry.id, "male", parseNonNegativeInteger(e.target.value))} className="w-full min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm tabular-nums" placeholder="0" />
                  </td>
                  <td className="px-1 py-2 md:px-3">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(entry.female)} onChange={(e) => updateEntry(entry.id, "female", parseNonNegativeInteger(e.target.value))} className="w-full min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm tabular-nums" placeholder="0" />
                  </td>
                  <td className="px-1.5 py-2 text-center text-sm font-semibold text-[#0B2530] md:px-3 md:text-base">{entry.total}</td>
                  <td className="px-1 py-2 text-center md:px-3">
                    <button onClick={() => removeEntry(entry.id)} className="inline-flex p-1 text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right text-sm font-semibold md:px-3">Total Visitors Today:</td>
                <td className="px-1.5 py-2 text-center text-lg font-bold text-[#0F4C75] md:px-3">{calculateTotalVisitors()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
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