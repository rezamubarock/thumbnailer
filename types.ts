export interface AdjustmentSettings {
  brightness: number; // 0-200, default 100
  contrast: number;   // 0-200, default 100
  saturation: number; // 0-200, default 100
  grayscale: number;  // 0-100, default 0
  sepia: number;      // 0-100, default 0
  blur: number;       // 0-20, default 0
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  color: string;
  fontSize: number;
  fontFamily: string;
}

export interface EditorState {
  imageUrl: string | null;
  originalImageUrl: string | null; 
  isProcessing: boolean;
  adjustments: AdjustmentSettings;
  textOverlays: TextOverlay[];
}

export const DEFAULT_ADJUSTMENTS: AdjustmentSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
};