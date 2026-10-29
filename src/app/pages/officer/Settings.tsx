import { useState, useEffect } from "react";
import { Save, User, Mail, Phone, Shield, Cookie } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { PageSkeleton, PageHero } from "../../components/vista/PolishedShell";
import { openCookiePreferences } from "../../components/CookieConsent";
import { CONTACT_NUMBER_ERROR, isValidContactNumber, sanitizeContactNumber } from "../../../lib/contactNumber";

export default function OfficerProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerificationStep, setEmailVerificationStep] = useState<"idle" | "otp">("idle");
  const [gmailVerified, setGmailVerified] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    contact_number: "",
    position: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }
    
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    if (profileData) {
      setProfile(profileData);
      setFormData({
        full_name: profileData.full_name || "",
        email: user.email || profileData.email || "",
        contact_number: profileData.contact_number || "",
        position: profileData.position || "Municipal Tourism Officer",
        new_password: "",
        confirm_password: "",
      });
      setGmailVerified(Boolean(user.user_metadata?.gmail_verified) && (user.email || "").toLowerCase() === (profileData.email || "").toLowerCase());
      setEmailVerificationStep("idle");
      setEmailOtp("");
    }

    setLoading(false);
  };

  const handleUpdateProfile = async () => {
    if (!isValidContactNumber(formData.contact_number)) {
      toast.error(CONTACT_NUMBER_ERROR);
      return;
    }

    setSaving(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("User not found");
      setSaving(false);
      return;
    }
    
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formData.full_name,
        contact_number: formData.contact_number,
        position: formData.position,
        updated_at: new Date(),
      })
      .eq("id", user.id);
    
    if (error) {
      toast.error("Failed to update profile: " + error.message);
    } else {
      toast.success("Profile updated successfully");
    }
    
    setSaving(false);
  };

  const callPortalEmailApi = async (path: string, body: Record<string, unknown>) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Email verification request failed");
    return result;
  };

  const handleSendEmailOtp = async () => {
    const nextEmail = formData.email.trim().toLowerCase();
    if (!/^\S+@[^\s@]+\.[^\s@]+$/i.test(nextEmail)) {
      toast.error("Please enter a valid work email address.");
      return;
    }

    setSaving(true);
    try {
      await callPortalEmailApi("/api/send-staff-email-verification-otp", { email: nextEmail });
      setEmailOtp("");
      setEmailVerificationStep("otp");
      toast.success("Verification code sent. Enter the 6-digit code to verify this email.");
    } catch (error) {
      toast.error(`Failed to send email verification code: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    const nextEmail = formData.email.trim().toLowerCase();
    if (!/^\d{6}$/.test(emailOtp.trim())) {
      toast.error("Enter the 6-digit verification code.");
      return;
    }

    setSaving(true);
    try {
      const result = await callPortalEmailApi("/api/verify-staff-email-otp", {
        email: nextEmail,
        otp: emailOtp.trim(),
      });
      const verifiedEmail = String(result.email || nextEmail);
      setProfile((previous: any) => previous ? { ...previous, email: verifiedEmail } : previous);
      setFormData((previous) => ({ ...previous, email: verifiedEmail }));
      setGmailVerified(true);
      setEmailVerificationStep("idle");
      setEmailOtp("");
      toast.success("Email verified and saved.");
    } catch (error) {
      toast.error(`Failed to verify email: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!formData.new_password) {
      toast.error("Please enter a new password");
      return;
    }
    
    if (formData.new_password !== formData.confirm_password) {
      toast.error("New passwords do not match");
      return;
    }
    
    if (formData.new_password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setSaving(true);
    
    const { error } = await supabase.auth.updateUser({
      password: formData.new_password
    });
    
    if (error) {
      toast.error("Failed to update password: " + error.message);
    } else {
      toast.success("Password updated successfully");
      setFormData({
        ...formData,
        new_password: "",
        confirm_password: "",
      });
    }
    
    setSaving(false);
  };

  if (loading) {
    return <PageSkeleton label="Loading officer settings" />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Officer account"
        title="Profile"
        description="Manage your account, contact details, security settings, and cookie preferences."
        compact
      />

      {/* Profile Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          Profile Information
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input type="email" value={formData.email} onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setGmailVerified(false); setEmailVerificationStep("idle"); setEmailOtp(""); }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="officer@gmail.com" />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-xs font-medium ${gmailVerified ? "text-emerald-600" : "text-amber-600"}`}>{gmailVerified ? "Email verified" : "Email not verified yet"}</p>
                {!gmailVerified && <button type="button" onClick={handleSendEmailOtp} disabled={saving || !formData.email.trim()} className="inline-flex items-center justify-center rounded-lg bg-[#0E5A72] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0B4A5E] disabled:opacity-50">{emailVerificationStep === "otp" ? "Resend code" : "Verify email"}</button>}
              </div>
              {emailVerificationStep === "otp" && <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3"><label className="block text-xs font-medium text-gray-700 mb-2">Enter 6-digit verification code</label><div className="flex flex-col gap-2 sm:flex-row"><input type="text" inputMode="numeric" maxLength={6} value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-semibold tracking-[0.35em] outline-none focus:border-[#1CA7C9] focus:ring-2 focus:ring-[#1CA7C9]/30" placeholder="000000" /><button type="button" onClick={handleVerifyEmailOtp} disabled={saving || emailOtp.length !== 6} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">Confirm</button></div><p className="mt-2 text-xs text-gray-500">The officer email is changed only after the verification code is accepted.</p></div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
              <input type="text" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: sanitizeContactNumber(e.target.value) })} placeholder="09171234567" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
              <input type="text" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      </div>


      {/* Change Password */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-600" />
          Change Password
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
              <input type="password" value={formData.new_password} onChange={(e) => setFormData({ ...formData, new_password: e.target.value })} placeholder="Enter new password" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
              <input type="password" value={formData.confirm_password} onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })} placeholder="Confirm new password" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleChangePassword} disabled={saving || !formData.new_password || formData.new_password !== formData.confirm_password} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> Update Password
            </button>
          </div>
        </div>
      </div>

      {/* Privacy Preferences */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Cookie className="w-5 h-5 text-[#0E5A72]" />
          Privacy and Cookie Preferences
        </h3>
        <p className="text-sm leading-6 text-gray-600">Review or change the optional browser-storage choices saved for this account and device.</p>
        <button type="button" onClick={openCookiePreferences} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0E5A72] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0B4A5E]">
          <Cookie className="h-4 w-4" /> Manage cookie preferences
        </button>
      </div>

      {/* Save Profile Button */}
      <div className="flex justify-end">
        <button onClick={handleUpdateProfile} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <Save className="w-5 h-5" /> {saving ? "Saving..." : "Save Profile Changes"}
        </button>
      </div>
    </div>
  );
}