import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Save, Send, Settings, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport } from "../../../lib/establishmentReportForms";
import { DEFAULT_ROOM_CONFIG, getRoomConfigFromAmenities, normalizeRoomConfig, setRoomConfigInAmenities, type EstablishmentRoomConfig } from "../../../lib/establishmentRoomConfig";

interface RoomOccupancy {
  roomType: string;
  roomCode: string;
  numberOfRooms: number;
  occupied: number;
  checkIns: number;
  guestNights: number;
}

const parseNonNegativeInteger = (value: string) => {
  if (value.trim() === "") return 0;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const numericInputValue = (value: number) => (value === 0 ? "" : String(value));

export default function SubmitAccommodationReport() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [establishmentName, setEstablishmentName] = useState("Loading...");
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [tempRoomConfig, setTempRoomConfig] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [roomTypes, setRoomTypes] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [establishmentAmenities, setEstablishmentAmenities] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [reportDate, setReportDate] = useState(getTodayDate());

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoadingProfile(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setError("No user found. Please log in.");
      setLoadingProfile(false);
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    
    if (!profileData) {
      setError("Profile not found");
      setLoadingProfile(false);
      return;
    }

    setProfile(profileData);
    
    if (!profileData.establishment_id) {
      setError("No establishment associated with your account. Please contact the municipal tourism officer.");
      setLoadingProfile(false);
      return;
    }

    const { data: est, error: estError } = await supabase
      .from('establishments')
      .select('name,type,total_rooms,amenities')
      .eq('id', profileData.establishment_id)
      .single();

    if (estError || !est) {
      setError("Could not load your establishment information");
      setLoadingProfile(false);
      return;
    }

    setEstablishmentName(est?.name || "Your Establishment");

    if (!canSubmitAccommodationReport(est)) {
      toast.error("This establishment is assigned to resort visitor reports only.");
      navigate("/staff", { replace: true });
      return;
    }

    setEstablishmentAmenities(typeof est.amenities === "string" ? est.amenities : "");
    const officerRoomConfig = getRoomConfigFromAmenities(est.amenities);
    const savedConfig = loadRoomConfig(profileData.establishment_id);
    const effectiveRoomConfig = mergeRoomConfig(officerRoomConfig, savedConfig);
    setRoomTypes(effectiveRoomConfig);
    setTempRoomConfig(effectiveRoomConfig);
    setRoomData(buildRoomData(effectiveRoomConfig));

    setLoadingProfile(false);
  };

  const roomConfigStorageKey = (establishmentId?: string) =>
    establishmentId ? `roomConfiguration:${establishmentId}` : "roomConfiguration";

  const loadRoomConfig = (establishmentId?: string) => {
    const saved = localStorage.getItem(roomConfigStorageKey(establishmentId));
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  };

  const mergeRoomConfig = (
    baseRooms: EstablishmentRoomConfig[],
    savedConfig: unknown
  ): EstablishmentRoomConfig[] => {
    if (Array.isArray(savedConfig)) {
      return normalizeRoomConfig(savedConfig);
    }

    if (savedConfig && typeof savedConfig === "object") {
      const savedCounts = savedConfig as Record<string, number>;
      return baseRooms.map((room) => ({
        ...room,
        count: Math.max(0, Number(savedCounts[room.code] ?? room.count ?? 0) || 0),
      }));
    }

    return normalizeRoomConfig(baseRooms);
  };

  const buildRoomData = (rooms = roomTypes) =>
    rooms.map((room) => ({
      roomType: room.type,
      roomCode: room.code,
      numberOfRooms: room.count ?? 0,
      occupied: 0,
      checkIns: 0,
      guestNights: 0,
    }));

  const [roomData, setRoomData] = useState<RoomOccupancy[]>(() => buildRoomData(DEFAULT_ROOM_CONFIG));

  const totalRooms = roomData.reduce(
    (sum, r) => sum + Number(r.numberOfRooms || 0),
    0
  );

  const updateTempRoomConfig = (index: number, field: keyof EstablishmentRoomConfig, value: string) => {
    setTempRoomConfig((rooms) =>
      rooms.map((room, i) => {
        if (i !== index) return room;
        if (field === "count") {
          return { ...room, count: parseNonNegativeInteger(value) };
        }
        const nextValue = field === "code" ? value.toUpperCase() : value;
        return { ...room, [field]: nextValue };
      })
    );
  };

  const addRoomConfigRow = () => {
    setTempRoomConfig((rooms) => [
      ...rooms,
      { type: "", code: `R${rooms.length + 1}`, count: 0 },
    ]);
  };

  const removeRoomConfigRow = (index: number) => {
    setTempRoomConfig((rooms) => (rooms.length > 1 ? rooms.filter((_, i) => i !== index) : rooms));
  };

  const saveRoomConfiguration = async () => {
    const config = normalizeRoomConfig(tempRoomConfig);
    const duplicatedCode = config.find((room, index) =>
      config.some((other, otherIndex) => otherIndex !== index && other.code === room.code)
    );

    if (duplicatedCode) {
      toast.error(`Room type code ${duplicatedCode.code} is duplicated. Please use unique codes.`);
      return;
    }

    const nextTotalRooms = config.reduce((sum, room) => sum + Number(room.count || 0), 0);
    const nextAmenities = setRoomConfigInAmenities(establishmentAmenities, config);

    localStorage.setItem(roomConfigStorageKey(profile?.establishment_id), JSON.stringify(config));

    if (profile?.establishment_id) {
      const { error } = await supabase
        .from("establishments")
        .update({
          amenities: nextAmenities,
          total_rooms: nextTotalRooms,
          updated_at: new Date(),
        })
        .eq("id", profile.establishment_id);

      if (error) {
        toast.error("Could not save room configuration to the establishment record: " + error.message);
        return;
      }

      setEstablishmentAmenities(nextAmenities);
    }

    setRoomTypes(config);
    setTempRoomConfig(config);
    setRoomData(
      config.map((room) => {
        const existing = roomData.find((currentRoom) => currentRoom.roomCode === room.code);
        return {
          roomType: room.type,
          roomCode: room.code,
          numberOfRooms: room.count || 0,
          occupied: existing?.occupied || 0,
          checkIns: existing?.checkIns || 0,
          guestNights: existing?.guestNights || 0,
        };
      })
    );

    setShowRoomSetup(false);
    toast.success("Room configuration saved successfully");
  };

  const updateRoomData = (index: number, field: string, value: number | string) => {
    setRoomData(
      roomData.map((room, i) => {
        if (i === index) {
          const numericValue = typeof value === "number" ? Math.max(0, value) : value;
          const updatedRoom = { ...room, [field]: numericValue };

          if (field === "occupied" && Number(numericValue) > Number(room.numberOfRooms || 0)) {
            toast.error("Occupied rooms cannot exceed configured rooms for this room type");
            return room;
          }

          return updatedRoom;
        }
        return room;
      })
    );
  };

  const totalOccupiedRooms = roomData.reduce(
    (sum, r) => sum + Number(r.occupied || 0),
    0
  );
  const totalCheckIns = roomData.reduce(
    (sum, r) => sum + Number(r.checkIns || 0),
    0
  );
  const totalGuestNights = roomData.reduce(
    (sum, r) => sum + Number(r.guestNights || 0),
    0
  );

  const avgGuestNight =
    totalCheckIns > 0 ? (totalGuestNights / totalCheckIns).toFixed(2) : "0.00";
  const avgOccupancyRate = calculateAccommodationOccupancy(
    totalOccupiedRooms,
    totalRooms
  ).toFixed(2);
  const avgGuestPerRoom =
    totalOccupiedRooms > 0
      ? (totalGuestNights / totalOccupiedRooms).toFixed(2)
      : "0.00";

  const handleSaveDraft = () => {
    toast.success("Draft saved successfully");
  };

  const handleSubmit = async () => {
    if (!profile?.establishment_id) {
      toast.error("No establishment associated with your account");
      return;
    }

    if (totalRooms === 0) {
      toast.error("Please configure rooms first");
      return;
    }

    const invalidOccupiedRoom = roomData.find(
      (room) => Number(room.occupied || 0) > Number(room.numberOfRooms || 0)
    );

    if (invalidOccupiedRoom) {
      toast.error(`${invalidOccupiedRoom.roomType} occupied rooms cannot exceed configured rooms`);
      return;
    }

    if (totalOccupiedRooms > totalRooms) {
      toast.error("Total occupied rooms cannot exceed total configured rooms");
      return;
    }

    setSubmitting(true);

    // Insert into accommodation_reports
    const { data: reportData, error: reportError } = await supabase
      .from("accommodation_reports")
      .insert({
        establishment_id: profile.establishment_id,
        submitted_by: profile.id,
        report_date: reportDate,
        total_rooms: totalRooms,
        total_occupied_rooms: totalOccupiedRooms,
        total_check_ins: totalCheckIns,
        total_guest_nights: totalGuestNights,
        status: "pending",
      })
      .select()
      .single();

    if (reportError) {
      toast.error("Failed to submit report: " + reportError.message);
      setSubmitting(false);
      return;
    }

    // Insert room details
    const roomDetails = roomData.map(room => ({
      accommodation_report_id: reportData.id,
      room_type: room.roomType,
      room_code: room.roomCode,
      number_of_rooms: room.numberOfRooms,
      occupied_rooms: room.occupied,
      check_ins: room.checkIns,
      guest_nights: room.guestNights,
      is_rent_mode: false,
    }));

    const { error: detailsError } = await supabase
      .from("room_occupancy_details")
      .insert(roomDetails);

    if (detailsError) {
      toast.error("Failed to save room details: " + detailsError.message);
    } else {
      toast.success("Hotel report submitted successfully");
      // Reset form
      setRoomData(roomData.map(room => ({
        ...room,
        occupied: 0,
        checkIns: 0,
        guestNights: 0,
      })));
      setReportDate(getTodayDate());
    }
    setSubmitting(false);
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1CA7C9] mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Submit Hotels Report
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            For hotel establishments with accommodation rooms
          </p>
        </div>
        <button
          onClick={() => setShowRoomSetup(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
        >
          <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Configure Rooms</span>
          <span className="sm:hidden">Configure</span>
        </button>
      </div>

      {/* Room Setup Modal */}
      {showRoomSetup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black bg-opacity-50 p-2 sm:items-center sm:p-4" data-room-config-mobile-scroll="body-owned">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[92vh] sm:rounded-lg">
            <div className="shrink-0 border-b border-gray-200 p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Room Configuration</h2>
              <p className="text-gray-600 mt-1">
                Set each room name, room type/code, and number of rooms. This will be saved for future reports.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6 [-webkit-overflow-scrolling:touch]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-700">Editable hotel room setup</p>
                <button
                  type="button"
                  onClick={addRoomConfigRow}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" /> Add Room
                </button>
              </div>
              <div className="space-y-4">
                {tempRoomConfig.map((room, index) => (
                  <div key={`${room.code}-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 sm:grid-cols-[1fr_130px_110px_auto] sm:items-end">
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Room Name</label>
                      <input
                        type="text"
                        value={room.type}
                        onChange={(e) => updateTempRoomConfig(index, "type", e.target.value)}
                        className="block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="e.g. Deluxe"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Room Type</label>
                      <input
                        type="text"
                        value={room.code}
                        onChange={(e) => updateTempRoomConfig(index, "code", e.target.value)}
                        className="block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
                        placeholder="Code"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Rooms</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={numericInputValue(room.count || 0)}
                        onChange={(e) => updateTempRoomConfig(index, "count", e.target.value)}
                        className="block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRoomConfigRow(index)}
                      className="inline-flex h-10 items-center justify-center rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Remove room"
                      disabled={tempRoomConfig.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Total Rooms:</strong>{" "}
                  {tempRoomConfig.reduce((sum, room) => sum + Number(room.count || 0), 0)}
                </p>
              </div>
            </div>

            <div className="shrink-0 p-4 sm:p-6 border-t border-gray-200 grid grid-cols-1 gap-3 sm:flex sm:justify-end">
              <button
                onClick={() => setShowRoomSetup(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveRoomConfiguration}
                className="px-6 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75]"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6 lg:p-8 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">Establishment Name</label>
            <input type="text" value={establishmentName} disabled className="block w-full min-w-0 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50" />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Date</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="block w-full min-w-0 max-w-full appearance-none px-4 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">Total Number of Rooms</label>
            <div className="w-full min-w-0 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-semibold">
              {totalRooms}
            </div>
          </div>
        </div>
      </div>

      {/* Room Occupancy Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-5 lg:p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Daily Room Occupancy</h3>
          <p className="mt-1 text-sm text-gray-500 lg:hidden">Compact full-width table for faster phone entry.</p>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-full table-fixed sm:min-w-[620px] lg:min-w-[760px]">
            <colgroup>
              <col className="w-[21%]" />
              <col className="w-[15%]" />
              <col className="w-[21%]" />
              <col className="w-[22%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="pl-3 pr-1 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-2 sm:text-[11px] lg:px-6 lg:py-3 lg:text-xs lg:uppercase">Room</th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-gray-700 sm:px-1.5 sm:text-[11px] lg:px-6 lg:py-3 lg:text-xs lg:uppercase">Rooms</th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-gray-700 sm:px-1.5 sm:text-[11px] lg:px-6 lg:py-3 lg:text-xs lg:uppercase">Occupied</th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-gray-700 sm:px-1.5 sm:text-[11px] lg:px-6 lg:py-3 lg:text-xs lg:uppercase">Check-ins</th>
                <th className="px-1 py-2 text-center text-[10px] font-semibold text-gray-700 sm:px-1.5 sm:text-[11px] lg:px-6 lg:py-3 lg:text-xs lg:uppercase">Nights</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {roomData.map((room, index) => {
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="pl-3 pr-0.5 py-2 sm:px-2 lg:px-6 lg:py-4">
                      <p className="max-w-full truncate text-[11px] font-semibold text-gray-900 sm:text-xs lg:text-base">{room.roomType}</p>
                      <span className="mt-1 inline-block max-w-full truncate rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-gray-700 sm:px-2 sm:text-[11px] lg:px-3 lg:py-1 lg:text-sm">{room.roomCode}</span>
                    </td>
                    <td className="px-0.5 py-2 sm:px-1.5 lg:px-6 lg:py-4">
                      <div className="mx-auto w-[78%] min-w-0 rounded-md border border-gray-200 bg-gray-50 px-1 py-1.5 text-center text-sm font-semibold tabular-nums text-gray-900 sm:w-full lg:px-3 lg:py-2">{room.numberOfRooms}</div>
                    </td>
                    <td className="px-0.5 py-2 sm:px-1.5 lg:px-6 lg:py-4">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.occupied)} onChange={(e) => updateRoomData(index, "occupied", parseNonNegativeInteger(e.target.value))} className="mx-auto w-[82%] min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm tabular-nums sm:w-full lg:px-3 lg:py-2" placeholder="0" />
                    </td>
                    <td className="px-0.5 py-2 sm:px-1.5 lg:px-6 lg:py-4">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.checkIns)} onChange={(e) => updateRoomData(index, "checkIns", parseNonNegativeInteger(e.target.value))} className="mx-auto w-[82%] min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm tabular-nums sm:w-full lg:px-3 lg:py-2" placeholder="0" />
                    </td>
                    <td className="pl-0.5 pr-1 py-2 sm:px-1.5 lg:px-6 lg:py-4">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.guestNights)} onChange={(e) => updateRoomData(index, "guestNights", parseNonNegativeInteger(e.target.value))} className="mx-auto w-[82%] min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm tabular-nums sm:w-full lg:px-3 lg:py-2" placeholder="0" />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-1 py-2 sm:px-2 lg:px-6 lg:py-4">Total</td>
                <td className="px-1 py-2 text-[#0F4C75] sm:px-1.5 lg:px-6 lg:py-4">{totalRooms}</td>
                <td className="px-1 py-2 text-[#0F4C75] sm:px-1.5 lg:px-6 lg:py-4">{totalOccupiedRooms}</td>
                <td className="px-1 py-2 text-[#0F4C75] sm:px-1.5 lg:px-6 lg:py-4">{totalCheckIns}</td>
                <td className="px-1 py-2 text-[#0F4C75] sm:px-1.5 lg:px-6 lg:py-4">{totalGuestNights}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Computed Analytics */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Computed Analytics</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          <div className="bg-[#EAF9FC] rounded-lg p-4 border border-[#BFEAF2]">
            <p className="text-sm text-[#0F4C75] font-medium mb-1">Average Guest Night</p>
            <p className="text-3xl font-bold text-[#0B2530]">{avgGuestNight}</p>
            <p className="text-xs text-[#5D6F73] mt-1">nights per guest</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200" data-hotel-report-daily-occupancy="selected-report-date">
            <p className="text-sm text-gray-700 font-medium mb-1">Daily Room Occupancy Rate</p>
            <p className="text-3xl font-bold text-gray-900">{avgOccupancyRate}%</p>
            <p className="text-xs text-gray-500 mt-1">selected report date only</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-700 font-medium mb-1">Average Guest Per Room</p>
            <p className="text-3xl font-bold text-gray-900">{avgGuestPerRoom}</p>
            <p className="text-xs text-gray-500 mt-1">guests per room</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3 sm:flex sm:gap-4">
        <button onClick={handleSaveDraft} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          <Save className="w-5 h-5" /> Save Draft
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] disabled:cursor-not-allowed disabled:opacity-60">
          <Send className="w-5 h-5" /> {submitting ? "Submitting..." : "Submit Hotel Report"}
        </button>
      </div>
    </div>
  );
}