export type CompoundInput = {
  id: string;
  name: string;
  concentration: string;
  concentrationUnit: string;
};

export type CellLineInput = {
  id: string;
  name: string;
  density: number;
  densityCoefficient: number;
  densityUnit: string;
};

export type WellData = {
  compounds: Array<{
    name: string;
    concentration: string;
    concentrationUnit: string;
    color: string;
  }>;
  cellLines: Array<{
    name: string;
    density: number;
    densityCoefficient: number;
    densityUnit: string;
    shape: string;
  }>;
};

export type PlateData = {
  [key: string]: WellData;
};

export type ViewMode = 'main' | 'compound' | 'cellLine';

export type PlateType = '24 Well' | '96 Well' | '384 Well';