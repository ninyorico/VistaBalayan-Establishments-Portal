import { useState, useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Save, Send, AlertTriangle, Plus, Trash2, CircleHelp, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";

import { canSubmitAccommodationReport } from "../../../lib/establishmentReportForms";
import { DEFAULT_ROOM_CONFIG, getRoomConfigFromAmenities, normalizeRoomConfig, setRoomConfigInAmenities, type EstablishmentRoomConfig } from "../../../lib/establishmentRoomConfig";
import { useDialogFocus } from "../../../hooks/useDialogFocus";
import { LoadingState, PageHero } from "../../components/vista/PolishedShell";

interface RoomOccupancy {
  roomType: string;
  roomCode: string;
  numberOfRooms: number;
  occupied: number;
  continuingGuests: number;
  checkIns: number;
  shortStayCheckIns: number;
  guestNights: number;
  previousNewGuests?: number;
  previousGuestNights?: number;
  isNewGuest?: boolean;
}

type AccommodationFormMode = "single" | "old-new";

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
  const [retrievingPreviousData, setRetrievingPreviousData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [establishmentName, setEstablishmentName] = useState("Loading...");
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [showFormHelp, setShowFormHelp] = useState(false);
  const [reportFormMode, setReportFormMode] = useState<AccommodationFormMode>("single");
  const [tempReportFormMode, setTempReportFormMode] = useState<AccommodationFormMode>("single");
  const [roomsToAdd, setRoomsToAdd] = useState("1");

  const roomDialogRef = useRef<HTMLDivElement>(null);
  const formHelpDialogRef = useRef<HTMLDivElement>(null);
  const [tempRoomConfig, setTempRoomConfig] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [roomTypes, setRoomTypes] = useState<EstablishmentRoomConfig[]>(DEFAULT_ROOM_CONFIG);
  const [establishmentAmenities, setEstablishmentAmenities] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const submissionKeyRef = useRef(crypto.randomUUID());
  const lastGuestFieldTapRef = useRef(new Map<string, number>());
  const lastGuestFieldToggleRef = useRef(new Map<string, number>());

  const draftStorageKey = (userId?: string, establishmentId?: string) =>
    userId && establishmentId ? `accommodationReportDraft:${userId}:${establishmentId}` : null;

  const formModeStorageKey = (userId: string, establishmentId: string) =>
    `accommodationReportFormMode:${userId}:${establishmentId}`;

  const loadDraft = (userId: string, establishmentId: string, rooms: EstablishmentRoomConfig[]): string | null => {
    const key = draftStorageKey(userId, establishmentId);
    if (!key) return null;

    const saved = localStorage.getItem(key);
    if (!saved) return null;

    try {
      const draft = JSON.parse(saved) as { reportDate?: string; draftedDate?: string; roomData?: RoomOccupancy[] };
      if (!Array.isArray(draft.roomData) || draft.roomData.length === 0) return null;

      const validRooms = draft.roomData.filter((room) =>
        room && typeof room.roomType === "string" && typeof room.roomCode === "string" &&
        [room.numberOfRooms, room.occupied, room.checkIns, room.guestNights, room.continuingGuests ?? 0]
          .every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
      );
      if (validRooms.length === 0) return null;

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
              shortStayCheckIns: Number(savedRoom.shortStayCheckIns) || 0,
              guestNights: (Number(savedRoom.continuingGuests) || 0) + (Number(savedRoom.checkIns) || 0) + (Number(savedRoom.shortStayCheckIns) || 0),
              previousNewGuests: Math.max(0, Number(savedRoom.previousNewGuests) || 0),
              previousGuestNights: Math.max(0, Number(savedRoom.previousGuestNights) || 0),
              isNewGuest: Boolean(savedRoom.isNewGuest),
            }
          : room;
      });

      setRoomData(authoritativeRoomData);
      if (draft.reportDate) setReportDate(draft.reportDate);
      toast.success("Saved accommodation draft restored");
      return draft.reportDate || null;
    } catch {
      localStorage.removeItem(key);
      return null;
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
  useDialogFocus(showFormHelp, formHelpDialogRef, () => setShowFormHelp(false));

  useEffect(() => {
    if (!showRoomSetup && !showFormHelp) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [showRoomSetup, showFormHelp]);

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
      toast.error("This establishment is assigned to day-tour reports only.");
      navigate("/staff", { replace: true });
      return;
    }

    setEstablishmentAmenities(typeof est.amenities === "string" ? est.amenities : "");
    const savedFormMode = localStorage.getItem(formModeStorageKey(profileData.id, profileData.establishment_id));
    const effectiveFormMode: AccommodationFormMode = savedFormMode === "old-new" ? "old-new" : "single";
    setReportFormMode(effectiveFormMode);
    setTempReportFormMode(effectiveFormMode);
    const officerRoomConfig = getRoomConfigFromAmenities(est.amenities);
    const effectiveRoomConfig = expandRoomConfig(normalizeRoomConfig(officerRoomConfig));
    setRoomTypes(effectiveRoomConfig);
    setTempRoomConfig(effectiveRoomConfig);
    const draftReportDate = loadDraft(profileData.id, profileData.establishment_id, effectiveRoomConfig);
    const retrievalDate = draftReportDate || reportDate;
    setRetrievingPreviousData(true);
    let submittedRoomData: RoomOccupancy[] | null = null;
    try {
      submittedRoomData = await loadSubmittedReportForDate(
        profileData.establishment_id,
        retrievalDate,
        effectiveRoomConfig,
      );
      if (submittedRoomData) {
        setRoomData(await loadPreviousNightGuests(
          profileData.establishment_id,
          getPreviousDate(retrievalDate),
          effectiveRoomConfig,
          submittedRoomData,
        ));
      } else if (!draftReportDate) {
        setRoomData(await loadPreviousNightGuests(
          profileData.establishment_id,
          getPreviousDate(retrievalDate),
          effectiveRoomConfig
        ));
      }
    } finally {
      setRetrievingPreviousData(false);
    }

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
      shortStayCheckIns: 0,
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
    baseRoomData?: RoomOccupancy[],
  ): Promise<RoomOccupancy[]> => {
    const empty = baseRoomData || buildRoomData(rooms);

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
      .select("room_code,guest_nights,check_ins,short_stay_check_ins,room_usage_count,occupied_rooms")
      .eq("accommodation_report_id", previousReport.id);

    if (previousDetailsError) {
      console.error("Could not load previous room occupancy details:", previousDetailsError);
      return empty;
    }

    const byCode = new Map<string, { guests: number; newGuests: number; shortStayCheckIns: number; occupied: number }>();
    (previousDetails || []).forEach((detail) => {
      const normalizedCode = String(detail.room_code || "").trim().toUpperCase();
      const shortStayCheckIns = Math.max(0, Number(detail.short_stay_check_ins) || 0);
      const overnightGuestNights = Math.max(0, (Number(detail.guest_nights) || 0) - shortStayCheckIns);
      const values = {
        guests: overnightGuestNights,
        newGuests: Math.max(0, Number(detail.check_ins) || 0),
        shortStayCheckIns: 0,
        occupied: Math.max(0, Number(detail.occupied_rooms) || 0),
      };
      if (!normalizedCode) return;
      byCode.set(normalizedCode, values);
      const roomNumber = normalizedCode.match(/-(\d+)$/)?.[1];
      if (roomNumber) byCode.set(`__room-number:${roomNumber}`, values);
    });

    return empty.map((room) => {
      const normalizedRoomCode = room.roomCode.trim().toUpperCase();
      const baseCode = normalizedRoomCode.replace(/-\d+$/, "");
      const roomNumber = normalizedRoomCode.match(/-(\d+)$/)?.[1];
      const previous = byCode.get(normalizedRoomCode)
        || byCode.get(`__room-number:${roomNumber || ""}`)
        || (normalizedRoomCode.endsWith("-1") ? byCode.get(baseCode) : undefined);
      const previousGuestNights = previous?.guests || 0;
      const previousNewGuests = Math.min(previous?.newGuests || 0, previousGuestNights);

      if (baseRoomData) {
        return {
          ...room,
          previousNewGuests,
          previousGuestNights,
        };
      }

      return {
        ...room,
        continuingGuests: previousGuestNights,
        shortStayCheckIns: previous?.shortStayCheckIns || 0,
        previousNewGuests,
        previousGuestNights,
        isNewGuest: false,
        guestNights: previousGuestNights,
        occupied: Math.min(previous?.occupied || 0, room.numberOfRooms),
      };
    });
  };

  const loadSubmittedReportForDate = async (
    establishmentId: string,
    date: string,
    rooms: EstablishmentRoomConfig[],
  ): Promise<RoomOccupancy[] | null> => {
    const { data: report, error: reportError } = await supabase
      .from("accommodation_reports")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("report_date", date)
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError || !report?.id) {
      if (reportError) console.error("Could not load submitted accommodation report:", reportError);
      return null;
    }

    const { data: details, error: detailsError } = await supabase
      .from("room_occupancy_details")
      .select("room_code,guest_nights,check_ins,short_stay_check_ins,occupied_rooms")
      .eq("accommodation_report_id", report.id);

    if (detailsError) {
      console.error("Could not load submitted room occupancy details:", detailsError);
      return null;
    }

    const byCode = new Map<string, any>();
    (details || []).forEach((detail) => {
      const normalizedCode = String(detail.room_code || "").trim().toUpperCase();
      if (!normalizedCode) return;
      byCode.set(normalizedCode, detail);
      const roomNumber = normalizedCode.match(/-(\d+)$/)?.[1];
      if (roomNumber) byCode.set(`__room-number:${roomNumber}`, detail);
    });

    return buildRoomData(rooms).map((room) => {
      const normalizedRoomCode = room.roomCode.trim().toUpperCase();
      const baseCode = normalizedRoomCode.replace(/-\d+$/, "");
      const roomNumber = normalizedRoomCode.match(/-(\d+)$/)?.[1];
      const detail = byCode.get(normalizedRoomCode)
        || byCode.get(`__room-number:${roomNumber || ""}`)
        || (normalizedRoomCode.endsWith("-1") ? byCode.get(baseCode) : undefined);
      const shortStayCheckIns = Math.max(0, Number(detail?.short_stay_check_ins) || 0);
      const overnightTotal = Math.max(0, (Number(detail?.guest_nights) || 0) - shortStayCheckIns);
      const checkIns = Math.max(0, Number(detail?.check_ins) || 0);
      const continuingGuests = Math.max(0, overnightTotal - checkIns);
      return {
        ...room,
        continuingGuests,
        checkIns,
        shortStayCheckIns,
        guestNights: overnightTotal + shortStayCheckIns,
        occupied: Math.min(Math.max(0, Number(detail?.occupied_rooms) || 0), room.numberOfRooms),
        isNewGuest: checkIns > 0 && continuingGuests === 0,
      };
    });
  };

  const handleReportDateChange = async (date: string) => {
    setReportDate(date);
    if (!profile?.establishment_id || !date || roomTypes.length === 0) return;

    setRetrievingPreviousData(true);
    try {
      const submittedRoomData = await loadSubmittedReportForDate(
        profile.establishment_id,
        date,
        roomTypes,
      );
      const nextRoomData = submittedRoomData
        ? await loadPreviousNightGuests(profile.establishment_id, getPreviousDate(date), roomTypes, submittedRoomData)
        : await loadPreviousNightGuests(
          profile.establishment_id,
          getPreviousDate(date),
          roomTypes,
        );
      setRoomData(nextRoomData);
    } finally {
      setRetrievingPreviousData(false);
    }
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

  const addRoomConfigRows = () => {
    const quantity = Math.min(100, Math.max(1, parseNonNegativeInteger(roomsToAdd)));
    setTempRoomConfig((rooms) => {
      const nextRoomNumber = rooms.reduce((max, room) => Math.max(max, Number.parseInt(room.type, 10) || 0), 0) + 1;
      return [
        ...rooms,
        ...Array.from({ length: quantity }, (_, index) => ({
          type: String(nextRoomNumber + index),
          code: "",
          count: 1,
        })),
      ];
    });
    setRoomsToAdd("1");
  };

  const removeRoomConfigRow = (index: number) => {
    setTempRoomConfig((rooms) => (rooms.length > 1 ? rooms.filter((_, i) => i !== index) : rooms));
  };

  const saveRoomConfiguration = async () => {
    const config = normalizeRoomConfig(tempRoomConfig.map((room) => ({
      ...room,
      code: String(room.code || room.type || "ROOM").trim().toUpperCase(),
    }))).map((room) => ({ ...room, count: 1 }));
    const duplicatedName = config.find((room, index) => config.some((other, otherIndex) => otherIndex !== index && other.type === room.type));

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

    if (profile?.id && profile.establishment_id) {
      localStorage.setItem(formModeStorageKey(profile.id, profile.establishment_id), tempReportFormMode);
    }
    setReportFormMode(tempReportFormMode);
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

          if (reportFormMode === "old-new" && (field === "checkIns" || field === "continuingGuests") && Number(numericValue) > 0) {
            if (field === "checkIns") updatedRoom.continuingGuests = 0;
            if (field === "continuingGuests") updatedRoom.checkIns = 0;
          }

          if (field === "shortStayCheckIns" && Number(numericValue) > 0) {
            updatedRoom.continuingGuests = 0;
            updatedRoom.checkIns = 0;
            updatedRoom.isNewGuest = false;
          }

          if (field === "checkIns" || field === "continuingGuests" || field === "shortStayCheckIns") {
            updatedRoom.guestNights = Number(updatedRoom.continuingGuests || 0) + Number(updatedRoom.checkIns || 0) + Number(updatedRoom.shortStayCheckIns || 0);
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
      if (value === 0) {
        return { ...room, continuingGuests: 0, checkIns: 0, guestNights: Number(room.shortStayCheckIns || 0), isNewGuest: false };
      }
      // Any positive current-date edit is an explicit new-guest entry.
      // This applies both when the previous day was blank and when an existing
      // continuing value is edited. Double-click remains the explicit type toggle.
      const updatedRoom = {
        ...room,
        continuingGuests: 0,
        checkIns: value,
        isNewGuest: true,
      };
      return { ...updatedRoom, guestNights: Number(updatedRoom.checkIns || 0) + Number(updatedRoom.shortStayCheckIns || 0) };
    }));
  };

  const toggleGuestType = (roomCode: string) => {
    setRoomData(roomData.map((room) => {
      if (room.roomCode !== roomCode) return room;
      const nextIsNewGuest = !room.isNewGuest;
      if (Number(room.shortStayCheckIns || 0) > 0 && room.isNewGuest && !nextIsNewGuest) {
        return room;
      }
      const currentValue = room.isNewGuest ? room.checkIns : room.continuingGuests;
      if (currentValue <= 0) {
        return {
          ...room,
          continuingGuests: 0,
          checkIns: 0,
          isNewGuest: false,
          guestNights: Number(room.shortStayCheckIns || 0),
        };
      }
      return {
        ...room,
        continuingGuests: nextIsNewGuest ? 0 : currentValue,
        checkIns: nextIsNewGuest ? currentValue : 0,
        isNewGuest: nextIsNewGuest,
        guestNights: currentValue + Number(room.shortStayCheckIns || 0),
      };
    }));
  };

  const toggleGuestTypeOnce = (roomCode: string) => {
    const now = Date.now();
    const lastToggle = lastGuestFieldToggleRef.current.get(roomCode);
    if (lastToggle !== undefined && now - lastToggle < 500) return;
    lastGuestFieldToggleRef.current.set(roomCode, now);
    toggleGuestType(roomCode);
  };

  const processGuestFieldPress = (event: { preventDefault: () => void; stopPropagation: () => void }, target: HTMLInputElement, roomCode: string) => {
    const now = Date.now();
    const lastTap = lastGuestFieldTapRef.current.get(roomCode);
    const isDoubleTap = lastTap !== undefined && now - lastTap <= 800;

    if (!isDoubleTap) {
      lastGuestFieldTapRef.current.set(roomCode, now);
      window.setTimeout(() => {
        if (lastGuestFieldTapRef.current.get(roomCode) === now) {
          lastGuestFieldTapRef.current.delete(roomCode);
        }
      }, 900);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    lastGuestFieldTapRef.current.delete(roomCode);
    target.setSelectionRange(0, 0);
    target.blur();
    toggleGuestTypeOnce(roomCode);
  };

  const handleGuestFieldPointerDownCapture = (event: PointerEvent<HTMLTableSectionElement>) => {
    if (event.pointerType === "touch") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const roomCode = target.dataset.guestRoomCode;
    if (roomCode) processGuestFieldPress(event, target, roomCode);
  };

  const handleGuestFieldTouchStartCapture = (event: TouchEvent<HTMLTableSectionElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const roomCode = target.dataset.guestRoomCode;
    if (roomCode) processGuestFieldPress(event, target, roomCode);
  };

  const handleGuestFieldDoubleClick = (event: MouseEvent<HTMLInputElement>, roomCode: string) => {
    event.preventDefault();
    event.stopPropagation();
    lastGuestFieldTapRef.current.delete(roomCode);
    event.currentTarget.setSelectionRange(0, 0);
    event.currentTarget.blur();
    toggleGuestTypeOnce(roomCode);
  };

  const getAutomaticallyOccupiedRooms = (room: RoomOccupancy) =>
    room.guestNights > 0 || room.shortStayCheckIns > 0 ? 1 : 0;

  const getRoomUsageCount = (room: RoomOccupancy) =>
    Number(room.continuingGuests || 0) +
    Number(room.checkIns || 0) +
    Number(room.shortStayCheckIns || 0);

  const totalOccupiedRooms = roomData.reduce(
    (sum, r) => sum + getAutomaticallyOccupiedRooms(r),
    0
  );
  const totalOvernightCheckIns = roomData.reduce(
    (sum, r) => sum + Number(r.checkIns || 0),
    0
  );
  const totalShortStayCheckIns = roomData.reduce(
    (sum, r) => sum + Number(r.shortStayCheckIns || 0),
    0
  );
  const totalCheckIns = totalOvernightCheckIns + totalShortStayCheckIns;
  const totalGuestNights = roomData.reduce(
    (sum, r) => sum + Number(r.guestNights || 0),
    0
  );
  const hasAccommodationEntries = roomData.some((room) =>
    Number(room.continuingGuests || 0) > 0
    || Number(room.checkIns || 0) > 0
    || Number(room.shortStayCheckIns || 0) > 0
    || Number(room.guestNights || 0) > 0
  );

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
      draftedDate: getTodayDate(),
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

    if (!hasAccommodationEntries) {
      toast.error("Please enter at least one guest value before submitting");
      return;
    }


    const roomCodes = new Set<string>();
    const invalidRoom = roomData.find((room) => {
      const roomCode = String(room.roomCode || "").trim();
      const rooms = Number(room.numberOfRooms || 0);
      const occupied = Number(getAutomaticallyOccupiedRooms(room) || 0);
      const checkIns = Number(room.checkIns || 0);
      const shortStayCheckIns = Number(room.shortStayCheckIns || 0);
      const guestNights = Number(room.guestNights || 0);
      if (!roomCode || roomCodes.has(roomCode)) return true;
      roomCodes.add(roomCode);
      return rooms <= 0 || occupied < 0 || occupied > rooms || checkIns < 0 || shortStayCheckIns < 0 || guestNights < checkIns + shortStayCheckIns;
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
        p_short_stay_check_ins: totalShortStayCheckIns,
        p_room_usage_count: totalCheckIns,
        p_total_guest_nights: totalGuestNights,
        p_rooms_occupied: totalOccupiedRooms,
        p_guest_check_ins: totalOvernightCheckIns,
        p_guest_nights: totalGuestNights,
        p_room_details: roomData.map((room) => ({
          room_type: room.roomType,
          room_code: room.roomCode,
          number_of_rooms: room.numberOfRooms,
          occupied_rooms: getAutomaticallyOccupiedRooms(room),
          check_ins: room.checkIns,
          short_stay_check_ins: room.shortStayCheckIns,
          room_usage_count: getRoomUsageCount(room),
          guest_nights: room.guestNights,
          is_rent_mode: false,
        })),
        p_idempotency_key: submissionKeyRef.current,
      });

      if (submitError) {
        toast.error("Failed to submit report: " + submitError.message);
      } else {
        toast.success("Accommodation report submitted successfully");
        const draftKey = draftStorageKey(profile.id, profile.establishment_id);
        if (draftKey) localStorage.removeItem(draftKey);
        submissionKeyRef.current = crypto.randomUUID();
        setRoomData(roomData.map((room) => ({
          ...room,
          occupied: 0,
          continuingGuests: 0,
          checkIns: 0,
          shortStayCheckIns: 0,
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
    return <LoadingState label="Loading your establishment information" />;
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
    <div className="space-y-4 pb-4 sm:space-y-6">
      <PageHero
        eyebrow="Daily reporting"
        title="Digital DAE-1A"
        description="Daily accommodation source record for MCTAO reporting."
        actionLabel="Configure Rooms"
        onAction={() => { setTempReportFormMode(reportFormMode); setShowRoomSetup(true); }}
        compact
      />

      {showFormHelp && createPortal((
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#193364]/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowFormHelp(false); }}>
          <section ref={formHelpDialogRef} className="my-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] bg-[#E0E5EC] text-[#193364] shadow-[12px_12px_24px_rgba(15,35,60,0.28),-8px_-8px_20px_rgba(255,255,255,0.5)] sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem]" role="dialog" aria-modal="true" aria-labelledby="accommodation-form-help-title" tabIndex={-1}>
            <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#C8D2DE] bg-[#E0E5EC]/95 p-4 backdrop-blur-sm sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0E5A72]">Form guide</p>
                <h2 id="accommodation-form-help-title" className="mt-1 text-2xl font-semibold tracking-tight">How to use this form</h2>
              </div>
              <button type="button" onClick={() => setShowFormHelp(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E0E5EC] text-[#193364] shadow-[4px_4px_8px_rgba(163,177,198,0.55),-4px_-4px_8px_rgba(255,255,255,0.65)] hover:text-[#0E5A72]" aria-label="Close accommodation form guide">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain p-4 text-justify text-sm leading-6 text-[#40505A] [-webkit-overflow-scrolling:touch] sm:p-6">
              <p>Enter the values for the selected report date. The form calculates occupied rooms, guest check-ins, and guest nights from the room entries; you do not need to calculate the totals manually.</p>

              {reportFormMode === "single" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Room / Code</h3>
                    <p className="mt-1">Identifies the room row. These values come from Room Configuration and are not daily visitor counts.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Previous Date</h3>
                    <p className="mt-1">Shows the previous report’s guest value for reference. It is read-only. A red circle means the previous value included a new guest.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Short-stay Check-ins</h3>
                    <p className="mt-1">Enter guests who used the room for a short stay on the selected date. This contributes to check-ins and guest nights.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Overnight</h3>
                    <p className="mt-1">Enter one overnight value per room. Single-click to edit; double-click the value to switch between continuing guest and new guest.</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Room / Code</h3>
                    <p className="mt-1">Identifies the room row. These values come from Room Configuration and are not daily visitor counts.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Previous-day guests</h3>
                    <p className="mt-1">Shows the previous report’s guest value for reference and is read-only. A red circle means the previous value included a new guest.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Short-stay</h3>
                    <p className="mt-1">Enter current-date short-stay check-ins for the room. These contribute to the room’s check-ins and guest nights.</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4">
                    <h3 className="font-semibold text-[#193364]">Overnight guests</h3>
                    <p className="mt-1">Enter continuing overnight guests in the continuing field and newly arriving overnight guests in the new arrivals field. This option keeps the two values separate, so no double-click is needed.</p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-900">
                <h3 className="font-semibold">What does the red marker mean?</h3>
                <p className="mt-1">A red circle or red-bordered value identifies a new guest value. It is an indicator of guest type, not an error or warning. A normal gray value represents a continuing guest value.</p>
              </div>

              <ul className="list-disc space-y-1 pl-5">
                <li>Use <strong>Save Draft</strong> to keep unfinished entries on this device.</li>
                <li>Use <strong>Submit Accommodation Report</strong> only after checking the selected date and room values.</li>
                <li>Use <strong>Configure Rooms</strong> when room names, codes, or room counts change.</li>
              </ul>
            </div>
          </section>
        </div>
      ), document.body)}

      {/* Room Setup Modal */}
      {showRoomSetup && (
        <div ref={roomDialogRef} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="room-configuration-title" tabIndex={-1} data-room-config-mobile-scroll="modal-owned">
          <div className="my-0 flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:my-4 sm:max-h-[92vh] sm:rounded-lg">
            <div className="shrink-0 border-b border-gray-200 p-4 sm:p-6">
              <h2 id="room-configuration-title" className="text-xl sm:text-2xl font-bold text-gray-900">Room Configuration</h2>
              <p className="text-gray-600 mt-1">
                Set each room name, room type/code, and number of rooms. This will be saved for future reports.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6 [-webkit-overflow-scrolling:touch]">
              <fieldset className="mb-5 rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,0.4),inset_-4px_-4px_8px_rgba(255,255,255,0.65)]">
                <legend className="text-sm font-semibold text-[#193364]">Choose accommodation report form</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-2xl p-3 transition ${tempReportFormMode === "single" ? "bg-[#F5F8FF] text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.4),inset_-3px_-3px_7px_rgba(255,255,255,0.65)]" : "text-[#6B7280]"}`}>
                    <input type="radio" name="accommodation-form-mode" value="single" checked={tempReportFormMode === "single"} onChange={() => setTempReportFormMode("single")} className="sr-only" />
                    <span className="block text-sm font-semibold">One guest value per room</span>
                    <span className="mt-1 block text-xs leading-5">Current form with double-click to switch continuing/new guest.</span>
                  </label>
                  <label className={`cursor-pointer rounded-2xl p-3 transition ${tempReportFormMode === "old-new" ? "bg-[#F5F8FF] text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.4),inset_-3px_-3px_7px_rgba(255,255,255,0.65)]" : "text-[#6B7280]"}`}>
                    <input type="radio" name="accommodation-form-mode" value="old-new" checked={tempReportFormMode === "old-new"} onChange={() => setTempReportFormMode("old-new")} className="sr-only" />
                    <span className="block text-sm font-semibold">Old and new guest fields</span>
                    <span className="mt-1 block text-xs leading-5">Separate continuing and new guest values; previous new guests are encircled.</span>
                  </label>
                </div>
              </fieldset>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-gray-700">Editable accommodation room setup</p>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-gray-600">
                  Rooms to add
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={roomsToAdd}
                    onChange={(e) => setRoomsToAdd(e.target.value)}
                    className="mt-1 block w-full min-w-16 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    aria-label="Number of rooms to add"
                  />
                </label>
                <button
                  type="button"
                  onClick={addRoomConfigRows}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" /> Add Rooms
                </button>
              </div>
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
                      <label className="mb-1 block text-sm font-medium text-gray-700">Room Type Code <span className="font-normal text-gray-500">(optional)</span></label>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6">
          <div className="hidden min-w-0 sm:block">
            <label className="mb-2 block text-[10px] font-medium leading-tight text-gray-700 sm:text-sm">Establishment Name</label>
            <input type="text" value={establishmentName} disabled className="block w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm sm:px-4" />
          </div>
          <div className="min-w-0">
            <label className="mb-2 block text-[10px] font-medium leading-tight text-gray-700 sm:text-sm">Report Date</label>
            <input type="date" value={reportDate} onChange={(e) => void handleReportDateChange(e.target.value)} className="block w-full min-w-0 max-w-full appearance-none rounded-lg border border-gray-300 px-2 py-2 text-sm sm:px-4" />
          </div>
          <div className="min-w-0">
            <label className="mb-2 block text-[10px] font-medium leading-tight text-gray-700 sm:text-sm">Total No. of Rooms</label>
            <div className="w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm font-semibold sm:px-4">
              {totalRooms}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:h-[calc(100dvh-10rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-stretch">
      {/* Room Occupancy Table */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:h-full">
        <div className="p-4 sm:p-5 lg:p-6 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Daily Room Occupancy</h3>
            <button type="button" onClick={() => setShowFormHelp(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#B8D2CF] bg-[#E0E5EC] text-[#0E5A72] shadow-[3px_3px_7px_rgba(163,177,198,0.45),-3px_-3px_7px_rgba(255,255,255,0.65)] hover:text-[#193364]" aria-label="Open accommodation form guide" title="How to use this form">
              <CircleHelp className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 lg:hidden">Compact full-width table for faster phone entry.</p>
          <p className="mt-2 text-sm text-gray-600">{reportFormMode === "single" ? "Double-click the current date value to switch between continuing and new guest; single-click to edit the value." : "Enter continuing guest and new guest values in their separate fields for the selected report date."}</p>

          {retrievingPreviousData && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#E0E5EC] px-4 py-3 text-sm text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.45),inset_-3px_-3px_7px_rgba(255,255,255,0.65)]" role="status" aria-live="polite">
              <div className="size-5 animate-spin rounded-full border-2 border-[#AFB3B5]/45 border-t-[#193364]" aria-hidden="true" />
              Retrieving previous-day room data...
            </div>
          )}
        </div>

        {reportFormMode === "old-new" && (
          <div className="min-h-0 flex-1 overflow-x-auto overscroll-x-contain lg:overflow-auto lg:overscroll-contain">
            <table className="w-full min-w-0 table-fixed border-collapse">
              <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50">
                <tr>
                  <th rowSpan={2} className="w-[26%] bg-gray-50 px-1 py-3 text-center align-middle text-[9px] font-semibold uppercase leading-tight text-gray-700 sm:w-[28%] sm:px-2 sm:text-xs">Room / Code</th>
                  <th rowSpan={2} className="w-[20%] bg-gray-50 px-1 py-3 text-center align-middle text-[9px] font-semibold uppercase leading-tight text-gray-700 sm:w-[24%] sm:px-2 sm:text-xs">Previous-day guests</th>
                  <th rowSpan={2} className="w-[20%] bg-gray-50 px-1 py-3 text-center align-middle text-[9px] font-semibold uppercase leading-tight text-[#0F4C75] sm:w-[18%] sm:px-2 sm:text-xs">Short-stay</th>
                  <th colSpan={2} className="w-[34%] bg-gray-50 px-1 py-2 text-center text-[9px] font-semibold uppercase leading-tight text-[#0F4C75] sm:w-[30%] sm:px-2 sm:text-xs">Overnight guests</th>
                </tr>
                <tr>
                  <th className="w-[17%] bg-gray-50 px-0.5 py-2 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-600 sm:w-[15%] sm:px-1 sm:text-[10px]"> <span className="sm:hidden">Cont.</span><span className="hidden sm:inline">Continuing</span></th>
                  <th className="w-[17%] bg-gray-50 px-0.5 py-2 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-600 sm:w-[15%] sm:px-1 sm:text-[10px]">New<span className="hidden sm:inline"> arrivals</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">{roomData.map((room, index) => { const previousTotal = Number(room.previousGuestNights || 0); const previousNew = Math.min(Number(room.previousNewGuests || 0), previousTotal); return (
                <tr key={room.roomCode} className="border-b border-gray-200 bg-white"><th className="px-1 py-3 text-center sm:px-2"><div className="text-[11px] font-semibold text-gray-900 sm:text-sm">Room {getGeneratedRoomNumber(room.roomCode)}</div><div className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] text-gray-600 sm:px-2 sm:text-[10px]">{getBaseRoomCode(room.roomCode)}</div></th><td className="px-1 py-2 text-center sm:px-2"><span className={previousNew > 0 ? "inline-flex h-8 min-w-8 items-center justify-center rounded-full border-[3px] border-red-600 px-2 text-sm font-bold tabular-nums text-red-700" : "inline-flex text-xs tabular-nums text-gray-700 sm:text-sm"} style={previousNew > 0 ? { borderColor: "#dc2626", borderWidth: "3px", borderStyle: "solid", borderRadius: "9999px" } : undefined} aria-label={`${room.roomType} previous day guest value${previousNew > 0 ? ", includes new guest" : ", continuing guest"}`}>{previousTotal}</span></td><td className="px-1 py-2 text-center sm:px-2"><input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.shortStayCheckIns)} onChange={(e) => updateRoomData(index, "shortStayCheckIns", parseNonNegativeInteger(e.target.value))} className="mx-auto w-full max-w-[100px] rounded-xl border border-gray-300 bg-white px-1.5 py-2 text-center text-xs tabular-nums text-[#193364] sm:px-2 sm:text-sm" aria-label={`${room.roomType} short-stay check-ins`} /></td><td colSpan={2} className="px-1 py-2 sm:px-2"><div className="grid grid-cols-2 gap-1 sm:gap-2"><label className="text-center text-[0px] font-medium uppercase leading-none text-gray-500">Continuing<input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.continuingGuests)} onChange={(e) => updateRoomData(index, "continuingGuests", parseNonNegativeInteger(e.target.value))} className="mt-0 w-full rounded-xl border-0 bg-[#E0E5EC] px-1.5 py-2 text-center text-xs tabular-nums text-[#193364] sm:px-2 sm:text-sm" aria-label={`${room.roomType} overnight continuing guest value`} /></label><label className="text-center text-[0px] font-medium uppercase leading-none text-gray-500">New arrivals<input type="text" inputMode="numeric" pattern="[0-9]*" value={numericInputValue(room.checkIns)} onChange={(e) => updateRoomData(index, "checkIns", parseNonNegativeInteger(e.target.value))} className="mt-0 w-full rounded-xl border-0 bg-[#FBE7BA] px-1.5 py-2 text-center text-xs tabular-nums text-[#193364] sm:px-2 sm:text-sm" aria-label={`${room.roomType} overnight new arrivals value`} /></label></div></td></tr>
              ); })}</tbody>
            </table>
          </div>
        )}

        {reportFormMode === "single" && (
        <div className="min-h-0 flex-1 overflow-x-auto overscroll-x-contain lg:overflow-auto lg:overscroll-contain">
          <table className="w-full min-w-0 table-fixed border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 top-0 z-30 w-1/4 border-r border-gray-200 bg-gray-50 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-gray-700 sm:px-3 sm:py-3 sm:text-xs">Room / Code</th>
                <th className="w-1/4 border-r border-gray-200 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-gray-700 sm:px-3 sm:py-3 sm:text-xs">Previous Date<div className="mt-1 text-[9px] font-normal normal-case text-gray-500 sm:text-[10px]">{getPreviousDate(reportDate)}</div></th>
                <th className="w-1/4 border-r border-gray-200 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-[#0F4C75] sm:px-3 sm:py-3 sm:text-xs">Short-stay<div className="mt-1 text-[9px] font-normal normal-case text-gray-500 sm:text-[10px]">Check-ins</div></th>
                <th className="w-1/4 px-1.5 py-2 text-center text-[10px] font-semibold uppercase leading-tight text-[#0F4C75] sm:px-3 sm:py-3 sm:text-xs">Overnight<div className="mt-1 text-[9px] font-normal normal-case text-gray-500 sm:text-[10px]">{reportDate}</div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200" onPointerDownCapture={handleGuestFieldPointerDownCapture} onTouchStartCapture={handleGuestFieldTouchStartCapture}>
              {roomData.map((room, index) => {
                  const previousTotal = room.previousGuestNights || 0;
                  const previousNew = Math.min(room.previousNewGuests || 0, previousTotal);
                  const currentGuestValue = Number(room.isNewGuest ? room.checkIns : room.continuingGuests) || 0;
                  const isActiveNewGuest = currentGuestValue > 0 && (room.isNewGuest === true || Number(room.shortStayCheckIns || 0) > 0);
                  return (
                    <tr key={room.roomCode} className="border-b border-gray-200 bg-white">
                      <th className="sticky left-0 z-10 border-r border-gray-200 bg-white px-1.5 py-2 text-center sm:px-3 sm:py-3">
                        <div className="truncate text-[11px] font-semibold text-gray-900 sm:text-sm">Room {getGeneratedRoomNumber(room.roomCode)}</div>
                        <div className="mt-0.5 inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] font-normal text-gray-600 sm:mt-1 sm:px-2 sm:text-[10px]">{getBaseRoomCode(room.roomCode)}</div>
                      </th>
                      <td className="border-r border-gray-200 px-1.5 py-2 text-center sm:px-3 sm:py-3">
                        <span className={previousNew > 0 ? "inline-flex h-8 min-w-8 items-center justify-center rounded-full border-[3px] border-red-600 px-2 text-sm font-bold tabular-nums text-red-700" : "text-xs tabular-nums text-gray-700 sm:text-sm"} style={previousNew > 0 ? { borderColor: "#dc2626", borderWidth: "3px", borderStyle: "solid", borderRadius: "9999px" } : undefined} aria-label={`${room.roomType} previous date guest value${previousNew > 0 ? ", includes new guest" : ", continuing guest"}`}>{previousTotal}</span>
                      </td>
                      <td className="px-1.5 py-1.5 text-center sm:px-3 sm:py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={numericInputValue(room.shortStayCheckIns)}
                          onChange={(e) => updateRoomData(index, "shortStayCheckIns", parseNonNegativeInteger(e.target.value))}
                          className="mx-auto w-full max-w-[80px] rounded-md border border-gray-300 bg-white px-1.5 py-2 text-center text-xs tabular-nums text-gray-700"
                          aria-label={`${room.roomType} short-stay check-ins`}
                        />
                      </td>
                      <td className="bg-blue-50/30 px-1.5 py-1.5 text-center sm:px-3 sm:py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={numericInputValue(currentGuestValue)}
                          onChange={(e) => updateSingleGuestValue(index, parseNonNegativeInteger(e.target.value))}
                          onDoubleClick={(e) => handleGuestFieldDoubleClick(e, room.roomCode)}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onSelectCapture={(e) => e.preventDefault()}
                          onSelect={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          draggable={false}
                          className={isActiveNewGuest ? "mx-auto w-full max-w-[150px] select-none rounded-full border-[3px] !border-red-600 bg-white px-2 py-2 text-center text-sm font-bold tabular-nums text-red-700" : "mx-auto w-full max-w-[150px] select-none rounded-md border border-gray-300 bg-white px-2 py-2 text-center text-xs tabular-nums text-gray-700 sm:text-sm"}
                          style={{
                            WebkitUserSelect: "none",
                            userSelect: "none",
                            WebkitTouchCallout: "none",
                            ...(isActiveNewGuest ? { color: "#b91c1c", borderColor: "#dc2626", borderWidth: "3px", borderStyle: "solid", borderRadius: "9999px" } : {}),
                          }}
                          data-new-guest-field={isActiveNewGuest ? "true" : undefined}
                          data-guest-room-code={room.roomCode}
                          placeholder="0"
                          title="Double-click to switch between continuing and new guest"
                          aria-label={`${room.roomType} accommodation ${isActiveNewGuest ? "new" : "continuing"} guest value. Double-click to switch type.`}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Computed Analytics */}
      <aside className="flex min-h-0 flex-col space-y-4 lg:sticky lg:top-4 lg:h-full">
      <div className="flex-none rounded-lg border border-[#AFB3B5]/45 bg-[#F5F8FF] p-4 shadow-sm sm:p-6 lg:p-4">
        <h3 className="mb-3 text-lg font-semibold text-gray-900 lg:mb-2">Computed Analytics</h3>
        <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-1 lg:gap-2">
                  <div className="flex min-w-0 flex-col rounded-lg border border-[#6474A5]/35 bg-[#EEF2FF] p-2 sm:p-4 lg:p-3">
                    <p className="mb-1 min-h-[2.25rem] text-[10px] font-medium leading-tight text-[#193364] sm:min-h-[3.5rem] sm:text-sm lg:min-h-0">Guest Check-ins</p>
                    <p className="flex min-h-[2rem] items-center text-xl font-bold text-[#193364] sm:min-h-[2.25rem] sm:text-3xl lg:min-h-0 lg:text-2xl">{totalCheckIns}</p>
                    <p className="mt-1 min-h-[1.75rem] text-[9px] leading-tight text-[#5D6F73] sm:min-h-[2.5rem] sm:text-xs lg:min-h-0">new accommodation + short-stay guests</p>
                  </div>
                  <div className="flex min-w-0 flex-col rounded-lg border border-[#6C9772]/35 bg-[#E5E8E1] p-2 sm:p-4 lg:p-3" data-hotel-report-daily-occupancy="selected-report-date">
                    <p className="mb-1 min-h-[2.25rem] text-[10px] font-medium leading-tight text-[#0F3B2D] sm:min-h-[3.5rem] sm:text-sm lg:min-h-0">Rooms Occupied</p>
                    <p className="flex min-h-[2rem] items-center text-xl font-bold text-[#0F3B2D] sm:min-h-[2.25rem] sm:text-3xl lg:min-h-0 lg:text-2xl">{totalOccupiedRooms}</p>
                    <p className="mt-1 min-h-[1.75rem] text-[9px] leading-tight text-[#5D6F73] sm:min-h-[2.5rem] sm:text-xs lg:min-h-0">selected report date only</p>
                  </div>
                  <div className="flex min-w-0 flex-col rounded-lg border border-[#AFB3B5]/45 bg-[#F5F8FF] p-2 sm:p-4 lg:p-3">
                    <p className="mb-1 min-h-[2.25rem] text-[10px] font-medium leading-tight text-[#193364] sm:min-h-[3.5rem] sm:text-sm lg:min-h-0">Guest Nights</p>
                    <p className="flex min-h-[2rem] items-center text-xl font-bold text-[#193364] sm:min-h-[2.25rem] sm:text-3xl lg:min-h-0 lg:text-2xl">{totalGuestNights}</p>
                    <p className="mt-1 min-h-[1.75rem] text-[9px] leading-tight text-[#5D6F73] sm:min-h-[2.5rem] sm:text-xs lg:min-h-0">new + continuing + short-stay guests</p>
                  </div>
                </div>
      </div>

      {/* Action Buttons */}
      <div className="grid shrink-0 grid-cols-1 gap-3 pb-1">
        <button onClick={handleSaveDraft} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200">
          <Save className="w-5 h-5" /> Save Draft
        </button>
        <button onClick={handleSubmit} disabled={submitting || !hasAccommodationEntries} title={!hasAccommodationEntries ? "Enter at least one guest value before submitting" : undefined} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F4C75] px-6 py-3 text-white hover:bg-[#0F4C75] disabled:cursor-not-allowed disabled:opacity-60">
          <Send className="w-5 h-5" /> {submitting ? "Submitting..." : "Submit Accommodation Report"}
        </button>
      </div>
      </aside>
      </div>
    </div>
  );
}