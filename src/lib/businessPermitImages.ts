const BUSINESS_PERMIT_MARKER = "__business_permit_images__:";

export interface BusinessPermitAsset {
  url: string;
  name: string;
  type: string;
  kind: "image" | "file";
}

export const compressBusinessPermitImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to process image file"));
      img.onload = () => {
        const maxDimension = 1400;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Unable to prepare image preview"));
          return;
        }
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
};

function normalizeAsset(value: unknown, index: number): BusinessPermitAsset | null {
  if (typeof value === "string" && value.trim()) {
    return {
      url: value,
      name: `Business permit image ${index + 1}`,
      type: "image/*",
      kind: "image",
    };
  }

  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BusinessPermitAsset>;
  if (typeof candidate.url !== "string" || !candidate.url.trim()) return null;

  const type = typeof candidate.type === "string" && candidate.type.trim() ? candidate.type : "application/octet-stream";
  return {
    url: candidate.url,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : `Business permit file ${index + 1}`,
    type,
    kind: candidate.kind === "image" || type.startsWith("image/") ? "image" : "file",
  };
}

export function getBusinessPermitAssets(record: { business_permit_images?: unknown; amenities?: unknown } | null | undefined): BusinessPermitAsset[] {
  if (!record) return [];

  if (Array.isArray(record.business_permit_images)) {
    const assets = record.business_permit_images.map(normalizeAsset).filter((asset): asset is BusinessPermitAsset => Boolean(asset));
    if (assets.length > 0) return assets;
  }

  if (typeof record.amenities !== "string") return [];

  const markerIndex = record.amenities.lastIndexOf(BUSINESS_PERMIT_MARKER);
  if (markerIndex === -1) return [];

  try {
    const parsed = JSON.parse(record.amenities.slice(markerIndex + BUSINESS_PERMIT_MARKER.length).trim());
    return Array.isArray(parsed) ? parsed.map(normalizeAsset).filter((asset): asset is BusinessPermitAsset => Boolean(asset)) : [];
  } catch {
    return [];
  }
}

export function getBusinessPermitImages(record: { business_permit_images?: unknown; amenities?: unknown } | null | undefined): string[] {
  return getBusinessPermitAssets(record)
    .filter((asset) => asset.kind === "image")
    .map((asset) => asset.url);
}

export function setBusinessPermitAssetsInAmenities(currentAmenities: unknown, assets: BusinessPermitAsset[]): string {
  const current = typeof currentAmenities === "string" ? currentAmenities : "";
  const markerIndex = current.lastIndexOf(BUSINESS_PERMIT_MARKER);
  const visibleAmenities = markerIndex === -1 ? current.trimEnd() : current.slice(0, markerIndex).trimEnd();
  const normalizedAssets = assets.map(normalizeAsset).filter((asset): asset is BusinessPermitAsset => Boolean(asset));
  const metadata = `${BUSINESS_PERMIT_MARKER}${JSON.stringify(normalizedAssets)}`;

  return visibleAmenities ? `${visibleAmenities}\n${metadata}` : metadata;
}

export function setBusinessPermitImagesInAmenities(currentAmenities: unknown, imageUrls: string[]): string {
  return setBusinessPermitAssetsInAmenities(
    currentAmenities,
    imageUrls.map((url, index) => ({
      url,
      name: `Business permit image ${index + 1}`,
      type: "image/*",
      kind: "image" as const,
    }))
  );
}
