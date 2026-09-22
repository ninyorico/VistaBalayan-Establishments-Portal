import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { OFFICIAL_REPORT_STATUS } from '../lib/reporting';

export function useEstablishments() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEstablishments();
  }, []);

  async function fetchEstablishments() {
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .order('name');
    if (!error) setData(data || []);
    setLoading(false);
  }

  return { data, loading, refetch: fetchEstablishments };
}

export function useVisitorReports(filters?: { establishment_id?: string; status?: string; start_date?: string; end_date?: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) fetchReports();
  }, [filters, profile?.id, authLoading]);

  async function fetchReports() {
    setLoading(true);
    let query = supabase
      .from('visitor_reports')
      .select(`
        *,
        establishments (name),
        profiles (full_name)
      `)
      .order('created_at', { ascending: false });

    if (profile?.role === 'establishment_staff' && profile.establishment_id) {
      query = query.eq('establishment_id', profile.establishment_id);
    }
    if (filters?.establishment_id) query = query.eq('establishment_id', filters.establishment_id);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.start_date) query = query.gte('report_date', filters.start_date);
    if (filters?.end_date) query = query.lte('report_date', filters.end_date);

    const { data, error } = await query;
    if (!error) setData(data || []);
    setLoading(false);
  }

  return { data, loading: loading || authLoading, refetch: fetchReports };
}

export function useAccommodationReports(filters?: any) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) fetchReports();
  }, [filters, profile?.id, authLoading]);

  async function fetchReports() {
    setLoading(true);
    let query = supabase
      .from('accommodation_reports')
      .select(`
        *,
        establishments (name),
        profiles (full_name),
        room_occupancy_details (*)
      `)
      .order('created_at', { ascending: false });

    if (profile?.role === 'establishment_staff' && profile.establishment_id) {
      query = query.eq('establishment_id', profile.establishment_id);
    }
    if (filters?.establishment_id) query = query.eq('establishment_id', filters.establishment_id);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.start_date) query = query.gte('report_date', filters.start_date);
    if (filters?.end_date) query = query.lte('report_date', filters.end_date);

    const { data, error } = await query;
    if (!error) setData(data || []);
    setLoading(false);
  }

  return { data, loading: loading || authLoading, refetch: fetchReports };
}

export function useAnalytics() {
  const [visitorTrends, setVisitorTrends] = useState<any[]>([]);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [loading, setLoading] = useState(true);
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) fetchAnalytics();
  }, [profile?.id, authLoading]);

  async function fetchAnalytics() {
    setLoading(true);
    let visitorQuery = supabase
      .from('visitor_reports')
      .select('report_date, total_guests, establishment_id')
      .eq('status', OFFICIAL_REPORT_STATUS)
      .order('report_date');

    if (profile?.role === 'establishment_staff' && profile.establishment_id) {
      visitorQuery = visitorQuery.eq('establishment_id', profile.establishment_id);
    }

    const { data: visitorData } = await visitorQuery;

    const monthly: Record<string, number> = {};
    visitorData?.forEach(v => {
      const month = v.report_date.slice(0, 7);
      monthly[month] = (monthly[month] || 0) + (v.total_guests || 0);
    });
    const trends = Object.entries(monthly).map(([month, visitors]) => ({ month, visitors }));

    const total = visitorData?.reduce((sum, v) => sum + (v.total_guests || 0), 0) || 0;

    let occQuery = supabase
      .from('accommodation_reports')
      .select('total_rooms, total_occupied_rooms, establishment_id')
      .eq('status', OFFICIAL_REPORT_STATUS);

    if (profile?.role === 'establishment_staff' && profile.establishment_id) {
      occQuery = occQuery.eq('establishment_id', profile.establishment_id);
    }

    const { data: occData } = await occQuery;
    let avgOcc = 0;
    if (occData && occData.length) {
      const totalRooms = occData.reduce((sum, r) => sum + r.total_rooms, 0);
      const totalOccupied = occData.reduce((sum, r) => sum + (r.total_occupied_rooms || 0), 0);
      avgOcc = totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0;
    }

    setVisitorTrends(trends);
    setTotalVisitors(total);
    setOccupancyRate(avgOcc);
    setLoading(false);
  }

  return { visitorTrends, totalVisitors, occupancyRate, loading: loading || authLoading };
}