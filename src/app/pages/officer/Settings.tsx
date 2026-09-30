import { useState, useEffect } from "react";
import { Save, User, Mail, Phone, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { PageSkeleton } from "../../components/vista/PolishedShell";

export default function OfficerProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
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
        contact_number: profileData.contact_number || "",
        position: profileData.position || "Municipal Tourism Officer",
        new_password: "",
        confirm_password: "",
      });
    }
    
    setLoading(false);
  };

  const handleUpdateProfile = async () => {
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-600 mt-1">Manage your account and profile information</p>
      </div>

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
              <input type="email" value={profile?.email || ""} disabled className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50" />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
              <input type="tel" value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} placeholder="+63 912 345 6789" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
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

      {/* Save Profile Button */}
      <div className="flex justify-end">
        <button onClick={handleUpdateProfile} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <Save className="w-5 h-5" /> {saving ? "Saving..." : "Save Profile Changes"}
        </button>
      </div>
    </div>
  );
}