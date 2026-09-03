import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Save, Globe, Clock, Phone, Mail, MapPin, Info, ImagePlus, Building2, X, Crosshair, Search, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { compressListingImage } from '../../../lib/listingImages'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Separator } from '../../components/ui/separator'
import { Textarea } from '../../components/ui/textarea'

const BALAYAN_CENTER = { latitude: 13.9385, longitude: 120.7332 }
const LEAFLET_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const listingPinIcon = L.divIcon({
  className: '',
  html: '<div style="width:30px;height:30px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#0E5A72;border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.28);"><div style="width:10px;height:10px;border-radius:9999px;background:white;margin:7px auto;"></div></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
})

const toCoordinateInput = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '')

const parseCoordinate = (value: string, min: number, max: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

const LOCATION_PIN_PATTERN = /\n?\[LOCATION_PIN:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?\]/

const readLocationPinFromAmenities = (amenities = '') => {
  const match = amenities.match(/\[LOCATION_PIN:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/)
  if (!match) return null
  const latitude = parseCoordinate(match[1], -90, 90)
  const longitude = parseCoordinate(match[2], -180, 180)
  return latitude !== null && longitude !== null ? { latitude, longitude } : null
}

const stripLocationPin = (amenities = '') => amenities.replace(LOCATION_PIN_PATTERN, '').trim()
const writeLocationPin = (amenities: string, latitude: number | null, longitude: number | null) => {
  const cleanAmenities = stripLocationPin(amenities)
  if (latitude === null || longitude === null) return cleanAmenities
  return `${cleanAmenities}${cleanAmenities ? '\n' : ''}[LOCATION_PIN:${latitude},${longitude}]`
}

const cleanSearchPart = (value = '') => value.replace(/\s+/g, ' ').trim()
const buildMapSearchCandidates = (searchText: string, establishmentName: string, address: string) => {
  const typedQuery = cleanSearchPart(searchText)
  const name = cleanSearchPart(establishmentName)
  const listingAddress = cleanSearchPart(address)
  const primaryQuery = typedQuery || name || listingAddress
  const rawCandidates = [
    primaryQuery && listingAddress && primaryQuery !== listingAddress ? `${primaryQuery}, ${listingAddress}` : '',
    primaryQuery,
    typedQuery && name && listingAddress && typedQuery !== name ? `${name}, ${listingAddress}` : '',
    name && listingAddress ? `${name}, ${listingAddress}` : '',
    listingAddress,
    name,
  ]

  return Array.from(new Set(rawCandidates
    .map(cleanSearchPart)
    .filter(Boolean)))
    .map((candidate) => `${candidate}, Balayan, Batangas, Philippines`)
}

type MapSearchResult = {
  latitude: number
  longitude: number
  displayName?: string
  provider: 'Geoapify' | 'OpenStreetMap'
}

const searchGeoapify = async (searchQuery: string): Promise<MapSearchResult | null> => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Missing session. Please sign in again.')

  const response = await fetch(`/api/geoapify-search?q=${encodeURIComponent(searchQuery)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `Geoapify search failed (${response.status}).`)

  const result = data?.result
  const latitude = result ? parseCoordinate(String(result.latitude), -90, 90) : null
  const longitude = result ? parseCoordinate(String(result.longitude), -180, 180) : null
  if (latitude === null || longitude === null) return null

  return {
    latitude,
    longitude,
    displayName: result.displayName,
    provider: 'Geoapify',
  }
}

const searchOpenStreetMap = async (searchQuery: string): Promise<MapSearchResult | null> => {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(searchQuery)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('OpenStreetMap search failed.')

  const results = await response.json()
  const firstResult = Array.isArray(results) ? results[0] : null
  const latitude = firstResult ? parseCoordinate(String(firstResult.lat), -90, 90) : null
  const longitude = firstResult ? parseCoordinate(String(firstResult.lon), -180, 180) : null
  if (latitude === null || longitude === null) return null

  return {
    latitude,
    longitude,
    displayName: firstResult.display_name,
    provider: 'OpenStreetMap',
  }
}

export default function ManageListing() {
  const [establishment, setEstablishment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'searching' | 'error'>('idle')
  const [mapSearch, setMapSearch] = useState('')
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const leafletMarkerRef = useRef<L.Marker | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    address: '',
    contact_number: '',
    description: '',
    opening_hours: '',
    website_url: '',
    email: '',
    amenities: '',
    latitude: '',
    longitude: '',
  })

  useEffect(() => {
    loadEstablishment()
  }, [])

  const loadEstablishment = async () => {
    setLoading(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    // Get profile with establishment
    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .eq('id', user.id)
      .single()
    
    if (profile?.establishment_id) {
      const { data: est } = await supabase
        .from('establishments')
        .select('*')
        .eq('id', profile.establishment_id)
        .single()
      
      if (est) {
        const storedPin = readLocationPinFromAmenities(est.amenities || '')
        setEstablishment(est)
        setFormData({
          name: est.name || '',
          type: est.type || '',
          address: est.address || '',
          contact_number: est.contact_number || '',
          description: est.description || '',
          opening_hours: est.opening_hours || '',
          website_url: est.website_url || '',
          email: est.email || '',
          amenities: stripLocationPin(est.amenities || ''),
          latitude: toCoordinateInput(est.latitude ?? storedPin?.latitude),
          longitude: toCoordinateInput(est.longitude ?? storedPin?.longitude),
        })
        setImages(est.images || [])
      }
    }
    
    setLoading(false)
  }

  const saveListingImages = async (nextImages: string[]) => {
    if (!establishment) return false

    const { error } = await supabase
      .from('establishments')
      .update({
        images: nextImages,
        updated_at: new Date(),
      })
      .eq('id', establishment.id)

    if (error) {
      toast.error('Photos uploaded, but publishing them failed: ' + error.message)
      return false
    }

    setImages(nextImages)
    setEstablishment((current: any) => current ? { ...current, images: nextImages } : current)
    return true
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !establishment) return

    setUploading(true)
    const uploadedImages: string[] = []
    const fallbackImages: string[] = []
    const failedFiles: string[] = []

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          failedFiles.push(`${file.name} is not an image file`)
          continue
        }

        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `public/${establishment.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('establishment-images')
          .upload(filePath, file)

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('establishment-images')
            .getPublicUrl(filePath)

          uploadedImages.push(publicUrl)
          continue
        }

        console.warn('Storage upload failed; saving compressed listing image directly:', uploadError)
        try {
          const compressedImage = await compressListingImage(file)
          if (compressedImage.length > 900_000) {
            failedFiles.push(`${file.name} is too large. Please use a smaller or cropped photo.`)
            continue
          }
          fallbackImages.push(compressedImage)
        } catch (error) {
          failedFiles.push(error instanceof Error ? error.message : `Unable to process ${file.name}`)
        }
      }

      const nextUploads = [...uploadedImages, ...fallbackImages]
      if (nextUploads.length === 0) {
        toast.error(failedFiles[0] || 'No photos were uploaded. Please try again.')
        return
      }

      const nextImages = [...images, ...nextUploads]
      const published = await saveListingImages(nextImages)
      if (published) {
        const fallbackNote = fallbackImages.length > 0 ? ' Storage was unavailable, so compressed photos were saved directly.' : ''
        const failedNote = failedFiles.length > 0 ? ` ${failedFiles.length} file(s) were skipped.` : ''
        toast.success(`Photos uploaded and published to the public website.${fallbackNote}${failedNote}`)
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = async (index: number) => {
    const nextImages = images.filter((_, i) => i !== index)
    const published = await saveListingImages(nextImages)
    if (published) toast.success('Photo removed from the public website.')
  }

  const hasExactCoordinates = parseCoordinate(formData.latitude, -90, 90) !== null && parseCoordinate(formData.longitude, -180, 180) !== null

  const setExactPin = (latitude: number, longitude: number) => {
    setFormData((current) => ({
      ...current,
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7),
    }))
  }

  const getCurrentPinPosition = () => {
    const latitude = parseCoordinate(formData.latitude, -90, 90)
    const longitude = parseCoordinate(formData.longitude, -180, 180)
    return latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null
  }

  useEffect(() => {
    if (!mapContainerRef.current || !establishment) return

    const exactPosition = getCurrentPinPosition()
    const initialCenter: L.LatLngExpression = exactPosition
      ? [exactPosition.lat, exactPosition.lng]
      : [BALAYAN_CENTER.latitude, BALAYAN_CENTER.longitude]

    const map = leafletMapRef.current || L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    })
    leafletMapRef.current = map

    if (!mapContainerRef.current.dataset.vistabalayanLeafletReady) {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: LEAFLET_ATTRIBUTION,
      }).addTo(map)
      mapContainerRef.current.dataset.vistabalayanLeafletReady = 'true'
    }

    map.setView(initialCenter, exactPosition ? 17 : 14)

    const marker = leafletMarkerRef.current || L.marker(initialCenter, {
      draggable: true,
      icon: listingPinIcon,
      title: 'Exact establishment location',
    }).addTo(map)
    leafletMarkerRef.current = marker
    marker.setLatLng(initialCenter)

    marker.off('dragend')
    marker.on('dragend', () => {
      const position = marker.getLatLng()
      setExactPin(position.lat, position.lng)
    })

    map.off('click')
    map.on('click', (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng)
      map.panTo(event.latlng)
      setExactPin(event.latlng.lat, event.latlng.lng)
    })

    setMapStatus('ready')

    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.off('click')
      marker.off('dragend')
    }
  }, [establishment?.id])

  useEffect(() => {
    const map = leafletMapRef.current
    const marker = leafletMarkerRef.current
    const exactPosition = getCurrentPinPosition()
    if (!map || !marker || !exactPosition) return
    const latLng: L.LatLngExpression = [exactPosition.lat, exactPosition.lng]
    marker.setLatLng(latLng)
    map.panTo(latLng)
  }, [formData.latitude, formData.longitude])

  const handleMapSearch = async () => {
    const candidates = buildMapSearchCandidates(mapSearch, formData.name, formData.address)
    if (candidates.length === 0) {
      toast.error('Enter an establishment name, address, or nearby landmark to search.')
      return
    }

    setMapStatus('searching')
    try {
      let foundResult: MapSearchResult | null = null
      let matchedQuery = ''
      let geoapifyConfigMissing = false

      for (const searchQuery of candidates) {
        try {
          foundResult = await searchGeoapify(searchQuery)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!/not configured/i.test(message)) throw error
          geoapifyConfigMissing = true
        }

        if (!foundResult && geoapifyConfigMissing) {
          foundResult = await searchOpenStreetMap(searchQuery)
        }
        if (foundResult) {
          matchedQuery = searchQuery
          break
        }
      }

      if (!foundResult) {
        toast.error(geoapifyConfigMissing
          ? 'Private Geoapify API key is not configured yet. OpenStreetMap could not find it, so try a nearby landmark or paste coordinates manually.'
          : 'No Geoapify location found. Try the barangay, nearby landmark, or paste coordinates manually.')
        setMapStatus('ready')
        return
      }

      setExactPin(foundResult.latitude, foundResult.longitude)
      if (foundResult.displayName) {
        setFormData((current) => ({ ...current, address: foundResult?.displayName || current.address }))
      }
      const usedFallback = candidates.length > 1 && matchedQuery !== candidates[0]
      toast.success(usedFallback
        ? `${foundResult.provider} found a nearby address/location for this listing. Review the pin before publishing.`
        : `${foundResult.provider} found a location. Review the pin before publishing.`)
      setMapStatus('ready')
    } catch (error) {
      console.error('Map search failed:', error)
      toast.error('Geoapify search is unavailable. You can still click the map or paste coordinates.')
      setMapStatus('error')
    }
  }

  const useCurrentLocationAsPin = () => {
    if (!navigator.geolocation) {
      toast.error('Location access is not available in this browser. Open the site in Chrome/Safari and allow Location permission, or paste coordinates manually.')
      return
    }

    const setPinFromPosition = (position: GeolocationPosition) => {
      setFormData((current) => ({
        ...current,
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
      }))
      toast.success('Map pin set from your current location. Review the preview before publishing.')
    }

    navigator.geolocation.getCurrentPosition(
      setPinFromPosition,
      () => {
        navigator.geolocation.getCurrentPosition(
          setPinFromPosition,
          () => toast.error('Unable to get your phone location. Please turn on GPS/location services, allow location permission for this browser, or paste coordinates manually.'),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    )
  }

  const handleSubmit = async () => {
    if (!establishment) return

    const latitude = parseCoordinate(formData.latitude, -90, 90)
    const longitude = parseCoordinate(formData.longitude, -180, 180)
    if ((formData.latitude.trim() || formData.longitude.trim()) && (latitude === null || longitude === null)) {
      toast.error('Please enter valid latitude and longitude coordinates before publishing.')
      return
    }
    
    setSaving(true)

    const listingUpdates = {
      name: formData.name,
      type: formData.type,
      address: formData.address,
      contact_number: formData.contact_number,
      description: formData.description,
      opening_hours: formData.opening_hours,
      website_url: formData.website_url,
      email: formData.email,
      amenities: writeLocationPin(formData.amenities, latitude, longitude),
      images: images,
      updated_at: new Date(),
    }

    let { error } = await supabase
      .from('establishments')
      .update({
        ...listingUpdates,
        latitude,
        longitude,
      })
      .eq('id', establishment.id)

    if (error && /latitude|longitude|schema cache|column/i.test(error.message)) {
      const retry = await supabase
        .from('establishments')
        .update(listingUpdates)
        .eq('id', establishment.id)
      error = retry.error
    }
    
    if (error) {
      toast.error('Failed to update: ' + error.message)
    } else {
      toast.success('Your public listing has been updated! Visitors will see the changes immediately.')
    }
    
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1CA7C9] mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!establishment) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">No Establishment Found</h2>
        <p className="text-gray-600 mt-2">Your account is not associated with any establishment.</p>
        <p className="text-gray-500 text-sm mt-1">Please contact the Municipal Tourism Office.</p>
      </div>
    )
  }

  return (
    <main className="w-full max-w-full overflow-x-hidden" data-manage-listing-redesign="shadcn-taste-editorial">
      <div className="space-y-5 sm:space-y-7" data-manage-listing-hero-removed="true">
        <section className="grid grid-cols-1 gap-3" data-manage-listing-profile-card-only="true">
          <Card className="group overflow-hidden rounded-[1.5rem] border-slate-200 bg-slate-950 text-white shadow-sm">
            <CardContent className="relative p-5 sm:p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(28,167,201,0.42),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(148,163,184,0.24),transparent_28%)]" />
              <div className="relative flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 transition-transform duration-500 group-hover:scale-105">
                  <Sparkles className="size-6 text-cyan-100" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-100/80">Public profile</p>
                  <h2 className="mt-2 max-w-3xl text-[clamp(2rem,5vw,3.75rem)] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl">
                    Shape how visitors see your stay.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                    Keep the public tourism card precise: clean details, gallery-ready photos, and an exact visitor pin without exposing backend clutter.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <div className="space-y-5">
            <Card className="overflow-hidden rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
                <CardTitle className="text-xl font-black tracking-[-0.025em] text-slate-950">Public listing details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-5 sm:px-6">
                <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-name">Establishment Name *</Label>
                    <Input
                      id="listing-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-11 rounded-xl border-slate-200 bg-white"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-category">Category *</Label>
                    <select
                      id="listing-category"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="flex h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1CA7C9] focus:ring-2 focus:ring-[#1CA7C9]/20"
                    >
                      <option value="Resort">Resort</option>
                      <option value="Hotel">Hotel</option>
                      <option value="Inn">Inn</option>
                      <option value="Food & Beverage Establishment">Restaurant / Cafe</option>
                      <option value="Tourist Attraction">Tourist Attraction</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="listing-address" className="flex items-center gap-2"><MapPin className="size-4" /> Address</Label>
                  <Input
                    id="listing-address"
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="h-11 rounded-xl border-slate-200 bg-white"
                    placeholder="Brgy. Sampaga, Balayan, Batangas"
                  />
                </div>

                <Separator className="bg-slate-100" />

                <div className="rounded-[1.35rem] border border-cyan-100 bg-cyan-50/50 p-3 sm:p-4" data-manage-listing-pin-ui="provider-neutral-exact-pin">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black tracking-[-0.02em] text-slate-950">Exact Location Pin</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Search, use your current location, click the map, or drag the marker before publishing.</p>
                    </div>
                    <Badge variant="outline" className={hasExactCoordinates ? 'rounded-full border-cyan-200 bg-white text-cyan-800' : 'rounded-full border-amber-200 bg-amber-50 text-amber-800'}>
                      {hasExactCoordinates ? 'Pin ready' : 'Needs pin'}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Label className="sr-only" htmlFor="listing-map-search">Search location</Label>
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Input
                        id="listing-map-search"
                        type="text"
                        value={mapSearch}
                        onChange={(e) => setMapSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMapSearch() } }}
                        className="h-11 rounded-xl border-slate-200 bg-white"
                        placeholder="Search establishment or nearby landmark"
                      />
                      <Button
                        type="button"
                        onClick={handleMapSearch}
                        disabled={mapStatus === 'searching'}
                        className="h-11 rounded-xl bg-[#0E5A72] text-white hover:bg-[#073B4C]"
                      >
                        <Search className="size-4" /> {mapStatus === 'searching' ? 'Searching' : 'Search'}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      onClick={useCurrentLocationAsPin}
                      variant="outline"
                      className="h-11 rounded-xl border-cyan-200 bg-white text-[#0E5A72] hover:bg-cyan-50"
                    >
                      <Crosshair className="size-4" /> Use my location
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="manage-listing-map relative isolate z-0 overflow-hidden rounded-[1.25rem] border border-cyan-100 bg-white shadow-sm">
                      <div ref={mapContainerRef} className="h-72 w-full sm:h-80" />
                      {mapStatus === 'searching' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-medium text-[#0E5A72]">
                          Searching location...
                        </div>
                      )}
                      {mapStatus === 'error' && (
                        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-white/95 p-3 text-center text-xs text-red-600 shadow-sm">
                          Search is unavailable. The map still works: click to pin or drag the marker.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-phone" className="flex items-center gap-2"><Phone className="size-4" /> Contact Number</Label>
                    <Input
                      id="listing-phone"
                      type="text"
                      value={formData.contact_number}
                      onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                      className="h-11 rounded-xl border-slate-200 bg-white"
                      placeholder="+63 912 345 6789"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-email" className="flex items-center gap-2"><Mail className="size-4" /> Email</Label>
                    <Input
                      id="listing-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-11 rounded-xl border-slate-200 bg-white"
                      placeholder="contact@yourbusiness.com"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-website" className="flex items-center gap-2"><Globe className="size-4" /> Website</Label>
                    <Input
                      id="listing-website"
                      type="url"
                      value={formData.website_url}
                      onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                      className="h-11 rounded-xl border-slate-200 bg-white"
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="listing-hours" className="flex items-center gap-2"><Clock className="size-4" /> Opening Hours</Label>
                    <Input
                      id="listing-hours"
                      type="text"
                      value={formData.opening_hours}
                      onChange={(e) => setFormData({ ...formData, opening_hours: e.target.value })}
                      className="h-11 rounded-xl border-slate-200 bg-white"
                      placeholder="Mon-Sun: 8:00 AM - 8:00 PM"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="listing-description" className="flex items-center gap-2"><Info className="size-4" /> Description</Label>
                  <Textarea
                    id="listing-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={5}
                    className="min-h-32 rounded-xl border-slate-200 bg-white leading-6"
                    placeholder="Describe your establishment, amenities, nearby attractions, and unique features."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="overflow-hidden rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl font-black tracking-[-0.025em] text-slate-950">Photo gallery</CardTitle>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">{images.length} photos</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-4 sm:px-5">
                <div className="grid grid-cols-2 gap-3">
                  {images.map((img, index) => (
                    <div key={index} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      <img src={img} alt={`Public listing photo ${index + 1}`} className="h-28 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-red-600 text-white opacity-100 shadow-sm transition hover:bg-red-700 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Remove photo"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/50 text-center transition hover:border-[#1CA7C9] hover:bg-cyan-50">
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
                    <ImagePlus className="size-6 text-[#0E5A72]" />
                    <span className="mt-2 text-xs font-semibold text-slate-600">{uploading ? 'Uploading' : 'Add photos'}</span>
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Photos are published to the visitor website after upload and save.</p>
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] border-slate-200 bg-white/90 shadow-sm" data-manage-listing-checklist-removed="true">
              <CardContent className="p-4 sm:p-5">
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="h-12 w-full rounded-2xl bg-[#0F4C75] text-white shadow-lg shadow-cyan-900/10 hover:bg-[#123f5e]"
                >
                  <Save className="size-4" />
                  {saving ? 'Publishing' : 'Publish to public website'}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}