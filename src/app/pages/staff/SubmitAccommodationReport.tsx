import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Save, Send, Settings, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport } from "../../../lib/establishmentReportForms";
import { DEFAULT_ROOM_CONFIG, getRoomConfigFromAmenities, normalizeRoomConfig, setRoomConfigInAmenities, type EstablishmentRoomConfig } from "../../../lib/establishmentRoomConfig";
import { useDialogFocus } from "../../../hooks/useDialogFocus";

interface RoomOccupancy {
  roomType: string;
  roomCode: string;
  numberOfRooms: number;
  occupied: number;
  continuingGuests: number;
  checkIns: number;
  guestNights: number;
  previousNewGuests?: number;
  previousGuestNights?: number;
  isNewGuest?: boolean;
}

const parseNonNegativeInteger = (value: string) => {
  if (value.trim() === "") return 0;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const numericInputValue = (value: number) => (value === 0 ? "" : String(value));
const getGeneratedRoomNumber = (roomCode: string) => roomCode.match(/-(\d+)$/)?.[1] || roomCode;
const getBaseRoomCode = (roomCode: string) => roomCode.replace(/-\d+$/, "");

export default function SubmitAccommodationReport() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [establishmentName, setEstablishmentName] = useState("Loading...");
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const roomSetupTriggerRef = useRef<HTMLButtonElement>(null);
  const roomDialogRef = useRef<HTMLDivElement>(null);
  const [tempRoomConfig, setTempRoomConfig] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [roomTypes, setRoomTypes] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [establishmentAmenities, setEstablishmentAmenities] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const submissionKeyRef = useRef(crypto.randomUUID());

  const draftStorageKey = (userId?: string, establishmentId?: string) =>
    userId && establishmentId ? `accommodationReportDraft:${userId}:${establishmentId}` : null;

  const loadDraft = (userId: string, establishmentId: string, rooms: EstablishmentRoomConfig[]) => {
    const key = draftStorageKey(userId, establishmentId);
    if (!key) return;

    const saved = localStorage.getItem(key);
    if (!saved) return;

    try {
      const draft = JSON.parse(saved) as { reportDate?: string; roomData?: RoomOccupancy[] };
      if (!Array.isArray(draft.roomData) || draft.roomData.length === 0) return;

      const validRooms = draft.roomData.filter((room) =>
        room && typeof room.roomType === "string" && typeof room.roomCode === "string" &&
        [room.numberOfRooms, room.occupied, room.checkIns, room.guestNights, room.continuingGuests ?? 0]
          .every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
      );
      if (validRooms.length === 0) return;

      const savedByCode = new Map(validRooms.map((room) => [room.roomCode, room]));
      const authoritativeRoomData = buildRoomData(rooms).map((room) => {
        const savedRoom = savedByCode.get(room.roomCode);
        return savedRoom
          ? {
              ...room,
              ...savedRoom,
              roomType: room.roomType,
              roomCode: room.roomCode,
              numberOfRooms: 1,
              occupied: 0,
              continuingGuests: Number(savedRoom.continuingGuests ?? 0) || 0,
              checkIns: Number(savedRoom.checkIns) || 0,
              guestNights: (Number(savedRoom.continuingGuests) || 0) + (Number(savedRoom.checkIns) || 0),
              previousNewGuests: Math.max(0, Number(savedRoom.previousNewGuests) || 0),
              previousGuestNights: Math.max(0, Number(savedRoom.previousGuestNights) || 0),
              isNewGuest: Boolean(savedRoom.isNewGuest),
            }
          : room;
      });

      setRoomData(authoritativeRoomData);
      if (draft.reportDate) setReportDate(draft.reportDate);
      toast.success("Saved accommodation draft restored");
    } catch {
      localStorage.removeItem(key);
    }
  };

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useDialogFocus(showRoomSetup, roomDialogRef, () => setShowRoomSetup(false));

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
      .select('name,type,reporting_mode,total_rooms,amenities')
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
    const effectiveRoomConfig = expandRoomConfig(normalizeRoomConfig(officerRoomConfig));
    setRoomTypes(effectiveRoomConfig);
    setTempRoomConfig(effectiveRoomConfig);
    const previousNightRoomData = await loadPreviousNightGuests(
      profileData.establishment_id,
      getPreviousDate(reportDate),
      effectiveRoomConfig
    );
    setRoomData(previousNightRoomData);
    loadDraft(profileData.id, profileData.establishment_id, effectiveRoomConfig);

    setLoadingProfile(false);
  };

  const expandRoomConfig = (rooms: EstablishmentRoomConfig[]) => {
    let nextRoomNumber = 1;
    return rooms.flatMap((room) => {
      const count = Math.max(0, room.count || 0);
      return Array.from({ length: count }, () => ({
        type: String(nextRoomNumber++),
        code: room.code,
        count: 1,
      }));
    });
  };

  const buildRoomData = (rooms = roomTypes) =>
    rooms.map((room) => ({
      roomType: room.code,
      roomCode: `${room.code}-${room.type}`,
      numberOfRooms: 1,
      occupied: 0,
      continuingGuests: 0,
      checkIns: 0,
      guestNights: 0,
      isNewGuest: false,
    }));

  const getPreviousDate = (date: string) => {
    const previous = new Date(`${date}T00:00:00`);
    previous.setDate(previous.getDate() - 1);
    return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
  };

  const loadPreviousNightGuests = async (
    establishmentId: string,
    previousDate: string,
    rooms: EstablishmentRoomConfig[],
  ): Promise<RoomOccupancy[]> => {
    const empty = buildRoomData(rooms);

    const { data: previousReport, error: previousReportError } = await supabase
      .from("accommodation_reports")
      .select("id,created_at")
      .eq("establishment_id", establishmentId)
      .eq("report_date", previousDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousReportError || !previousReport?.id) {
      if (previousReportError) console.error("Could not load previous accommodation report:", previousReportError);
      return empty;
    }

    const { data: previousDetails, error: previousDetailsError } = await supabase
      .from("room_occupancy_details")
      .select("room_code,guest_nights,check_ins,occupied_rooms")
      .eq("accommodation_report_id", previousReport.id);

    if (previousDetailsError) {
      console.error("Could not load previous room occupancy details:", previousDetailsError);
      return empty;
    }

    const byCode = new Map((previousDetails || []).map((detail) => [
      String(detail.room_code || "").trim().toUpperCase(),
      {
        guests: Math.max(0, Number(detail.guest_nights) || 0),
        newGuests: Math.max(0, Number(detail.check_ins) || 0),
        occupied: Math.max(0, Number(detail.occupied_rooms) || 0),
      },
    ]));

    return empty.map((room) => {
      const normalizedRoomCode = room.roomCode.trim().toUpperCase();
      const baseCode = normalizedRoomCode.replace(/-\d+$/, "");
      const previous = byCode.get(normalizedRoomCode) || (normalizedRoomCode.endsWith("-1") ? byCode.get(baseCode) : undefined);
      return {
        ...room,
        continuingGuests: previous?.guests || 0,
        previousNewGuests: Math.min(previous?.newGuests || 0, previous?.guests || 0),
        previousGuestNights: previous?.guests || 0,
        isNewGuest: false,
        guestNights: previous?.guests || 0,
        occupied: Math.min(previous?.occupied || 0, room.numberOfRooms),
      };
    });
  };

  const handleReportDateChange = async (date: string) => {
    setReportDate(date);
    if (!profile?.establishment_id || !date || roomTypes.length === 0) return;

    const nextRoomData = await loadPreviousNightGuests(
      profile.establishment_id,
      getPreviousDate(date),
      roomTypes,
    );
    setRoomData(nextRoomData);
  };

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
    setTempRoomConfig((rooms) => {
      const nextRoomNumber = rooms.reduce((max, room) => Math.max(max, Number.parseInt(room.type, 10) || 0), 0) + 1;
      return [...rooms, { type: String(nextRoomNumber), code: "", count: 1 }];
    });
  };

  const removeRoomConfigRow = (index: number) => {
    setTempRoomConfig((rooms) => (rooms.length > 1 ? rooms.filter((_, i) => i !== index) : rooms));
  };

  const saveRoomConfiguration = async () => {
    const hasMissingCode = tempRoomConfig.some((room) => !String(room.code || "").trim());
    const config = normalizeRoomConfig(tempRoomConfig).map((room) => ({ ...room, count: 1 }));
    const duplicatedName = config.find((room, index) => config.some((other, otherIndex) => otherIndex !== index && other.type === room.type));

    if (hasMissingCode) {
      const missingRoom = tempRoomConfig.find((room) => !String(room.code || "").trim());
      toast.error(`Enter a room type code for room ${missingRoom?.type || "this room"}.`);
      return;
    }

    if (duplicatedName) {
      toast.error(`Room name ${duplicatedName.type} is duplicated. Please use a unique room name.`);
      return;
    }

    const nextTotalRooms = config.length;
    const nextAmenities = setRoomConfigInAmenities(establishmentAmenities, config);

    if (profile?.establishment_id) {
      const { error } = await supabase.rpc('staff_update_room_configuration', {
        p_establishment_id: profile.establishment_id,
        p_amenities: nextAmenities,
        p_total_rooms: nextTotalRooms,
      });

      if (error) {
        toast.error("Could not save room configuration to the establishment record: " + error.message);
        return;
      }

      setEstablishmentAmenities(nextAmenities);
    }

    setRoomTypes(config);
    setTempRoomConfig(config);
    setRoomData(
      buildRoomData(config).map((room) => {
        const existing = roomData.find((currentRoom) => currentRoom.roomCode === room.roomCode);
        return existing ? { ...room, ...existing, numberOfRooms: 1 } : room;
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

          if (field === "checkIns" || field === "continuingGuests") {
            updatedRoom.guestNights = Number(updatedRoom.continuingGuests || 0) + Number(updatedRoom.checkIns || 0);
          }

          return updatedRoom;
        }
        return room;
      })
    );
  };

  const updateSingleGuestValue = (index: number, value: number) => {
    setRoomData(roomData.map((room, i) => {
      if (i !== index) return room;
      const autoMarkAsNewGuest = Number(room.previousGuestNights || 0) === 0 && value > 0;
      const nextIsNewGuest = autoMarkAsNewGuest || room.isNewGuest;
      const updatedRoom = nextIsNewGuest
        ? { ...room, checkIns: value, isNewGuest: nextIsNewGuest }
        : { ...room, continuingGuests: value };
      return { ...updatedRoom, guestNights: Number(updatedRoom.continuingGuests || 0) + Number(updatedRoom.checkIns || 0) };
    }));
  };

  const toggleGuestType = (index: number) => {
    setRoomData(roomData.map((room, i) => {
      if (i !== index) return room;
      const nextIsNewGuest = !room.isNewGuest;
      const currentValue = room.isNewGuest ? room.checkIns : room.continuingGuests;
      return {
        ...room,
        continuingGuests: nextIsNewGuest ? 0 : currentValue,
        checkIns: nextIsNewGuest ? currentValue : 0,
        isNewGuest: nextIsNewGuest,
        guestNights: currentValue,
      };
    }));
  };

  const getAutomaticallyOccupiedRooms = (room: RoomOccupancy) => room.guestNights > 0 ? 1 : 0;

  const totalOccupiedRooms = roomData.reduce(
    (sum, r) => sum + getAutomaticallyOccupiedRooms(r),
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
    const key = draftStorageKey(profile?.id, profile?.establishment_id);
    if (!key) {
      toast.error("Your account is not ready to save a draft");
      return;
    }

    const draft = {
      version: 1,
      reportDate,
      roomData,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
    toast.success("Draft saved on this device and will be restored after you sign in again");
  };

  const handleSubmit = async () => {
    if (!profile?.establishment_id) {
      toast.error("No establishment associated with your account");
      return;
    }

    const selectedDate = new Date(`${reportDate}T00:00:00`);
    if (!reportDate || Number.isNaN(selectedDate.getTime())) {
      toast.error("Please enter a valid report date");
      return;
    }

    if (totalRooms === 0) {
      toast.error("Please configure rooms first");
      return;
    }


    const roomCodes = new Set<string>();
    const invalidRoom = roomData.find((room) => {
      const roomCode = String(room.roomCode || "").trim();
      const rooms = Number(room.numberOfRooms || 0);
      const occupied = Number(getAutomaticallyOccupiedRooms(room) || 0);
      const checkIns = Number(room.checkIns || 0);
      const guestNights = Number(room.guestNights || 0);
      if (!roomCode || roomCodes.has(roomCode)) return true;
      roomCodes.add(roomCode);
      return rooms <= 0 || occupied < 0 || occupied > rooms || checkIns < 0 || guestNights < checkIns;
    });
    if (invalidRoom) {
      toast.error("Each room must have a unique code, valid room count, and consistent occupancy values");
      return;
    }

    setSubmitting(true);

    try {
      const { error: submitError } = await supabase.rpc("staff_submit_accommodation_report", {
        p_establishment_id: profile.establishment_id,
        p_report_date: reportDate,
        p_total_rooms: totalRooms,
        p_total_occupied_rooms: totalOccupiedRooms,
        p_total_check_ins: totalCheckIns,
        p_total_guest_nights: totalGuestNights,
        p_rooms_occupied: totalOccupiedRooms,
        p_guest_check_ins: totalCheckIns,
        p_guest_nights: totalGuestNights,
        p_room_details: roomData.map((room) => ({
          room_type: room.roomType,
          room_code: room.roomCode,
          number_of_rooms: room.numberOfRooms,
          occupied_rooms: getAutomaticallyOccupiedRooms(room),
          check_ins: room.checkIns,
          guest_nights: room.guestNights,
          is_rent_mode: false,
        })),
        p_idempotency_key: submissionKeyRef.current,
      });

      if (submitError) {
        toast.error("Failed to submit report: " + submitError.message);
      } else {
        toast.success("Hotel report submitted successfully");
        const draftKey = draftStorageKey(profile.id, profile.establishment_id);
        if (draftKey) localStorage.removeItem(draftKey);
        submissionKeyRef.current = crypto.randomUUID();
        setRoomData(roomData.map((room) => ({
          ...room,
          occupied: 0,
          continuingGuests: 0,
          checkIns: 0,
          guestNights: 0,
        })));
        setReportDate(getTodayDate());
      }
    } catch (submitException) {
      console.error("Accommodation report submission failed", submitException);
      toast.error("Failed to submit report. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
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
            className="px-4 py-2 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0F4C75] transition"
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
              Digital DAE-1A
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Daily accommodation source record for MCTAO reporting
            </p>
        </div>
        <button
          ref={roomSetupTriggerRef}
          type="button"
          aria-label="Configure Rooms"
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
        <div ref={roomDialogRef} className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black bg-opacity-50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="room-configuration-title" tabIndex={-1} data-room-config-mobile-scroll="body-owned">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[92vh] sm:rounded-lg">
            <div className="shrink-0 border-b border-gray-200 p-4 sm:p-6">
              <h2 id="room-configuration-title" className="text-xl sm:text-2xl font-bold text-gray-900">Room Configuration</h2>
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
                  <div key={`room-config-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Room Name</label>
                      <input
                        type="text"
                        value={room.type}
                        onChange={(e) => updateTempRoomConfig(index, "type", e.target.value)}
                        className="block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="1"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Room Type Code</label>
                      <input
                        type="text"
                        value={room.code}
                        onChange={(e) => updateTempRoomConfig(index, "code", e.target.value)}
                        className="block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
                        placeholder="D = Deluxe"
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
                className="px-6 py-2 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0F4C75]"
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
            <input type="date" value={reportDate} onChange={(e) => void handleReportDateChange(e.target.value)} className="block w-full min-w-0 max-w-full appearance-none px-4 py-2 border border-gray-300 rounded-lg" />
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
          <p className="mt-2 text-sm text-gray-600">Each room uses one guest value. Double-click the current value to mark it as a new guest; leave it normal for continuing guests.</p>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-0 table-fixed border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 z-10 w-[34%] border-r border-gray-200 bg-gray-50 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-gray-700 sm:px-3 sm:py-3 sm:text-xs">Room / Code</th>
                <th className="w-[33%] border-r border-gray-200 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-gray-700 sm:px-3 sm:py-3 sm:text-xs">Previous Date<div className="mt-1 text-[9px] font-normal normal-case text-gray-500 sm:text-[10px]">{getPreviousDate(reportDate)}</div></th>
                <th className="w-[33%] px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-[#0F4C75] sm:px-3 sm:py-3 sm:text-xs">Current Date<div className="mt-1 text-[9px] font-normal normal-case text-gray-500 sm:text-[10px]">{reportDate}</div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {roomData.map((room, index) => {
                  const previousTotal = room.previousGuestNights || 0;
                  const previousNew = Math.min(room.previousNewGuests || 0, previousTotal);
                  return (
                    <tr key={index} className="bg-white">
                      <th className="sticky left-0 z-10 border-r border-gray-200 bg-white px-1.5 py-2 text-center sm:px-3 sm:py-3">
                        <div className="truncate text-xs font-semibold text-gray-900 sm:text-sm">Room {getGeneratedRoomNumber(room.roomCode)}</div>
                        <div className="mt-0.5 inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] font-normal text-gray-600 sm:mt-1 sm:px-2 sm:text-[10px]">{getBaseRoomCode(room.roomCode)}</div>
                      </th>
                      <td className="border-r border-gray-200 px-1.5 py-2 text-center sm:px-3 sm:py-3">
                        <span className={previousNew > 0 ? "inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-red-500 px-2 text-sm font-normal tabular-nums text-red-600" : "text-sm font-normal tabular-nums text-gray-700"} aria-label={`${room.roomType} previous date guest value`}>{previousTotal}</span>
                      </td>
                      <td className="bg-blue-50/30 px-1.5 py-1.5 text-center sm:px-3 sm:py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={numericInputValue(room.isNewGuest ? room.checkIns : room.continuingGuests)}
                      onChange={(e) => updateSingleGuestValue(index, parseNonNegativeInteger(e.target.value))}
                      onDoubleClick={() => toggleGuestType(index)}
                      className={room.isNewGuest ? "mx-auto w-full max-w-[150px] rounded-full border-2 border-red-500 bg-white px-2 py-2 text-center text-sm font-normal tabular-nums text-red-600" : "mx-auto w-full max-w-[150px] rounded-md border border-gray-300 bg-white px-2 py-2 text-center text-sm font-normal tabular-nums text-gray-700"}
                      placeholder="0"
                      title="Double-click to switch between continuing and new guest"
                      aria-label={`${room.roomType} current ${room.isNewGuest ? "new" : "continuing"} guest value. Double-click to switch type.`}
                    />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Computed Analytics */}
      <div className="rounded-lg border border-[#AFB3B5]/45 bg-[#F5F8FF] p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Computed Analytics</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-6">
          <div className="rounded-lg border border-[#B88A52]/35 bg-[#FBE7BA] p-2 sm:p-4">
            <p className="mb-1 text-[10px] font-medium text-[#193364] sm:text-sm">Average Guest Night</p>
            <p className="text-xl font-bold text-[#193364] sm:text-3xl">{avgGuestNight}</p>
            <p className="mt-1 text-[9px] text-[#5D6F73] sm:text-xs">nights per guest</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-4 border border-gray-200" data-hotel-report-daily-occupancy="selected-report-date">
            <p className="text-[10px] sm:text-sm text-gray-700 font-medium mb-1">Daily Room Occupancy Rate</p>
            <p className="text-xl sm:text-3xl font-bold text-gray-900">{avgOccupancyRate}%</p>
            <p className="text-[9px] sm:text-xs text-gray-500 mt-1">selected report date only</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-4 border border-gray-200">
            <p className="text-[10px] sm:text-sm text-gray-700 font-medium mb-1">Average Guest Per Room</p>
            <p className="text-xl sm:text-3xl font-bold text-gray-900">{avgGuestPerRoom}</p>
            <p className="text-[9px] sm:text-xs text-gray-500 mt-1">guests per room</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3 sm:flex sm:gap-4">
        <button onClick={handleSaveDraft} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          <Save className="w-5 h-5" /> Save Draft
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0F4C75] disabled:cursor-not-allowed disabled:opacity-60">
          <Send className="w-5 h-5" /> {submitting ? "Submitting..." : "Submit Hotel Report"}
        </button>
      </div>
    </div>
  );
}