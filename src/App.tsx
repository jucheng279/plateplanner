import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Beaker, Trash2, Plus, X, ArrowLeft, Download, Image, FileText, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';
import { useMemo } from 'react';
import { exportToXLSX, exportToPNG, exportToPNGFull, exportToPDF } from './components/ExportUtils';
import { CompoundInput, CellLineInput, WellData, PlateData, ViewMode, PlateType } from './types';

// All possible row labels for the largest plate (384-well)
const ALL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

// Plate configurations
const PLATE_CONFIGS = {
  '24 Well': {
    rows: 4,
    cols: 6,
    // Gap factors calculated to maintain proportional spacing
    columnGapFactor: 100 / (6 * 12 + 5), // 6 wells + 5 gaps, scaled for visual balance
    rowGapFactor: 100 / (4 * 12 + 3), // 4 wells + 3 gaps, scaled for visual balance
    outerPaddingUnit: 2,
    innerPaddingUnit: 1
  },
  '96 Well': {
    rows: 8,
    cols: 12,
    columnGapFactor: 100 / 83, // Original values
    rowGapFactor: 100 / 55,
    outerPaddingUnit: 2,
    innerPaddingUnit: 1
  },
  '384 Well': {
    rows: 16,
    cols: 24,
    columnGapFactor: 100 / (24 * 6 + 23), // 24 wells + 23 gaps, scaled for visual balance
    rowGapFactor: 100 / (16 * 6 + 15), // 16 wells + 15 gaps, scaled for visual balance
    outerPaddingUnit: 4,
    innerPaddingUnit: 1
  }
};

const COLORS = [
  '#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00',
  '#00FF80', '#00FFFF', '#0080FF', '#0000FF', '#8000FF',
  '#FF00FF', '#FF0080', '#800000', '#808000', '#008000',
  '#008080', '#000080', '#800080', '#C0C0C0', '#808080'
];
const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'star', 'plus'];

const NO_UNIT = '';

// Helper function to convert numbers to superscript Unicode characters
function toSuperscript(num: number): string {
  const superscriptMap: { [key: string]: string } = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '-': '⁻'
  };
  
  return num.toString().split('').map(char => superscriptMap[char] || char).join('');
}

const MOLAR_UNITS = ['mM', 'µM', 'nM', 'pM'];
const MASS_UNITS = ['mg/ml', 'µg/ml', 'ng/ml', 'pg/ml'];
const VOLUME_UNITS = ['Well', 'ml', 'µl', 'L', 'cm²', 'mm²', NO_UNIT];
const POWER_VALUES = Array.from({ length: 9 }, (_, i) => i);

const MAX_CELL_LINES = 6;

// Grayscale colors for cell line density gradient (darkest to lightest)
const GRAYSCALE_COLORS = [
  '#1a1a1a', '#2d2d2d', '#404040', '#535353', '#666666',
  '#7a7a7a', '#8d8d8d', '#a0a0a0', '#b3b3b3', '#c6c6c6'
];

function App() {
  const [selectedWells, setSelectedWells] = useState<string[]>([]);
  const [plateData, setPlateData] = useState<PlateData>({});
  const [wellDiameter, setWellDiameter] = useState<number>(0);
  const wellRef = useRef<HTMLDivElement>(null);
  const [compounds, setCompounds] = useState<CompoundInput[]>([{
    id: '1',
    name: '',
    concentration: '',
    concentrationUnit: 'µM'
  }]);
  const [cellLines, setCellLines] = useState<CellLineInput[]>([{
    id: '1',
    name: '',
    density: 0,
    densityCoefficient: 0,
    densityUnit: 'Well'
  }]);
  const dragStartRef = useRef<string | null>(null);
  const dragEndRef = useRef<string | null>(null);
  const [currentDragSelection, setCurrentDragSelection] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [appliedCompounds, setAppliedCompounds] = useState<Set<string>>(new Set());
  const [appliedCellLines, setAppliedCellLines] = useState<Set<string>>(new Set());
  const [compoundColorMap, setCompoundColorMap] = useState<Map<string, string>>(new Map());
  const [compoundIntensityMap, setCompoundIntensityMap] = useState<Record<string, number>>({});
  const [compoundValues, setCompoundValues] = useState<Record<string, number>>({});
  const [cellLineShapeMap, setCellLineShapeMap] = useState<Map<string, string>>(new Map());
  const [compoundGradientContrastMap, setCompoundGradientContrastMap] = useState<Record<string, number>>({});

  // New state for individual table views
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [selectedItem, setSelectedItem] = useState<string>('');

  // Individual view editing states
  const [individualCompound, setIndividualCompound] = useState<CompoundInput>({
    id: 'individual',
    name: '',
    concentration: '',
    concentrationUnit: 'µM'
  });
  const [individualCellLine, setIndividualCellLine] = useState<CellLineInput>({
    id: 'individual',
    name: '',
    density: 0,
    densityCoefficient: 0,
    densityUnit: 'Well'
  });

  // New state for dilution factors
  const [compoundDilutionFactor, setCompoundDilutionFactor] = useState<number>(NaN);
  const [cellLineDilutionFactor, setCellLineDilutionFactor] = useState<number>(NaN);
  const [compoundDilutionFactorInputValue, setCompoundDilutionFactorInputValue] = useState<string>('');
  const [cellLineDilutionFactorInputValue, setCellLineDilutionFactorInputValue] = useState<string>('');

  // State for tracking empty name counters
  const [emptyCompoundCounter, setEmptyCompoundCounter] = useState<number>(1);
  const [emptyCellLineCounter, setEmptyCellLineCounter] = useState<number>(1);

  // State for controlling individual name input behavior
  const [keepIndividualNameEmpty, setKeepIndividualNameEmpty] = useState<boolean>(false);

  // State for toggle between input section and legend
  const [showInputSection, setShowInputSection] = useState<boolean>(true);

  // State for plate type selection
  const [selectedPlateType, setSelectedPlateType] = useState<PlateType>('96 Well');

  // State for legend layout
  const [legendLayout, setLegendLayout] = useState<'horizontal' | 'vertical'>('horizontal');

  // State for legend editing functionality
  const [isLegendEditing, setIsLegendEditing] = useState<boolean>(false);
  const [editedLegendConcentrations, setEditedLegendConcentrations] = useState<Map<string, Map<number, string>>>(new Map());
  const [editedLegendDensities, setEditedLegendDensities] = useState<Map<string, Map<number, string>>>(new Map());

  // State for duplicate name error handling
  const [duplicateNameError, setDuplicateNameError] = useState<string>('');
  const [tempInputValue, setTempInputValue] = useState<string>('');

  // Dynamic plate configuration based on selected type
  const plateConfig = PLATE_CONFIGS[selectedPlateType];
  const numRows = plateConfig.rows;
  const numCols = plateConfig.cols;
  // Helper function to parse density display strings consistently
  const parseDensityDisplayString = useCallback((str: string) => {
    // Handle both × and x characters, and make the ^ optional
    const match = str.match(/^([0-9.]+)\s*[×x]\s*10\^?([0-9]+)/i);
    if (!match) {
      const simpleMatch = str.match(/^([0-9.]+)/);
      return simpleMatch ? { coefficient: parseFloat(simpleMatch[1]), power: 0 } : { coefficient: 0, power: 0 };
    }
    return { coefficient: parseFloat(match[1]), power: parseInt(match[2]) };
  }, []);

  // Helper function to perform deep comparison of Map<string, Map<number, string>>
  const areMapsOfMapsEqual = useCallback((map1: Map<string, Map<number, string>>, map2: Map<string, Map<number, string>>): boolean => {
    if (map1.size !== map2.size) return false;
    
    for (const [key, innerMap1] of map1) {
      const innerMap2 = map2.get(key);
      if (!innerMap2) return false;
      
      if (innerMap1.size !== innerMap2.size) return false;
      
      for (const [innerKey, value1] of innerMap1) {
        const value2 = innerMap2.get(innerKey);
        if (value1 !== value2) return false;
      }
    }
    
    return true;
  }, []);

  const columnGapFactor = plateConfig.columnGapFactor;
  const rowGapFactor = plateConfig.rowGapFactor;

  // Generate current rows and columns based on plate type
  const currentRows = useMemo(() => ALL_ROWS.slice(0, numRows), [numRows]);
  const currentCols = useMemo(() => Array.from({ length: numCols }, (_, i) => i + 1), [numCols]);

  // State for compound unit type tracking
  const [compoundUnitTypes, setCompoundUnitTypes] = useState<Map<string, 'molar' | 'mass' | 'none'>>(new Map());

  // Helper function to format numeric values for display with consistent rounding
  const formatNumericValueForDisplay = (value: number): string => {
    if (isNaN(value)) return ''; // Handle NaN values gracefully
    // Round to 2 decimal places and remove trailing zeros
    return value % 1 === 0 ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
  };

  // Effect to measure well diameter
  useEffect(() => {
    const measureWellDiameter = () => {
      if (wellRef.current) {
        const diameter = wellRef.current.offsetWidth;
        setWellDiameter(diameter);
      }
    };

    // Measure on mount
    measureWellDiameter();

    // Measure on window resize
    window.addEventListener('resize', measureWellDiameter);
    
    // Use ResizeObserver for more robust measurement if available
    let resizeObserver: ResizeObserver | null = null;
    if (wellRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(measureWellDiameter);
      resizeObserver.observe(wellRef.current);
    }

    return () => {
      window.removeEventListener('resize', measureWellDiameter);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  // State for persistent tracking of all compounds/cell lines that have ever been applied
  const [everAppliedCompounds, setEverAppliedCompounds] = useState<Set<string>>(new Set());
  const [everAppliedCellLines, setEverAppliedCellLines] = useState<Set<string>>(new Set());

  // Helper function to get unique compound concentrations for legend
  const getUniqueCompoundConcentrations = useCallback((compoundName: string): Array<{ display: string; color: string; comparableValue: number }> => {
    const concentrationsMap = new Map<number, { display: string; color: string; comparableValue: number }>();
    
    Object.values(plateData).forEach(wellData => {
      wellData.compounds.forEach(compound => {
        if (compound.name === compoundName && compound.concentration) {
          // Apply smart unit handling
          const { value: displayValue, unit: displayUnit } = convertToSmallerUnit(compound.concentration, compound.concentrationUnit);
          const displayText = `${displayValue}${displayUnit === NO_UNIT ? '' : `\u00A0${displayUnit}`}`;
          const comparableValue = convertToComparableValue(compound.concentration, compound.concentrationUnit);
          
          // Store in map using comparable value as key to ensure uniqueness
          concentrationsMap.set(comparableValue, {
            display: displayText,
            color: compound.color, // Use the actual color from the compound
            comparableValue: comparableValue
          });
        }
      });
    });
    
    // Convert map values to array and sort by comparable value (descending)
    const concentrationArray = Array.from(concentrationsMap.values());
    return concentrationArray.sort((a, b) => b.comparableValue - a.comparableValue);
  }, [plateData]);

  // Helper function to convert concentration to smaller unit if needed
  const convertToSmallerUnit = (concentration: string, unit: string): { value: string; unit: string } => {
    const currentValue = parseFloat(concentration);
    if (isNaN(currentValue)) return { value: concentration, unit };

    let workingValue = currentValue;
    let workingUnit = unit;

    // For molar units - iterative conversion
    if (MOLAR_UNITS.includes(unit)) {
      const currentIndex = MOLAR_UNITS.indexOf(workingUnit);
      let unitIndex = currentIndex;
      
      while (workingValue < 1 && unitIndex < MOLAR_UNITS.length - 1) {
        workingValue *= 1000;
        unitIndex++;
        workingUnit = MOLAR_UNITS[unitIndex];
      }
      
      return { value: formatNumericValueForDisplay(workingValue), unit: workingUnit };
    }

    // For mass units - iterative conversion
    if (MASS_UNITS.includes(unit)) {
      const currentIndex = MASS_UNITS.indexOf(workingUnit);
      let unitIndex = currentIndex;
      
      while (workingValue < 1 && unitIndex < MASS_UNITS.length - 1) {
        workingValue *= 1000;
        unitIndex++;
        workingUnit = MASS_UNITS[unitIndex];
      }
      
      return { value: formatNumericValueForDisplay(workingValue), unit: workingUnit };
    }

    // Return original if no conversion possible
    return { value: formatNumericValueForDisplay(workingValue), unit: workingUnit };
  };

  // Helper function to get unique cell line densities for legend
  const getUniqueCellLineDensities = useCallback((cellLineName: string): Array<{ display: string; color: string }> => {
    const densitiesMap = new Map<number, { display: string; color: string; comparableValue: number }>();
    
    Object.values(plateData).forEach(wellData => {
      wellData.cellLines.forEach(cellLine => {
        if (cellLine.name === cellLineName && cellLine.densityCoefficient > 0) {
          const densityCoefficient = cellLine.densityCoefficient;
          // Use consistent comparable value calculation
          const comparableValue = convertToComparableDensity(cellLine.density, cellLine.densityCoefficient);
          const formattedDensity = cellLine.density === 0
            ? `${formatNumericValueForDisplay(densityCoefficient)}${cellLine.densityUnit !== NO_UNIT ? `\u00A0per\u00A0${cellLine.densityUnit}` : ''}`
            : `${formatNumericValueForDisplay(densityCoefficient)}\u00A0×\u00A010${toSuperscript(cellLine.density)}${cellLine.densityUnit !== NO_UNIT ? `\u00A0per\u00A0${cellLine.densityUnit}` : ''}`;
          
          // Extract color from shape if it has color info
          let color = '#000000'; // default color
          if (cellLine.shape.includes('-#')) {
            color = '#' + cellLine.shape.split('-#')[1];
          }
          
          densitiesMap.set(comparableValue, {
            display: formattedDensity,
            color: color,
            comparableValue: comparableValue
          });
        }
      });
    });
    
    // Convert to array and sort by comparable value (descending)
    const densityArray = Array.from(densitiesMap.values());
    return densityArray.sort((a, b) => {
      return b.comparableValue - a.comparableValue; // Descending order
    });
  }, [plateData, parseDensityDisplayString]);

  // Helper function to get available units for a compound
  const getAvailableUnitsForCompound = useCallback((compoundName: string): string[] => {
    // Check if any compound in the plate data uses "No unit"
    const hasNoUnitInPlate = Object.values(plateData).some(wellData =>
      wellData.compounds.some(compound => compound.concentrationUnit === NO_UNIT)
    );
    
    // If any compound uses "No unit", only allow "No unit" for all compounds
    if (hasNoUnitInPlate) {
      return [NO_UNIT];
    }
    
    // If compound name is empty, allow both types
    if (!compoundName || compoundName.trim() === '') {
      return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
    }

    // Check if compound exists in any well
    const compoundExistsInWells = Object.values(plateData).some(wellData =>
      wellData.compounds.some(compound => compound.name === compoundName)
    );

    // If compound doesn't exist in any well, allow both types
    if (!compoundExistsInWells) {
      return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
    }

    // Find the unit type used by this compound in existing wells
    for (const wellData of Object.values(plateData)) {
      const existingCompound = wellData.compounds.find(compound => compound.name === compoundName);
      if (existingCompound) {
        const unitType = compoundUnitTypes.get(compoundName);
        if (unitType === 'molar') {
          return [...MOLAR_UNITS, NO_UNIT];
        } else if (unitType === 'mass') {
          return [...MASS_UNITS, NO_UNIT];
        } else if (unitType === 'none') {
          return [NO_UNIT];
        }
        // Fallback: determine from the unit itself
        if (existingCompound.concentrationUnit === NO_UNIT) {
          return [NO_UNIT];
        } else if (MOLAR_UNITS.includes(existingCompound.concentrationUnit)) {
          return [...MOLAR_UNITS, NO_UNIT];
        } else if (MASS_UNITS.includes(existingCompound.concentrationUnit)) {
          return [...MASS_UNITS, NO_UNIT];
        }
      }
    }

    // Default to both types if no restriction found
    return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
  }, [plateData, compoundUnitTypes]);

  // Helper function to convert concentration to µM for comparison
  const convertToComparableValue = (concentration: string, unit: string): number => {
    const numericValue = parseFloat(concentration);
    if (isNaN(numericValue)) return 0;
    
    // For molar concentrations, convert to µM
    if (MOLAR_UNITS.includes(unit)) {
      switch (unit) {
        case 'mM': return numericValue * 1000;
        case 'µM': return numericValue;
        case 'nM': return numericValue / 1000;
        case 'pM': return numericValue / 1000000;
        default: return numericValue;
      }
    }
    
    // For mass concentrations, convert to µg/ml
    if (MASS_UNITS.includes(unit)) {
      switch (unit) {
        case 'mg/ml': return numericValue * 1000;
        case 'µg/ml': return numericValue;
        case 'ng/ml': return numericValue / 1000;
        case 'pg/ml': return numericValue / 1000000;
        default: return numericValue;
      }
    }
    
    return numericValue;
  };

  // Helper function to determine unit type
  const getUnitType = (unit: string): 'molar' | 'mass' | 'none' => {
    if (unit === NO_UNIT) return 'none';
    return MOLAR_UNITS.includes(unit) ? 'molar' : 'mass';
  };

  // Helper function to get available units for a compound
  const getAvailableUnits = (compoundName: string): string[] => {
    if (!compoundName.trim()) {
      // Empty compound name - allow both types
      return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
    }

    const existingUnitType = compoundUnitTypes.get(compoundName);
    if (!existingUnitType) {
      // Compound exists but no unit type set yet - allow both types
      return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
    }

    // Return only the units of the established type
    if (existingUnitType === 'molar') {
      return [...MOLAR_UNITS, NO_UNIT];
    } else if (existingUnitType === 'mass') {
      return [...MASS_UNITS, NO_UNIT];
    } else if (existingUnitType === 'none') {
      return [NO_UNIT];
    }
    return [...MOLAR_UNITS, ...MASS_UNITS, NO_UNIT];
  };

  // Helper function to update compound unit type tracking
  const updateCompoundUnitType = (compoundName: string, unit: string) => {
    if (!compoundName.trim()) return;
    
    const unitType = getUnitType(unit);
    setCompoundUnitTypes(prev => {
      const newMap = new Map(prev);
      newMap.set(compoundName, unitType);
      return newMap;
    });
  };

  // Helper function to check if two compounds are identical
  const areCompoundsIdentical = (comp1: any, comp2: any): boolean => {
    if (comp1.name !== comp2.name) return false;
    if (comp1.concentration !== comp2.concentration) return false;
    if (comp1.concentrationUnit !== comp2.concentrationUnit) return false;
    return true;
  };

  // Helper function to check if two cell lines are identical
  const areCellLinesIdentical = (cell1: any, cell2: any): boolean => {
    if (cell1.name !== cell2.name) return false;
    if (cell1.density !== cell2.density) return false;
    if (cell1.densityCoefficient !== cell2.densityCoefficient) return false;
    if (cell1.densityUnit !== cell2.densityUnit) return false;
    return true;
  };

  // Helper function to check if arrays of compounds are identical
  const areCompoundArraysIdentical = (compounds1: any[], compounds2: any[]): boolean => {
    if (compounds1.length !== compounds2.length) return false;
    
    // Sort both arrays by name for comparison
    const sorted1 = [...compounds1].sort((a, b) => a.name.localeCompare(b.name));
    const sorted2 = [...compounds2].sort((a, b) => a.name.localeCompare(b.name));
    
    return sorted1.every((comp1, index) => areCompoundsIdentical(comp1, sorted2[index]));
  };

  // Helper function to check if arrays of cell lines are identical
  const areCellLineArraysIdentical = (cellLines1: any[], cellLines2: any[]): boolean => {
    if (cellLines1.length !== cellLines2.length) return false;
    
    // Sort both arrays by name for comparison
    const sorted1 = [...cellLines1].sort((a, b) => a.name.localeCompare(b.name));
    const sorted2 = [...cellLines2].sort((a, b) => a.name.localeCompare(b.name));
    
    return sorted1.every((cell1, index) => areCellLinesIdentical(cell1, sorted2[index]));
  };

  // Auto-populate inputs based on selected wells
  const autoPopulateInputs = () => {
    if (selectedWells.length === 0) return;

    // Get non-empty wells from selection
    const nonEmptyWells = selectedWells
      .map(wellId => ({ wellId, data: plateData[wellId] }))
      .filter(well => well.data && (well.data.compounds.length > 0 || well.data.cellLines.length > 0));

    if (nonEmptyWells.length === 0) return;

    if (viewMode === 'main') {
      // Check if all non-empty wells have identical compound and cell line data
      const firstWell = nonEmptyWells[0].data;
      const allIdentical = nonEmptyWells.every(well => 
        areCompoundArraysIdentical(well.data.compounds, firstWell.compounds) &&
        areCellLineArraysIdentical(well.data.cellLines, firstWell.cellLines)
      );

      if (allIdentical) {
        // Populate compounds
        if (firstWell.compounds.length > 0) {
          const populatedCompounds = firstWell.compounds.map((compound, index) => ({
            id: (Date.now() + index).toString(),
            name: compound.name,
            concentration: compound.concentration,
            concentrationUnit: compound.concentrationUnit
          }));
          setCompounds(populatedCompounds);
        } else {
          // Reset to empty array if no compounds in wells
          setCompounds([]);
        }

        // Populate cell lines
        if (firstWell.cellLines.length > 0) {
          const populatedCellLines = firstWell.cellLines.map((cellLine, index) => ({
            id: (Date.now() + index).toString(),
            name: cellLine.name,
            density: cellLine.density,
            densityCoefficient: cellLine.densityCoefficient,
            densityUnit: cellLine.densityUnit
          }));
          setCellLines(populatedCellLines);
        } else {
          // Reset to empty array if no cell lines in wells
          setCellLines([]);
        }
      }
    } else if (viewMode === 'compound') {
      // Check if all non-empty wells have the same compound data for the selected item
      const relevantCompounds = nonEmptyWells
        .map(well => well.data.compounds.find(comp => comp.name === selectedItem))
        .filter(comp => comp !== undefined);

      if (relevantCompounds.length > 0) {
        const firstCompound = relevantCompounds[0];
        const allIdentical = relevantCompounds.every(comp => areCompoundsIdentical(comp, firstCompound));

        if (allIdentical) {
          setIndividualCompound({
            id: 'individual',
            name: firstCompound.name,
            concentration: firstCompound.concentration,
            concentrationUnit: firstCompound.concentrationUnit
          });
          setKeepIndividualNameEmpty(firstCompound.name.startsWith('Empty-'));
        }
      }
    } else if (viewMode === 'cellLine') {
      // Check if all non-empty wells have the same cell line data for the selected item
      const relevantCellLines = nonEmptyWells
        .map(well => well.data.cellLines.find(cell => cell.name === selectedItem))
        .filter(cell => cell !== undefined);

      if (relevantCellLines.length > 0) {
        const firstCellLine = relevantCellLines[0];
        const allIdentical = relevantCellLines.every(cell => areCellLinesIdentical(cell, firstCellLine));

        if (allIdentical) {
          setIndividualCellLine({
            id: 'individual',
            name: firstCellLine.name,
            density: firstCellLine.density,
            densityCoefficient: firstCellLine.densityCoefficient,
            densityUnit: firstCellLine.densityUnit
          });
          setKeepIndividualNameEmpty(firstCellLine.name.startsWith('Empty-'));
        }
      }
    }
  };

  // Define getWellsInRange first
  const getWellsInRange = useCallback((start: string, end: string): string[] => {
    const startCol = parseInt(start.slice(1));
    const startRow = start[0];
    const endCol = parseInt(end.slice(1));
    const endRow = end[0];

    const startRowIndex = currentRows.indexOf(startRow);
    const endRowIndex = currentRows.indexOf(endRow);
    const startColIndex = startCol - 1;
    const endColIndex = endCol - 1;

    if (startRowIndex === -1 || endRowIndex === -1) return [];

    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    const wells: string[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        wells.push(`${currentRows[row]}${col + 1}`);
      }
    }
    return wells;
  }, [currentRows]);

  // Define toggleWells before handleDocumentMouseUp to avoid initialization error
  const toggleWells = useCallback((wells: string[]) => {
    setSelectedWells(prev => {
      const newSelection = new Set(prev);
      wells.forEach(well => {
        if (newSelection.has(well)) {
          newSelection.delete(well);
        } else {
          newSelection.add(well);
        }
      });
      return Array.from(newSelection);
    });
  }, []);

  // Add global mouseup event listener to handle mouse release outside elements
  const handleDocumentMouseMove = useCallback((event: MouseEvent) => {
    if (!dragStartRef.current) return;

    const targetWellElement = (event.target as HTMLElement).closest('.well-cell');
    if (targetWellElement) {
      const wellId = targetWellElement.dataset.wellId;
      if (wellId) {
        dragEndRef.current = wellId;
        const wellsInRange = getWellsInRange(dragStartRef.current, wellId);
        setCurrentDragSelection(wellsInRange);
      }
    }
  }, [dragStartRef, getWellsInRange, setCurrentDragSelection]);

  const handleDocumentMouseUp = useCallback(() => {
    if (dragStartRef.current && dragEndRef.current) {
      const wellsInRange = getWellsInRange(dragStartRef.current, dragEndRef.current);
      toggleWells(wellsInRange);
    }
    dragStartRef.current = null;
    dragEndRef.current = null;
    setCurrentDragSelection([]);
    setIsDragging(false);
  }, [dragStartRef, currentDragSelection, toggleWells, setCurrentDragSelection, setIsDragging]);

  // Manage global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDocumentMouseMove);
      document.addEventListener('mouseup', handleDocumentMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleDocumentMouseMove);
        document.removeEventListener('mouseup', handleDocumentMouseUp);
      };
    }
  }, [isDragging, handleDocumentMouseMove, handleDocumentMouseUp]);

  // Helper function to get display name (shows "Empty" for empty names)
  const getDisplayName = (name: string) => {
    return name === '' ? 'Empty' : name;
  };

  // Algorithm to generate unique empty names
  const generateEmptyName = (type: 'compound' | 'cellLine', existingNames: Set<string>): string => {
    let counter = type === 'compound' ? emptyCompoundCounter : emptyCellLineCounter;
    let generatedName: string;
    
    do {
      generatedName = `Empty-${counter}`;
      counter++;
    } while (existingNames.has(generatedName) || Array.from(existingNames).some(name => name.trim() === generatedName));
    
    // Update the counter for next use
    if (type === 'compound') {
      setEmptyCompoundCounter(counter);
    } else {
      setEmptyCellLineCounter(counter);
    }
    
    return generatedName;
  };

  // Universal empty name processing - ALWAYS generates Empty-X for any empty name
  const processEmptyNames = (
    items: Array<{name: string}>, 
    type: 'compound' | 'cellLine'
  ): Array<{name: string}> => {
    const existingNames = new Set(
      type === 'compound' 
        ? Array.from(everAppliedCompounds)
        : Array.from(everAppliedCellLines)
    );
    
    return items.map(item => {
      if (item.name.trim() === '') {
        const generatedName = generateEmptyName(type, existingNames);
        existingNames.add(generatedName); // Add to set to avoid duplicates in same batch
        return { ...item, name: generatedName };
      }
      return item;
    });
  };

  const updateAppliedItems = (newPlateData: PlateData) => {
    const compounds = new Set<string>();
    const cellLines = new Set<string>();
    
    Object.values(newPlateData).forEach(well => {
      well.compounds.forEach(compound => {
        if (compound.name) compounds.add(compound.name);
      });
      well.cellLines.forEach(cellLine => {
        if (cellLine.name) cellLines.add(cellLine.name);
      });
    });

    setAppliedCompounds(compounds);
    setAppliedCellLines(cellLines);
  };

  const getNextAvailableColor = (usedColors: Set<string>) => {
    for (const color of COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    return COLORS[0];
  };

  const getNextAvailableShape = (usedShapes: Set<string>) => {
    for (const shape of SHAPES) {
      if (!usedShapes.has(shape)) {
        return shape;
      }
    }
    return SHAPES[0];
  };

  const assignColorsAndShapes = (validCompounds: CompoundInput[], validCellLines: CellLineInput[]) => {
    const newCompoundColorMap = new Map(compoundColorMap);
    const newCellLineShapeMap = new Map(cellLineShapeMap);
    const newCompoundIntensityMap = { ...compoundIntensityMap };
    const newCompoundValues = { ...compoundValues };
    const newCompoundGradientContrastMap = { ...compoundGradientContrastMap };
    
    const usedColors = new Set(newCompoundColorMap.values());
    const usedShapes = new Set(newCellLineShapeMap.values());

    validCompounds.forEach(compound => {
      if (!newCompoundColorMap.has(compound.name)) {
        const color = getNextAvailableColor(usedColors);
        newCompoundColorMap.set(compound.name, color);
        usedColors.add(color);
        newCompoundIntensityMap[compound.name] = 1.0;
        newCompoundValues[compound.name] = 70;
        newCompoundGradientContrastMap[compound.name] = 0.3;
      }
    });

    validCellLines.forEach(cellLine => {
      if (!newCellLineShapeMap.has(cellLine.name)) {
        const shape = getNextAvailableShape(usedShapes);
        newCellLineShapeMap.set(cellLine.name, shape);
        usedShapes.add(shape);
      }
    });

    return { 
      newCompoundColorMap, 
      newCellLineShapeMap, 
      newCompoundIntensityMap, 
      newCompoundValues,
      newCompoundGradientContrastMap
    };
  };

  // Convert concentration to a comparable number (in µM)
  const convertToComparable = (concentration: string, unit: string): number => {
    // Treat empty concentration as 0
    if (!concentration || concentration.trim() === '') {
      return 0;
    }
    
    const numericValue = parseFloat(concentration);
    if (isNaN(numericValue)) return 0;
    
    // For molar concentrations, convert to µM
    if (MOLAR_UNITS.includes(unit)) {
      switch (unit) {
        case 'mM': return numericValue * 1000;
        case 'µM': return numericValue;
        case 'nM': return numericValue / 1000;
        case 'pM': return numericValue / 1000000;
        default: return numericValue;
      }
    }
    
    // For mass concentrations, convert to µg/ml
    if (MASS_UNITS.includes(unit)) {
      switch (unit) {
        case 'mg/ml': return numericValue * 1000;
        case 'µg/ml': return numericValue;
        case 'ng/ml': return numericValue / 1000;
        case 'pg/ml': return numericValue / 1000000;
        default: return numericValue;
      }
    }
    
    return numericValue;
  };

  // Convert cell line density to a comparable number
  const convertToComparableDensity = (density: number, coefficient: number): number => {
    return coefficient * Math.pow(10, density);
  };

  // Generate color gradient for compounds with same name but different concentrations
  const applyConcentrationGradient = (
    plateData: PlateData, 
    currentCompoundColorMap: Map<string, string>,
    currentCompoundIntensityMap: Record<string, number> = {},
    currentCompoundValues: Record<string, number> = {},
    currentCompoundGradientContrastMap: Record<string, number> = {}
  ): PlateData => {
    const updatedPlateData = { ...plateData };
    
    const compoundGroups: { [name: string]: Array<{ concentration: number, wells: string[] }> } = {};
    
    Object.entries(updatedPlateData).forEach(([wellId, wellData]) => {
      wellData.compounds.forEach(compound => {
        if (!compound.name) return;
        
        if (!compoundGroups[compound.name]) {
          compoundGroups[compound.name] = [];
        }
        
        const concentrationValue = convertToComparable(compound.concentration, compound.concentrationUnit);
        
        let concentrationGroup = compoundGroups[compound.name].find(group => group.concentration === concentrationValue);
        if (!concentrationGroup) {
          concentrationGroup = { concentration: concentrationValue, wells: [] };
          compoundGroups[compound.name].push(concentrationGroup);
        }
        
        concentrationGroup.wells.push(wellId);
      });
    });
    
    Object.entries(compoundGroups).forEach(([compoundName, concentrationGroups]) => {
      const baseColor = currentCompoundColorMap.get(compoundName) || COLORS[0];
      const intensity = currentCompoundIntensityMap?.[compoundName] || compoundIntensityMap[compoundName] || 1.0;
      const value = currentCompoundValues?.[compoundName] || compoundValues[compoundName] || 70;
      
      // Apply intensity and value to base color
      const intensifiedColor = applyIntensityToColor(baseColor, intensity, value);
      
      if (concentrationGroups.length === 1) {
        // Single concentration - use darkest color (full opacity)
        const darkestColor = `${intensifiedColor}ff`;
        
        concentrationGroups[0].wells.forEach(wellId => {
          const wellData = updatedPlateData[wellId];
          wellData.compounds = wellData.compounds.map(compound => {
            if (compound.name === compoundName) {
              return { ...compound, color: darkestColor };
            }
            return compound;
          });
        });
      } else if (concentrationGroups.length > 1) {
        // Multiple concentrations - apply gradient
        concentrationGroups.sort((a, b) => a.concentration - b.concentration);
        
        concentrationGroups.forEach((group, index) => {
          const normalizedPosition = index / (concentrationGroups.length - 1);
          const startOpacity = currentCompoundGradientContrastMap[compoundName] || 0.3;
          const opacity = startOpacity + normalizedPosition * (1 - startOpacity);
          const gradientColor = `${intensifiedColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
          
          group.wells.forEach(wellId => {
            const wellData = updatedPlateData[wellId];
            wellData.compounds = wellData.compounds.map(compound => {
              if (compound.name === compoundName && 
                  convertToComparable(compound.concentration, compound.concentrationUnit) === group.concentration) {
                return { ...compound, color: gradientColor };
              }
              return compound;
            });
          });
        });
      }
    });
    
    return updatedPlateData;
  };

  // Generate grayscale gradient for cell lines with same name but different densities
  const applyDensityGradient = (plateData: PlateData, currentCellLineShapeMap: Map<string, string>): PlateData => {
    const updatedPlateData = { ...plateData };
    
    const cellLineGroups: { [name: string]: Array<{ density: number, wells: string[] }> } = {};
    
    Object.entries(updatedPlateData).forEach(([wellId, wellData]) => {
      wellData.cellLines.forEach(cellLine => {
        if (!cellLine.name) return;
        
        if (!cellLineGroups[cellLine.name]) {
          cellLineGroups[cellLine.name] = [];
        }
        
        const densityValue = convertToComparableDensity(cellLine.density, cellLine.densityCoefficient);
        
        let densityGroup = cellLineGroups[cellLine.name].find(group => group.density === densityValue);
        if (!densityGroup) {
          densityGroup = { density: densityValue, wells: [] };
          cellLineGroups[cellLine.name].push(densityGroup);
        }
        
        densityGroup.wells.push(wellId);
      });
    });
    
    Object.entries(cellLineGroups).forEach(([cellLineName, densityGroups]) => {
      if (densityGroups.length <= 1) {
        // Single density - use darkest gray
        const singleColor = GRAYSCALE_COLORS[0];
        densityGroups.forEach(group => {
          group.wells.forEach(wellId => {
            const wellData = updatedPlateData[wellId];
            wellData.cellLines = wellData.cellLines.map(cellLine => {
              if (cellLine.name === cellLineName) {
                // Extract base shape if it already has color info
                const baseShape = cellLine.shape.includes('-#') ? cellLine.shape.split('-#')[0] : cellLine.shape;
                return { ...cellLine, shape: `${baseShape}-${singleColor}` };
              }
              return cellLine;
            });
          });
        });
        return;
      }
      
      // Sort by density (lowest to highest for proper gradient mapping)
      densityGroups.sort((a, b) => a.density - b.density);
      
      densityGroups.forEach((group, index) => {
        // Map to grayscale: lowest density = lightest (high index), highest density = darkest (low index)
        const normalizedPosition = index / (densityGroups.length - 1); // 0 to 1
        const colorIndex = Math.floor((1 - normalizedPosition) * (GRAYSCALE_COLORS.length - 1));
        const gradientColor = GRAYSCALE_COLORS[colorIndex];
        
        group.wells.forEach(wellId => {
          const wellData = updatedPlateData[wellId];
          wellData.cellLines = wellData.cellLines.map(cellLine => {
            if (cellLine.name === cellLineName && 
                convertToComparableDensity(cellLine.density, cellLine.densityCoefficient) === group.density) {
              // Extract base shape if it already has color info
              const baseShape = cellLine.shape.includes('-#') ? cellLine.shape.split('-#')[0] : cellLine.shape;
              return { ...cellLine, shape: `${baseShape}-${gradientColor}` };
            }
            return cellLine;
          });
        });
      });
    });
    
    return updatedPlateData;
  };

  const applyIntensityToColor = (hexColor: string, intensity: number, value: number = 100): string => {
    // Convert hex to HSL
    const [h, s, l] = hexToHsl(hexColor);
    
    // Apply intensity to saturation (intensity affects how vivid the color is)
    const newSaturation = Math.min(100, Math.max(0, s * intensity));
    
    // Apply intensity to lightness transition: from black (10) to target value (value) to bright (100)
    let newLightness: number;
    if (intensity <= 1.0) {
      // Transition from black (10) at intensity 0.3 to target value at intensity 1.0
      const minLightness = 10;
      const normalizedIntensity = (intensity - 0.3) / (1.0 - 0.3); // 0 to 1 range
      newLightness = minLightness + normalizedIntensity * (value - minLightness);
    } else {
      // Transition from target value at intensity 1.0 to bright (100) at intensity 2.0
      const normalizedIntensity = (intensity - 1.0) / (2.0 - 1.0); // 0 to 1 range
      newLightness = value + normalizedIntensity * (100 - value);
    }
    
    // Ensure lightness stays within valid bounds
    newLightness = Math.min(100, Math.max(0, newLightness));
    
    // Convert back to hex
    return hslToHex(h, newSaturation, newLightness);
  };

  const handleIntensityChange = (compoundName: string, newIntensity: number) => {
    // Implementation for intensity change
  };

  const handleColorChange = (compoundName: string, newColor: string) => {
    setCompoundColorMap(prev => new Map(prev.set(compoundName, newColor)));
    // Reapply concentration gradient with new color
    setTimeout(() => {
      let finalPlateData = applyConcentrationGradient(plateData, compoundColorMap, compoundIntensityMap, compoundValues, compoundGradientContrastMap);
      setPlateData(finalPlateData);
    }, 0);
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const hexToHsl = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  };

  const findBestReferenceCell = (plateData: PlateData, newCompoundNames: string[]) => {
    let bestMatch: {
      compounds: Array<{name: string; concentration: string; concentrationUnit: string; color: string}>;
      matchCount: number;
    } | null = null;

    for (const wellData of Object.values(plateData)) {
      if (wellData.compounds && wellData.compounds.length > 0) {
        const matchCount = wellData.compounds.filter(compound => 
          newCompoundNames.includes(compound.name)
        ).length;

        if (!bestMatch || matchCount > bestMatch.matchCount) {
          bestMatch = {
            compounds: wellData.compounds,
            matchCount: matchCount
          };
        }
      }
    }

    return bestMatch ? bestMatch.compounds : null;
  };

  const findBestReferenceCellForCellLines = (plateData: PlateData, newCellLineNames: string[]) => {
    let bestMatch: {
      cellLines: Array<{name: string; density: number; densityCoefficient: number; densityUnit: string; shape: string}>;
      matchCount: number;
    } | null = null;

    for (const wellData of Object.values(plateData)) {
      if (wellData.cellLines && wellData.cellLines.length > 0) {
        const matchCount = wellData.cellLines.filter(cellLine => 
          newCellLineNames.includes(cellLine.name)
        ).length;

        if (!bestMatch || matchCount > bestMatch.matchCount) {
          bestMatch = {
            cellLines: wellData.cellLines,
            matchCount: matchCount
          };
        }
      }
    }

    return bestMatch ? bestMatch.cellLines : null;
  };

  const canExactPositionMatch = (
    newCompounds: Array<{name: string; concentration: string; concentrationUnit: string; color: string}>,
    referenceCompounds: Array<{name: string; concentration: string; concentrationUnit: string; color: string}>
  ) => {
    const referencePositions = new Map<string, number>();
    referenceCompounds.forEach((compound, index) => {
      referencePositions.set(compound.name, index);
    });

    const matchingCompounds = newCompounds.filter(compound => 
      referencePositions.has(compound.name)
    );

    const neededPositions = matchingCompounds.map(compound => 
      referencePositions.get(compound.name)!
    );

    const uniquePositions = new Set(neededPositions);
    return uniquePositions.size === matchingCompounds.length && 
           Math.max(...neededPositions) < newCompounds.length;
  };

  const canExactPositionMatchCellLines = (
    newCellLines: Array<{name: string; density: number; densityCoefficient: number; densityUnit: string; shape: string}>,
    referenceCellLines: Array<{name: string; density: number; densityCoefficient: number; densityUnit: string; shape: string}>
  ) => {
    const referencePositions = new Map<string, number>();
    referenceCellLines.forEach((cellLine, index) => {
      referencePositions.set(cellLine.name, index);
    });

    const matchingCellLines = newCellLines.filter(cellLine => 
      referencePositions.has(cellLine.name)
    );

    const neededPositions = matchingCellLines.map(cellLine => 
      referencePositions.get(cellLine.name)!
    );

    const uniquePositions = new Set(neededPositions);
    return uniquePositions.size === matchingCellLines.length && 
           Math.max(...neededPositions) < newCellLines.length;
  };

  const rearrangeCompoundsByPosition = (
    newCompounds: Array<{name: string; concentration: string; concentrationUnit: string; color: string}>,
    referenceCompounds: Array<{name: string; concentration: string; concentrationUnit: string; color: string}> | null
  ) => {
    if (!referenceCompounds || referenceCompounds.length === 0) {
      return newCompounds;
    }

    const referencePositions = new Map<string, number>();
    referenceCompounds.forEach((compound, index) => {
      referencePositions.set(compound.name, index);
    });

    const matchingCompounds: Array<{compound: any, refPosition: number}> = [];
    const nonMatchingCompounds: any[] = [];

    newCompounds.forEach(compound => {
      const refPosition = referencePositions.get(compound.name);
      if (refPosition !== undefined) {
        matchingCompounds.push({ compound, refPosition });
      } else {
        nonMatchingCompounds.push(compound);
      }
    });

    if (matchingCompounds.length === 0) {
      return newCompounds;
    }

    if (canExactPositionMatch(newCompounds, referenceCompounds)) {
      const result = [...newCompounds];
      
      matchingCompounds.forEach(({ compound, refPosition }) => {
        if (refPosition < result.length) {
          result[refPosition] = compound;
        }
      });

      let nonMatchingIndex = 0;
      for (let i = 0; i < result.length; i++) {
        const hasMatchingCompound = matchingCompounds.some(({ refPosition }) => refPosition === i);
        if (!hasMatchingCompound && nonMatchingIndex < nonMatchingCompounds.length) {
          result[i] = nonMatchingCompounds[nonMatchingIndex];
          nonMatchingIndex++;
        }
      }

      return result;
    } else {
      matchingCompounds.sort((a, b) => a.refPosition - b.refPosition);

      const rearranged: any[] = [];
      
      nonMatchingCompounds.forEach(compound => {
        rearranged.push(compound);
      });

      matchingCompounds.forEach(({ compound }) => {
        rearranged.push(compound);
      });

      return rearranged;
    }
  };

  const rearrangeCellLinesByPosition = (
    newCellLines: Array<{name: string; density: number; densityCoefficient: number; densityUnit: string; shape: string}>,
    referenceCellLines: Array<{name: string; density: number; densityCoefficient: number; densityUnit: string; shape: string}> | null
  ) => {
    if (!referenceCellLines || referenceCellLines.length === 0) {
      return newCellLines;
    }

    const referencePositions = new Map<string, number>();
    referenceCellLines.forEach((cellLine, index) => {
      referencePositions.set(cellLine.name, index);
    });

    const matchingCellLines: Array<{cellLine: any, refPosition: number}> = [];
    const nonMatchingCellLines: any[] = [];

    newCellLines.forEach(cellLine => {
      const refPosition = referencePositions.get(cellLine.name);
      if (refPosition !== undefined) {
        matchingCellLines.push({ cellLine, refPosition });
      } else {
        nonMatchingCellLines.push(cellLine);
      }
    });

    if (matchingCellLines.length === 0) {
      return newCellLines;
    }

    if (canExactPositionMatchCellLines(newCellLines, referenceCellLines)) {
      const result = [...newCellLines];
      
      matchingCellLines.forEach(({ cellLine, refPosition }) => {
        if (refPosition < result.length) {
          result[refPosition] = cellLine;
        }
      });

      let nonMatchingIndex = 0;
      for (let i = 0; i < result.length; i++) {
        const hasMatchingCellLine = matchingCellLines.some(({ refPosition }) => refPosition === i);
        if (!hasMatchingCellLine && nonMatchingIndex < nonMatchingCellLines.length) {
          result[i] = nonMatchingCellLines[nonMatchingIndex];
          nonMatchingIndex++;
        }
      }

      return result;
    } else {
      matchingCellLines.sort((a, b) => a.refPosition - b.refPosition);

      const rearranged: any[] = [];
      
      nonMatchingCellLines.forEach(cellLine => {
        rearranged.push(cellLine);
      });

      matchingCellLines.forEach(({ cellLine }) => {
        rearranged.push(cellLine);
      });

      return rearranged;
    }
  };

  const addCompound = () => {
    setCompounds(prev => [...prev, {
      id: Date.now().toString(),
      name: '',
      concentration: '',
      concentrationUnit: 'µM'
    }]);
  };

  const removeCompound = (id: string) => {
    setCompounds(prev => prev.filter(c => c.id !== id));
  };

  const addCellLine = () => {
    if (appliedCellLines.size >= MAX_CELL_LINES) {
      alert(`Maximum of ${MAX_CELL_LINES} different cell lines can be applied to the table.`);
      return;
    }
    
    setCellLines(prev => [...prev, {
      id: Date.now().toString(),
      name: '',
      density: 0,
      densityCoefficient: 0,
      densityUnit: 'Well'
    }]);
  };

  const removeCellLine = (id: string) => {
    setCellLines(prev => prev.filter(c => c.id !== id));
  };

  // Clear plate data when plate type changes
  useEffect(() => {
    setPlateData({});
    setSelectedWells([]);
    setAppliedCompounds(new Set());
    setAppliedCellLines(new Set());
    setEverAppliedCompounds(new Set());
    setEverAppliedCellLines(new Set());
    setCompoundColorMap(new Map());
    setCellLineShapeMap(new Map());
    setCompoundIntensityMap({});
    setCompoundValues({});
    setCompoundUnitTypes(new Map());
    setViewMode('main');
    setSelectedItem('');
  }, [selectedPlateType]);

  // Effect to auto-populate inputs when selection changes
  useEffect(() => {
    autoPopulateInputs();
  }, [selectedWells, viewMode, selectedItem]);

  // Calculate apply button states - moved before useEffect to avoid initialization errors
  const hasValidCompounds = compounds.some(c => c.name.trim()) || compounds.some(c => c.name.trim() === '');
  const hasValidCellLines = cellLines.some(c => c.name.trim()) || cellLines.some(c => c.name.trim() === '');
  const canApply = selectedWells.length > 0 && (hasValidCompounds || hasValidCellLines);
  const canApplyIndividual = selectedWells.length > 0 && (
    (viewMode === 'compound') ||
    (viewMode === 'cellLine')
  );

  // Effect to handle spacebar key press for apply functionality
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only trigger if spacebar is pressed and not in an input field
      if (event.code === 'Space' && 
          event.target instanceof HTMLElement && 
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) &&
          !event.target.isContentEditable) {
        
        event.preventDefault(); // Prevent page scroll
        
        if (viewMode === 'main') {
          // Main view: check if apply button should be enabled and trigger applyToWells
          if (canApply) {
            applyToWells();
          }
        } else if (viewMode === 'compound' || viewMode === 'cellLine') {
          // Individual view: check if apply button should be enabled and trigger applyIndividualToWells
          if (canApplyIndividual) {
            // Parse and validate dilution factors same as in the button click handler
            const parsedCompoundValue = parseFloat(compoundDilutionFactorInputValue);
            const finalCompoundDilutionFactor = (isNaN(parsedCompoundValue) || parsedCompoundValue <= 0) ? 1 : parsedCompoundValue;

            const parsedCellLineValue = parseFloat(cellLineDilutionFactorInputValue);
            const finalCellLineDilutionFactor = (isNaN(parsedCellLineValue) || parsedCellLineValue <= 0) ? 1 : parsedCellLineValue;

            // Update the main state variables
            setCompoundDilutionFactor(finalCompoundDilutionFactor);
            setCellLineDilutionFactor(finalCellLineDilutionFactor);

            // Apply to wells with validated values
            applyIndividualToWells(selectedItem, finalCompoundDilutionFactor, finalCellLineDilutionFactor);
          }
        }
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyPress);

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [viewMode, canApply, canApplyIndividual, selectedItem, compoundDilutionFactorInputValue, cellLineDilutionFactorInputValue]);

  // Effect to re-apply concentration gradient when gradient-related state changes
  useEffect(() => {
    if (Object.keys(plateData).length > 0) {
      const updatedPlateData = applyConcentrationGradient(
        plateData,
        compoundColorMap,
        compoundIntensityMap,
        compoundValues,
        compoundGradientContrastMap
      );
      setPlateData(updatedPlateData);
    }
  }, [compoundGradientContrastMap, compoundColorMap, compoundIntensityMap, compoundValues, plateData]);

  // Effect to synchronize legend edits with current plate data
  useEffect(() => {
    // Skip this effect if we're currently in legend editing mode to prevent interference
    if (isLegendEditing) {
      return;
    }
    
    // Create maps of currently present comparable values for compounds and cell lines
    const currentCompoundComparableValues = new Map<string, Set<number>>();
    const currentCellLineComparableValues = new Map<string, Set<number>>();
    
    // Collect all current comparable values from plate data
    Object.values(plateData).forEach(wellData => {
      // Process compounds
      wellData.compounds.forEach(compound => {
        if (compound.name && compound.concentration) {
          const comparableValue = convertToComparableValue(compound.concentration, compound.concentrationUnit);
          if (!currentCompoundComparableValues.has(compound.name)) {
            currentCompoundComparableValues.set(compound.name, new Set());
          }
          currentCompoundComparableValues.get(compound.name)!.add(comparableValue);
        }
      });
      
      // Process cell lines
      wellData.cellLines.forEach(cellLine => {
        if (cellLine.name && cellLine.densityCoefficient > 0) {
          const comparableValue = convertToComparableDensity(cellLine.density, cellLine.densityCoefficient);
          if (!currentCellLineComparableValues.has(cellLine.name)) {
            currentCellLineComparableValues.set(cellLine.name, new Set());
          }
          currentCellLineComparableValues.get(cellLine.name)!.add(comparableValue);
        }
      });
    });
    
    // Filter editedLegendConcentrations to only include currently present values
    const filteredEditedLegendConcentrations = new Map<string, Map<number, string>>();
    editedLegendConcentrations.forEach((innerMap, compoundName) => {
      const currentValues = currentCompoundComparableValues.get(compoundName);
      if (currentValues && currentValues.size > 0) {
        const filteredInnerMap = new Map<number, string>();
        innerMap.forEach((editedText, comparableValue) => {
          if (currentValues.has(comparableValue)) {
            filteredInnerMap.set(comparableValue, editedText);
          }
        });
        if (filteredInnerMap.size > 0) {
          filteredEditedLegendConcentrations.set(compoundName, filteredInnerMap);
        }
      }
    });
    
    // Filter editedLegendDensities to only include currently present values
    const filteredEditedLegendDensities = new Map<string, Map<number, string>>();
    editedLegendDensities.forEach((innerMap, cellLineName) => {
      const currentValues = currentCellLineComparableValues.get(cellLineName);
      if (currentValues && currentValues.size > 0) {
        const filteredInnerMap = new Map<number, string>();
        innerMap.forEach((editedText, comparableValue) => {
          if (currentValues.has(comparableValue)) {
            filteredInnerMap.set(comparableValue, editedText);
          }
        });
        if (filteredInnerMap.size > 0) {
          filteredEditedLegendDensities.set(cellLineName, filteredInnerMap);
        }
      }
    });
    
    // Update state only if there are actual changes to prevent infinite loops
    if (!areMapsOfMapsEqual(editedLegendConcentrations, filteredEditedLegendConcentrations)) {
      setEditedLegendConcentrations(filteredEditedLegendConcentrations);
    }
    
    if (!areMapsOfMapsEqual(editedLegendDensities, filteredEditedLegendDensities)) {
      setEditedLegendDensities(filteredEditedLegendDensities);
    }
  }, [plateData, editedLegendConcentrations, editedLegendDensities, areMapsOfMapsEqual, isLegendEditing]);

  const handleMouseDown = (well: string) => {
    dragStartRef.current = well;
    dragEndRef.current = well;
    setCurrentDragSelection([well]);
    setIsDragging(true);
  };

  const handleMouseEnter = (well: string) => {
    if (!dragStartRef.current) return;
    dragEndRef.current = well;
    const wellsInRange = getWellsInRange(dragStartRef.current, well);
    setCurrentDragSelection(wellsInRange);
  };

  const checkForDuplicates = (validCompounds: CompoundInput[], validCellLines: CellLineInput[]) => {
    const duplicates: string[] = [];
    
    const compoundNames = validCompounds.map(c => c.name.toLowerCase());
    const compoundDuplicates = compoundNames.filter((name, index) => compoundNames.indexOf(name) !== index);
    if (compoundDuplicates.length > 0) {
      duplicates.push(...compoundDuplicates.map(name => `Duplicate compound: ${name}`));
    }
    
    const cellLineNames = validCellLines.map(c => c.name.toLowerCase());
    const cellLineDuplicates = cellLineNames.filter((name, index) => cellLineNames.indexOf(name) !== index);
    if (cellLineDuplicates.length > 0) {
      duplicates.push(...cellLineDuplicates.map(name => `Duplicate cell line: ${name}`));
    }
    
    return [...new Set(duplicates)];
  };

  const applyToWells = () => {
    if (selectedWells.length === 0) return;

    // Process empty names for new entries - ALWAYS generates Empty-X for empty names
    const processedCompounds = processEmptyNames(
      compounds.filter(c => c.name.trim() || compounds.some(comp => comp.name.trim() === '')), 
      'compound'
    ) as CompoundInput[];
    
    const processedCellLines = processEmptyNames(
      cellLines.filter(c => c.name.trim() || cellLines.some(cell => cell.name.trim() === '')), 
      'cellLine'
    ) as CellLineInput[];

    // Update the original arrays with processed names
    setCompounds(processedCompounds);
    setCellLines(processedCellLines);

    // Filter valid items (now all should have names)
    const validCompounds = processedCompounds.filter(c => c.name);
    const validCellLines = processedCellLines.filter(c => c.name);

    if (validCompounds.length === 0 && validCellLines.length === 0) return;

    const duplicates = checkForDuplicates(validCompounds, validCellLines);
    if (duplicates.length > 0) {
      alert(`Duplicate names detected within the same category. Each compound must have a unique name among compounds, and each cell line must have a unique name among cell lines. Please review and correct the following duplicates: ${duplicates.join(', ')}`);
      return;
    }

    const newCompoundNames = new Set([...appliedCompounds, ...validCompounds.map(c => c.name)]);
    const newCellLineNames = new Set([...appliedCellLines, ...validCellLines.map(c => c.name)]);

    if (newCellLineNames.size > MAX_CELL_LINES) {
      alert(`Maximum of ${MAX_CELL_LINES} different cell lines can be applied to the table.`);
      return;
    }

    const { newCompoundColorMap, newCellLineShapeMap, newCompoundIntensityMap, newCompoundValues, newCompoundGradientContrastMap } = assignColorsAndShapes(validCompounds, validCellLines);

    // Update the global state maps with the new assignments
    setCompoundColorMap(newCompoundColorMap);
    setCellLineShapeMap(newCellLineShapeMap);
    setCompoundIntensityMap(newCompoundIntensityMap);
    setCompoundValues(newCompoundValues);
    setCompoundGradientContrastMap(newCompoundGradientContrastMap);

    const newCompoundNamesList = validCompounds.map(c => c.name);
    const newCellLineNamesList = validCellLines.map(c => c.name);
    const referenceCompounds = findBestReferenceCell(plateData, newCompoundNamesList);
    const referenceCellLines = findBestReferenceCellForCellLines(plateData, newCellLineNamesList);

    const newPlateData = { ...plateData };
    selectedWells.forEach(well => {
      const existingWell = newPlateData[well] || { compounds: [], cellLines: [] };
      
      let compoundsWithColors = validCompounds.length > 0 ? validCompounds.map(compound => ({
        name: compound.name,
        concentration: compound.concentration || '',
        concentrationUnit: compound.concentrationUnit,
        color: newCompoundColorMap.get(compound.name) || COLORS[0]
      })) : existingWell.compounds;

      let cellLinesWithShapes = validCellLines.length > 0 ? validCellLines.map(cellLine => ({
        name: cellLine.name,
        density: cellLine.density,
        densityCoefficient: cellLine.densityCoefficient,
        densityUnit: cellLine.densityUnit,
        shape: newCellLineShapeMap.get(cellLine.name) || SHAPES[0]
      })) : existingWell.cellLines;

      if (validCompounds.length > 0 && referenceCompounds) {
        compoundsWithColors = rearrangeCompoundsByPosition(compoundsWithColors, referenceCompounds);
      }

      if (validCellLines.length > 0 && referenceCellLines) {
        cellLinesWithShapes = rearrangeCellLinesByPosition(cellLinesWithShapes, referenceCellLines);
      }

      newPlateData[well] = {
        compounds: compoundsWithColors,
        cellLines: cellLinesWithShapes
      };
    });

    const tempCompounds = new Set<string>();
    const tempCellLines = new Set<string>();
    
    Object.values(newPlateData).forEach(well => {
      well.compounds.forEach(compound => {
        if (compound.name) tempCompounds.add(compound.name);
      });
      well.cellLines.forEach(cellLine => {
        if (cellLine.name) tempCellLines.add(cellLine.name);
      });
    });

    setAppliedCompounds(tempCompounds);
    setAppliedCellLines(tempCellLines);

    // Update persistent tracking
    setEverAppliedCompounds(prev => new Set([...prev, ...tempCompounds]));
    setEverAppliedCellLines(prev => new Set([...prev, ...tempCellLines]));

    // Update compound unit types
    validCompounds.forEach(compound => {
      if (compound.name.trim() && compound.concentrationUnit) {
        updateCompoundUnitType(compound.name, compound.concentrationUnit);
      }
    });

    let finalPlateData = applyConcentrationGradient(newPlateData, newCompoundColorMap, newCompoundIntensityMap, newCompoundValues, newCompoundGradientContrastMap);
    finalPlateData = applyDensityGradient(finalPlateData, newCellLineShapeMap);

    setPlateData(finalPlateData);
    setSelectedWells([]);
  };

  const clearSelected = () => {
    const newPlateData = { ...plateData };
    selectedWells.forEach(well => {
      delete newPlateData[well];
    });
    setPlateData(newPlateData);
    setSelectedWells([]);
    updateAppliedItems(newPlateData);
  };

  const applyPositionMatchingToAllWells = (newPlateData: PlateData, itemType: 'compound' | 'cellLine') => {
    const updatedPlateData = { ...newPlateData };
    
    if (itemType === 'compound') {
      const allCompoundNames = Array.from(appliedCompounds);
      const referenceCompounds = findBestReferenceCell(updatedPlateData, allCompoundNames);
      
      Object.keys(updatedPlateData).forEach(wellId => {
        const wellData = updatedPlateData[wellId];
        if (wellData.compounds && wellData.compounds.length > 0) {
          wellData.compounds = rearrangeCompoundsByPosition(wellData.compounds, referenceCompounds);
        }
      });
    } else {
      const allCellLineNames = Array.from(appliedCellLines);
      const referenceCellLines = findBestReferenceCellForCellLines(updatedPlateData, allCellLineNames);
      
      Object.keys(updatedPlateData).forEach(wellId => {
        const wellData = updatedPlateData[wellId];
        if (wellData.cellLines && wellData.cellLines.length > 0) {
          wellData.cellLines = rearrangeCellLinesByPosition(wellData.cellLines, referenceCellLines);
        }
      });
    }
    
    return updatedPlateData;
  };

  const removeFromSelectedWells = () => {
    if (selectedWells.length === 0) return;

    const newPlateData = { ...plateData };
    
    selectedWells.forEach(well => {
      const wellData = newPlateData[well];
      if (!wellData) return;

      if (viewMode === 'compound') {
        wellData.compounds = wellData.compounds.filter(c => c.name !== selectedItem);
        
        if (wellData.compounds.length === 0 && wellData.cellLines.length === 0) {
          delete newPlateData[well];
        }
      } else if (viewMode === 'cellLine') {
        wellData.cellLines = wellData.cellLines.filter(c => c.name !== selectedItem);
        
        if (wellData.compounds.length === 0 && wellData.cellLines.length === 0) {
          delete newPlateData[well];
        }
      }
    });

    let finalPlateData = applyPositionMatchingToAllWells(newPlateData, viewMode as 'compound' | 'cellLine');
    
    if (viewMode === 'compound') {
      finalPlateData = applyConcentrationGradient(finalPlateData, compoundColorMap, compoundIntensityMap, compoundValues, compoundGradientContrastMap);
    } else {
      finalPlateData = applyDensityGradient(finalPlateData, cellLineShapeMap);
    }
    
    setPlateData(finalPlateData);
    updateAppliedItems(finalPlateData);
    setSelectedWells([]);
  };

  const applyIndividualToWells = (item: any = null, finalCompoundDilutionFactor?: number, finalCellLineDilutionFactor?: number) => {
    if (selectedWells.length === 0) return;

    let validItem: any = null;
    let itemType: 'compound' | 'cellLine' = 'compound';

    if (viewMode === 'compound') {
      // Handle empty name assignment for individual compound
      if (individualCompound.name.trim() === '') {
        const existingNames = new Set([
          ...Array.from(everAppliedCompounds),
          ...Array.from(everAppliedCellLines)
        ]);
        const generatedName = generateEmptyName('compound', existingNames);
        setIndividualCompound(prev => ({ ...prev, name: generatedName }));
        setSelectedItem(generatedName);
        validItem = { ...individualCompound, name: generatedName };
      } else {
        validItem = individualCompound;
      }
      itemType = 'compound';
    } else if (viewMode === 'cellLine') {
      // Handle empty name assignment for individual cell line
      if (individualCellLine.name.trim() === '') {
        const existingNames = new Set([
          ...Array.from(everAppliedCompounds),
          ...Array.from(everAppliedCellLines)
        ]);
        const generatedName = generateEmptyName('cellLine', existingNames);
        setIndividualCellLine(prev => ({ ...prev, name: generatedName }));
        setSelectedItem(generatedName);
        validItem = { ...individualCellLine, name: generatedName };
      } else {
        validItem = individualCellLine;
      }
      itemType = 'cellLine';
    }

    if (!validItem) return;

    if (itemType === 'compound') {
      // No compound limit check needed
    } else {
      const newCellLineNames = new Set([...appliedCellLines, validItem.name]);
      if (newCellLineNames.size > MAX_CELL_LINES) {
        alert(`Maximum of ${MAX_CELL_LINES} different cell lines can be applied to the table.`);
        return;
      }
    }

    const { newCompoundColorMap, newCellLineShapeMap, newCompoundIntensityMap, newCompoundValues, newCompoundGradientContrastMap } = assignColorsAndShapes(
      itemType === 'compound' ? [validItem] : [],
      itemType === 'cellLine' ? [validItem] : []
    );

    // Update the global state maps with the new assignments
    setCompoundColorMap(newCompoundColorMap);
    setCellLineShapeMap(newCellLineShapeMap);
    setCompoundIntensityMap(newCompoundIntensityMap);
    setCompoundValues(newCompoundValues);
    setCompoundGradientContrastMap(newCompoundGradientContrastMap);

    const newPlateData = { ...plateData };
    
    selectedWells.forEach(well => {
      const existingWell = newPlateData[well] || { compounds: [], cellLines: [] };
      
      if (itemType === 'compound') {
        const existingCompoundIndex = existingWell.compounds.findIndex(c => c.name === validItem.name);
        
        const newCompound = {
          name: validItem.name,
          concentration: validItem.concentration || '',
          concentrationUnit: validItem.concentrationUnit,
          color: newCompoundColorMap.get(validItem.name) || COLORS[0]
        };

        if (existingCompoundIndex >= 0) {
          existingWell.compounds[existingCompoundIndex] = newCompound;
        } else {
          existingWell.compounds.push(newCompound);
        }
      } else {
        const existingCellLineIndex = existingWell.cellLines.findIndex(c => c.name === validItem.name);
        
        const newCellLine = {
          name: validItem.name,
          density: validItem.density,
          densityCoefficient: validItem.densityCoefficient,
          densityUnit: validItem.densityUnit,
          shape: newCellLineShapeMap.get(validItem.name) || SHAPES[0]
        };

        if (existingCellLineIndex >= 0) {
          existingWell.cellLines[existingCellLineIndex] = newCellLine;
        } else {
          existingWell.cellLines.push(newCellLine);
        }
      }

      newPlateData[well] = existingWell;
    });

    const tempCompounds = new Set<string>();
    const tempCellLines = new Set<string>();
    
    Object.values(newPlateData).forEach(well => {
      well.compounds.forEach(compound => {
        if (compound.name) tempCompounds.add(compound.name);
      });
      well.cellLines.forEach(cellLine => {
        if (cellLine.name) tempCellLines.add(cellLine.name);
      });
    });

    setAppliedCompounds(tempCompounds);
    setAppliedCellLines(tempCellLines);

    // Update persistent tracking
    setEverAppliedCompounds(prev => new Set([...prev, ...tempCompounds]));
    setEverAppliedCellLines(prev => new Set([...prev, ...tempCellLines]));

    // Update compound unit type if applying a compound
    if (itemType === 'compound' && validItem.name && validItem.concentrationUnit) {
      updateCompoundUnitType(validItem.name, validItem.concentrationUnit);
    }

    // Apply position matching to maintain consistent ordering
    let finalPlateData = applyPositionMatchingToAllWells(newPlateData, itemType);
    
    // Apply gradients after position matching
    if (itemType === 'compound') {
      finalPlateData = applyConcentrationGradient(finalPlateData, newCompoundColorMap, newCompoundIntensityMap, newCompoundValues, newCompoundGradientContrastMap);
    } else {
      finalPlateData = applyDensityGradient(finalPlateData, newCellLineShapeMap);
    }
    
    setPlateData(finalPlateData);
    setSelectedWells([]);

    // Apply dilution factor after applying to wells
    if (itemType === 'compound') {
      const effectiveCompoundDilutionFactor = finalCompoundDilutionFactor || 1;
      if (effectiveCompoundDilutionFactor > 1) {
        const currentConcentration = parseFloat(individualCompound.concentration);
        if (!isNaN(currentConcentration)) {
          const newConcentration = currentConcentration / effectiveCompoundDilutionFactor;
          setIndividualCompound(prev => ({
            ...prev,
            concentration: newConcentration.toString()
          }));
        }
      }
    } else if (itemType === 'cellLine') {
      const effectiveCellLineDilutionFactor = finalCellLineDilutionFactor || 1;
      if (effectiveCellLineDilutionFactor > 1) {
        const currentDensityCoefficient = individualCellLine.densityCoefficient || 0;
        if (currentDensityCoefficient > 0) {
          const newDensityCoefficient = currentDensityCoefficient / effectiveCellLineDilutionFactor;
          setIndividualCellLine(prev => ({
            ...prev,
            densityCoefficient: newDensityCoefficient
          }));
        }
      }
    }
  };

  // Helper function to get all internal names currently in plate data
  const getAllNamesFromPlateData = (): Set<string> => {
    const allNames = new Set<string>();
    
    Object.values(plateData).forEach(wellData => {
      wellData.compounds.forEach(compound => {
        if (compound.name) {
          allNames.add(compound.name);
        }
      });
      wellData.cellLines.forEach(cellLine => {
        if (cellLine.name) {
          allNames.add(cellLine.name);
        }
      });
    });
    
    return allNames;
  };

  const updateIndividualCompoundName = (newName: string) => {
    // Always update the temporary input value to allow free typing
    setTempInputValue(newName);
    
    const oldName = individualCompound.name;
    
    // Check for duplicates if the new name is different from the old name
    if (newName !== oldName && newName !== '') {
      // Get all existing compound names except the current one
      const allExistingNames = new Set<string>();
      
      // Add names from everAppliedCompounds (except current)
      everAppliedCompounds.forEach(name => {
        if (name !== oldName) {
          allExistingNames.add(name);
        }
      });
      
      // Check if the new name already exists
      if (allExistingNames.has(newName)) {
        setDuplicateNameError(`Compound name "${newName}" already exists.`);
        return; // Don't update the actual name, but keep the input value
      }
    }
    
    // Clear any existing error
    setDuplicateNameError('');
    setKeepIndividualNameEmpty(false);
    
    // If user is clearing the name (newName is empty but oldName exists)
    if (oldName && oldName !== '' && newName === '') {
      const existingNames = new Set([
        ...Array.from(everAppliedCompounds)
      ]);
      const generatedName = generateEmptyName('compound', existingNames);
      
      // ALWAYS update persistent tracking and color mapping regardless of plate data
      const newEverAppliedCompounds = new Set(everAppliedCompounds);
      newEverAppliedCompounds.delete(oldName);
      newEverAppliedCompounds.add(generatedName);
      setEverAppliedCompounds(newEverAppliedCompounds);

      // ALWAYS update color mapping
      const newCompoundColorMap = new Map(compoundColorMap);
      if (newCompoundColorMap.has(oldName)) {
        const color = newCompoundColorMap.get(oldName)!;
        newCompoundColorMap.delete(oldName);
        newCompoundColorMap.set(generatedName, color);
        setCompoundColorMap(newCompoundColorMap);
      }

      // ALWAYS update intensity and value mappings
      const oldIntensity = compoundIntensityMap[oldName];
      const oldValue = compoundValues[oldName];
      const oldGradientContrast = compoundGradientContrastMap[oldName];
      const newCompoundIntensityMap = { ...compoundIntensityMap };
      const newCompoundValuesMap = { ...compoundValues };
      const newCompoundGradientContrastMap = { ...compoundGradientContrastMap };
      
      if (oldIntensity !== undefined) {
        delete newCompoundIntensityMap[oldName];
        newCompoundIntensityMap[generatedName] = oldIntensity;
      }
      if (oldValue !== undefined) {
        delete newCompoundValuesMap[oldName];
        newCompoundValuesMap[generatedName] = oldValue;
      }
      if (oldGradientContrast !== undefined) {
        delete newCompoundGradientContrastMap[oldName];
        newCompoundGradientContrastMap[generatedName] = oldGradientContrast;
      }

      // Update state with new maps
      setCompoundIntensityMap(newCompoundIntensityMap);
      setCompoundValues(newCompoundValuesMap);
      setCompoundGradientContrastMap(newCompoundGradientContrastMap);

      // ALWAYS update selectedItem
      setSelectedItem(generatedName);
      
      // Update all wells that contain the old name
      const newPlateData = { ...plateData };
      let hasChanges = false;

      Object.keys(newPlateData).forEach(wellId => {
        const wellData = newPlateData[wellId];
        if (wellData.compounds) {
          wellData.compounds.forEach(compound => {
            if (compound.name === oldName) {
              compound.name = generatedName;
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        // Apply concentration gradient
        const finalPlateData = applyConcentrationGradient(newPlateData, newCompoundColorMap, newCompoundIntensityMap, newCompoundValuesMap, newCompoundGradientContrastMap);
        setPlateData(finalPlateData);
        updateAppliedItems(finalPlateData);
      }
      
      // Set individual compound to generated name but keep input empty
      setIndividualCompound(prev => ({ ...prev, name: generatedName }));
      setKeepIndividualNameEmpty(true);
      setTempInputValue('');
      return;
    }
    
    // Normal name update (including typing in the field)
    setIndividualCompound(prev => ({ ...prev, name: newName }));

    // If there's an old name and it's different from new name, update all wells
    if (oldName && oldName !== newName && oldName !== '') {
      // ALWAYS update persistent tracking and color mapping regardless of plate data
      const newEverAppliedCompounds = new Set(everAppliedCompounds);
      newEverAppliedCompounds.delete(oldName);
      if (newName) {
        newEverAppliedCompounds.add(newName);
      }
      setEverAppliedCompounds(newEverAppliedCompounds);

      // ALWAYS update color mapping
      const newCompoundColorMap = new Map(compoundColorMap);
      if (newCompoundColorMap.has(oldName)) {
        const color = newCompoundColorMap.get(oldName)!;
        newCompoundColorMap.delete(oldName);
        if (newName) {
          newCompoundColorMap.set(newName, color);
        }
      }
      setCompoundColorMap(newCompoundColorMap);

      // ALWAYS update intensity and value mappings
      const oldIntensity = compoundIntensityMap[oldName];
      const oldValue = compoundValues[oldName];
      const oldGradientContrast = compoundGradientContrastMap[oldName];
      const newCompoundIntensityMap = { ...compoundIntensityMap };
      const newCompoundValuesMap = { ...compoundValues };
      const newCompoundGradientContrastMap = { ...compoundGradientContrastMap };
      
      if (oldIntensity !== undefined) {
        delete newCompoundIntensityMap[oldName];
        if (newName) {
          newCompoundIntensityMap[newName] = oldIntensity;
        }
      }
      if (oldValue !== undefined) {
        delete newCompoundValuesMap[oldName];
        if (newName) {
          newCompoundValuesMap[newName] = oldValue;
        }
      }
      if (oldGradientContrast !== undefined) {
        delete newCompoundGradientContrastMap[oldName];
        if (newName) {
          newCompoundGradientContrastMap[newName] = oldGradientContrast;
        }
      }

      // Update state with new maps
      setCompoundIntensityMap(newCompoundIntensityMap);
      setCompoundValues(newCompoundValuesMap);
      setCompoundGradientContrastMap(newCompoundGradientContrastMap);

      // ALWAYS update selectedItem
      // ALWAYS update unit type tracking
      const newCompoundUnitTypes = new Map(compoundUnitTypes);
      newCompoundUnitTypes.delete(oldName);
      if (newName) {
        // Preserve unit type if it exists
        const existingUnitType = compoundUnitTypes.get(oldName);
        if (existingUnitType) {
          newCompoundUnitTypes.set(newName, existingUnitType);
        }
      }
      setCompoundUnitTypes(newCompoundUnitTypes);

      setSelectedItem(newName);
      
      const newPlateData = { ...plateData };
      let hasChanges = false;

      Object.keys(newPlateData).forEach(wellId => {
        const wellData = newPlateData[wellId];
        if (wellData.compounds) {
          wellData.compounds.forEach(compound => {
            if (compound.name === oldName) {
              compound.name = newName;
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        const finalPlateData = applyConcentrationGradient(newPlateData, newCompoundColorMap, newCompoundIntensityMap, newCompoundValuesMap, newCompoundGradientContrastMap);
        
        setPlateData(finalPlateData);
        updateAppliedItems(finalPlateData);
      }
    }
  };

  const updateIndividualCellLineName = (newName: string) => {
    // Always update the temporary input value to allow free typing
    setTempInputValue(newName);
    
    const oldName = individualCellLine.name;
    
    // Check for duplicates if the new name is different from the old name
    if (newName !== oldName && newName !== '') {
      // Get all existing cell line names except the current one
      const allExistingNames = new Set<string>();
      
      // Add names from everAppliedCellLines (except current)
      everAppliedCellLines.forEach(name => {
        if (name !== oldName) {
          allExistingNames.add(name);
        }
      });
      
      // Check if the new name already exists
      if (allExistingNames.has(newName)) {
        setDuplicateNameError(`Cell line name "${newName}" already exists.`);
        return; // Don't update the actual name, but keep the input value
      }
    }
    
    // Clear any existing error
    setDuplicateNameError('');
    setKeepIndividualNameEmpty(false);
    
    // If user is clearing the name (newName is empty but oldName exists)
    if (oldName && oldName !== '' && newName === '') {
      const existingNames = new Set([
        ...Array.from(everAppliedCellLines)
      ]);
      const generatedName = generateEmptyName('cellLine', existingNames);
      
      // ALWAYS update persistent tracking and shape mapping regardless of plate data
      const newEverAppliedCellLines = new Set(everAppliedCellLines);
      newEverAppliedCellLines.delete(oldName);
      newEverAppliedCellLines.add(generatedName);
      setEverAppliedCellLines(newEverAppliedCellLines);

      // ALWAYS update shape mapping
      const newCellLineShapeMap = new Map(cellLineShapeMap);
      if (newCellLineShapeMap.has(oldName)) {
        const shape = newCellLineShapeMap.get(oldName)!;
        newCellLineShapeMap.delete(oldName);
        newCellLineShapeMap.set(generatedName, shape);
        setCellLineShapeMap(newCellLineShapeMap);
      }

      // ALWAYS update selectedItem
      setSelectedItem(generatedName);
      
      // Update all wells that contain the old name
      const newPlateData = { ...plateData };
      let hasChanges = false;

      Object.keys(newPlateData).forEach(wellId => {
        const wellData = newPlateData[wellId];
        if (wellData.cellLines) {
          wellData.cellLines.forEach(cellLine => {
            if (cellLine.name === oldName) {
              cellLine.name = generatedName;
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        const finalPlateData = applyDensityGradient(newPlateData, cellLineShapeMap);
        
        setPlateData(finalPlateData);
        updateAppliedItems(finalPlateData);
      }
      
      // Set individual cell line to generated name but keep input empty
      setIndividualCellLine(prev => ({ ...prev, name: generatedName }));
      setKeepIndividualNameEmpty(true);
      setTempInputValue('');
      return;
    }
    
    // Normal name update (including typing in the field)
    setIndividualCellLine(prev => ({ ...prev, name: newName }));

    // If there's an old name and it's different from new name, update all wells
    if (oldName && oldName !== newName && oldName !== '') {
      // ALWAYS update persistent tracking and shape mapping regardless of plate data
      const newEverAppliedCellLines = new Set(everAppliedCellLines);
      newEverAppliedCellLines.delete(oldName);
      if (newName) {
        newEverAppliedCellLines.add(newName);
      }
      setEverAppliedCellLines(newEverAppliedCellLines);

      // ALWAYS update shape mapping
      const newCellLineShapeMap = new Map(cellLineShapeMap);
      if (newCellLineShapeMap.has(oldName)) {
        const shape = newCellLineShapeMap.get(oldName)!;
        newCellLineShapeMap.delete(oldName);
        if (newName) {
          newCellLineShapeMap.set(newName, shape);
        }
      }
      setCellLineShapeMap(newCellLineShapeMap);

      // ALWAYS update selectedItem
      setSelectedItem(newName);
      
      const newPlateData = { ...plateData };
      let hasChanges = false;

      Object.keys(newPlateData).forEach(wellId => {
        const wellData = newPlateData[wellId];
        if (wellData.cellLines) {
          wellData.cellLines.forEach(cellLine => {
            if (cellLine.name === oldName) {
              cellLine.name = newName;
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        const finalPlateData = applyDensityGradient(newPlateData, cellLineShapeMap);
        
        setPlateData(finalPlateData);
        updateAppliedItems(finalPlateData);
      }
    }
  };

  // Effect to sync tempInputValue with actual names when switching views
  useEffect(() => {
    if (viewMode === 'compound') {
      setTempInputValue(keepIndividualNameEmpty ? '' : individualCompound.name);
    } else if (viewMode === 'cellLine') {
      setTempInputValue(keepIndividualNameEmpty ? '' : individualCellLine.name);
    }
    setDuplicateNameError('');
  }, [viewMode, selectedItem, keepIndividualNameEmpty, individualCompound.name, individualCellLine.name]);

  // Clear error when switching between views
  useEffect(() => {
    setDuplicateNameError('');
  }, [viewMode]);

  const deleteCompoundFromDisplay = (compoundName: string) => {
    const newPlateData = { ...plateData };
    let hasChanges = false;

    // Remove compound from all wells
    Object.keys(newPlateData).forEach(wellId => {
      const wellData = newPlateData[wellId];
      if (wellData.compounds) {
        const originalLength = wellData.compounds.length;
        wellData.compounds = wellData.compounds.filter(c => c.name !== compoundName);
        
        if (wellData.compounds.length !== originalLength) {
          hasChanges = true;
        }
        
        // Remove well if it becomes empty
        if (wellData.compounds.length === 0 && wellData.cellLines.length === 0) {
          delete newPlateData[wellId];
        }
      }
    });

    if (hasChanges) {
      // Apply gradients and update state
      const finalPlateData = applyConcentrationGradient(newPlateData, compoundColorMap, compoundIntensityMap, compoundValues, compoundGradientContrastMap);
      setPlateData(finalPlateData);
      updateAppliedItems(finalPlateData);

      // If currently viewing this compound in individual mode, return to main
      if (viewMode === 'compound' && selectedItem.trim() === compoundName.trim()) {
        setViewMode('main');
        setSelectedItem('');
        setSelectedWells([]);
      }
    }

    // Remove from color mapping
    const newCompoundColorMap = new Map(compoundColorMap);
    newCompoundColorMap.delete(compoundName);
    setCompoundColorMap(newCompoundColorMap);

    // Remove from unit type tracking
    const newCompoundUnitTypes = new Map(compoundUnitTypes);
    newCompoundUnitTypes.delete(compoundName);
    setCompoundUnitTypes(newCompoundUnitTypes);

    // Remove from persistent tracking
    const newEverAppliedCompounds = new Set(everAppliedCompounds);
    newEverAppliedCompounds.delete(compoundName);
    setEverAppliedCompounds(newEverAppliedCompounds);

    // Remove from gradient contrast mapping
    const newCompoundGradientContrastMap = { ...compoundGradientContrastMap };
    delete newCompoundGradientContrastMap[compoundName];
    setCompoundGradientContrastMap(newCompoundGradientContrastMap);
  };

  // Handlers for legend editing
  const handleEditLegendCompoundConcentration = (compoundName: string, comparableValue: number, newText: string) => {
    setEditedLegendConcentrations(prev => {
      const newMap = new Map(prev);
      const compoundMap = newMap.get(compoundName) || new Map();
      compoundMap.set(comparableValue, newText);
      newMap.set(compoundName, compoundMap);
      return newMap;
    });
  };

  const handleEditLegendCellLineDensity = (cellLineName: string, comparableValue: number, newText: string) => {
    setEditedLegendDensities(prev => {
      const newMap = new Map(prev);
      const cellLineMap = newMap.get(cellLineName) || new Map();
      cellLineMap.set(comparableValue, newText);
      newMap.set(cellLineName, cellLineMap);
      return newMap;
    });
  };

  const deleteCellLineFromDisplay = (cellLineName: string) => {
    const newPlateData = { ...plateData };
    let hasChanges = false;

    // Remove cell line from all wells
    Object.keys(newPlateData).forEach(wellId => {
      const wellData = newPlateData[wellId];
      if (wellData.cellLines) {
        const originalLength = wellData.cellLines.length;
        wellData.cellLines = wellData.cellLines.filter(c => c.name !== cellLineName);
        
        if (wellData.cellLines.length !== originalLength) {
          hasChanges = true;
        }
        
        // Remove well if it becomes empty
        if (wellData.compounds.length === 0 && wellData.cellLines.length === 0) {
          delete newPlateData[wellId];
        }
      }
    });

    if (hasChanges) {
      // Apply gradients and update state
      const finalPlateData = applyDensityGradient(newPlateData, cellLineShapeMap);
      setPlateData(finalPlateData);
      updateAppliedItems(finalPlateData);

      // If currently viewing this cell line in individual mode, return to main
      if (viewMode === 'cellLine' && selectedItem.trim() === cellLineName.trim()) {
        setViewMode('main');
        setSelectedItem('');
        setSelectedWells([]);
      }
    }

    // Remove from shape mapping
    const newCellLineShapeMap = new Map(cellLineShapeMap);
    newCellLineShapeMap.delete(cellLineName);
    setCellLineShapeMap(newCellLineShapeMap);

    // Remove from persistent tracking
    const newEverAppliedCellLines = new Set(everAppliedCellLines);
    newEverAppliedCellLines.delete(cellLineName);
    setEverAppliedCellLines(newEverAppliedCellLines);
  };

  const createNewCompoundIndividualView = () => {
    // Generate a unique empty name
    const existingNames = new Set([
      ...Array.from(everAppliedCompounds)
    ]);
    const generatedName = generateEmptyName('compound', existingNames);

    // Assign color
    const usedColors = new Set(compoundColorMap.values());
    const newColor = getNextAvailableColor(usedColors);
    const newCompoundColorMap = new Map(compoundColorMap);
    newCompoundColorMap.set(generatedName, newColor);
    setCompoundColorMap(newCompoundColorMap);

    // Add to persistent tracking
    setEverAppliedCompounds(prev => new Set([...prev, generatedName]));

    // Initialize gradient contrast
    const newCompoundGradientContrastMap = { ...compoundGradientContrastMap };
    newCompoundGradientContrastMap[generatedName] = 0.3;
    setCompoundGradientContrastMap(newCompoundGradientContrastMap);

    // Don't auto-navigate - user stays in main table
  };

  const createNewCellLineIndividualView = () => {
    if (everAppliedCellLines.size >= MAX_CELL_LINES) {
      alert(`Maximum of ${MAX_CELL_LINES} different cell lines can be applied to the table.`);
      return;
    }

    // Generate a unique empty name
    const existingNames = new Set([
      ...Array.from(everAppliedCellLines)
    ]);
    const generatedName = generateEmptyName('cellLine', existingNames);

    // Assign shape
    const usedShapes = new Set(cellLineShapeMap.values());
    const newShape = getNextAvailableShape(usedShapes);
    const newCellLineShapeMap = new Map(cellLineShapeMap);
    newCellLineShapeMap.set(generatedName, newShape);
    setCellLineShapeMap(newCellLineShapeMap);

    // Add to persistent tracking
    setEverAppliedCellLines(prev => new Set([...prev, generatedName]));

    // Don't auto-navigate - user stays in main table
  };

  const renderShape = (shape: string, size: number = 20, color: string = '#000000') => {
    let actualShape = shape;
    let actualColor = color;
    
    if (shape.includes('-#')) {
      const parts = shape.split('-#');
      actualShape = parts[0];
      actualColor = '#' + parts[1];
    }
    
    const shapeSize = size;
    
    switch (actualShape) {
      case 'circle':
        return (
          <div
            className="rounded-full"
            style={{
              width: shapeSize,
              height: shapeSize,
              backgroundColor: actualColor
            }}
          />
        );
      case 'triangle':
        return (
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: `${shapeSize/2}px solid transparent`,
              borderRight: `${shapeSize/2}px solid transparent`,
              borderBottom: `${shapeSize}px solid ${actualColor}`,
            }}
          />
        );
      case 'square':
        return (
          <div
            style={{
              width: shapeSize,
              height: shapeSize,
              backgroundColor: actualColor
            }}
          />
        );
      case 'diamond':
        return (
          <div
            style={{
              width: shapeSize,
              height: shapeSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div
              style={{
                width: shapeSize / 1.3,
                height: shapeSize / 1.3,
                backgroundColor: actualColor,
                transform: 'rotate(45deg)'
              }}
            />
          </div>
        );
      case 'star':
        return (
          <div
            style={{
              width: shapeSize * 1.2,
              height: shapeSize * 1.2,
              overflow: 'visible',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div
              style={{
                width: shapeSize * 1.2,
                height: shapeSize * 1.2,
                backgroundColor: actualColor,
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
              }}
            />
          </div>
        );
      case 'plus':
        return (
          <div
            style={{
              width: shapeSize,
              height: shapeSize,
              backgroundColor: actualColor,
              clipPath: 'polygon(30% 0%, 70% 0%, 70% 30%, 100% 30%, 100% 70%, 70% 70%, 70% 100%, 30% 100%, 30% 70%, 0% 70%, 0% 30%, 30% 30%)'
            }}
          />
        );
      default:
        return null;
    }
  };

  const renderWellContent = (wellData: WellData, itemName?: string, itemType?: 'compound' | 'cellLine') => {
    if (itemName && itemType) {
      if (itemType === 'compound') {
        const filteredCompounds = wellData.compounds.filter(c => c.name === itemName);
        const filteredWellData = { compounds: filteredCompounds, cellLines: [] };
        return renderWellContentInternal(filteredWellData, wellDiameter);
      } else {
        const filteredCellLines = wellData.cellLines.filter(c => c.name === itemName);
        const filteredWellData = { compounds: [], cellLines: filteredCellLines };
        return renderWellContentInternal(filteredWellData, wellDiameter);
      }
    }
    
    return renderWellContentInternal(wellData, wellDiameter);
  };

  const renderWellContentInternal = (wellData: WellData, wellDiameterForRender: number = 0) => {
    const numCompounds = wellData.compounds.length;
    const numCellLines = wellData.cellLines.length;
    // Calculate dynamic sizes based on well diameter
    const effectiveWellDiameter = wellDiameterForRender || 60; // fallback if not measured yet
    const largeShapeSize = effectiveWellDiameter / 4;
    const smallShapeSize = effectiveWellDiameter / 5.3;
    const mediumShapeSize = effectiveWellDiameter / 5.2;
    
    const largeGap = effectiveWellDiameter * 0.07;
    const mediumGap = effectiveWellDiameter * 0.05;
    
    let shapeSize: number;
    let gap: number;
    
    if (numCellLines <= 2) {
      shapeSize = largeShapeSize;
      gap = largeGap;
    } else if (numCellLines === 3) {
      shapeSize = mediumShapeSize;
      gap = mediumGap;
    } else {
      shapeSize = smallShapeSize;
      gap = mediumGap;
    }
    
    return (
      <div className="w-full h-full rounded-full relative overflow-hidden">
        {numCompounds === 0 ? (
          <div className="w-full h-full rounded-full bg-gray-50" />
        ) : numCompounds === 1 ? (
          <div
            className="w-full h-full rounded-full"
            style={{ 
              backgroundColor: wellData.compounds[0].color,
              transform: 'scale(1.05)'
            }}
          />
        ) : (
          wellData.compounds.map((compound, index) => {
            const percentage = 100 / numCompounds;
            const leftPosition = index * percentage;
            return (
              <div
                key={`${compound.name}-${index}`}
                className="absolute"
                style={{
                  top: 0,
                  backgroundColor: compound.color,
                  left: `${leftPosition}%`,
                  width: `${percentage}%`,
                  height: '100%'
                }}
              />
            );
          })
        )}
        
        {numCellLines > 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-1">
            {numCellLines <= 3 ? (
              <div 
                className="flex items-center justify-center"
                style={{ gap: `${gap}px` }}
              >
                {wellData.cellLines.map((cellLine, index) => (
                  <div 
                    key={`${cellLine.name}-${index}`} 
                    className="flex items-center justify-center"
                    style={{ width: shapeSize, height: shapeSize }}
                  >
                    {renderShape(cellLine.shape, shapeSize, '#000')}
                  </div>
                ))}
              </div>
            ) : (
              <div 
                className="grid grid-cols-3 items-center justify-center"
                style={{ gap: `${gap}px` }}
              >
                {wellData.cellLines.map((cellLine, index) => (
                  <div 
                    key={`${cellLine.name}-${index}`} 
                    className="flex items-center justify-center"
                    style={{ width: shapeSize, height: shapeSize }}
                  >
                    {renderShape(cellLine.shape, shapeSize, '#000')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleCompoundClick = (compoundName: string) => {
    setViewMode('compound');
    setSelectedItem(compoundName);
    setSelectedWells([]);
    
    const existingWell = Object.values(plateData).find(well => 
      well.compounds.some(c => c.name === compoundName)
    );
    const existingCompound = existingWell?.compounds.find(c => c.name === compoundName);
    
    if (existingCompound) {
      // Check if this is an Empty-X compound
      const isEmptyCompound = compoundName.trim().startsWith('Empty-');
      setIndividualCompound({
        id: 'individual',
        name: existingCompound.name,
        concentration: existingCompound.concentration,
        concentrationUnit: existingCompound.concentrationUnit
      });
      setKeepIndividualNameEmpty(isEmptyCompound);
    } else {
      const isEmptyCompound = compoundName.trim().startsWith('Empty-');
      setIndividualCompound({
        id: 'individual',
        name: compoundName,
        concentration: '',
        concentrationUnit: 'µM'
      });
      setKeepIndividualNameEmpty(isEmptyCompound);
    }
  };

  const handleCellLineClick = (cellLineName: string) => {
    setViewMode('cellLine');
    setSelectedItem(cellLineName);
    setSelectedWells([]);
    
    const existingWell = Object.values(plateData).find(well => 
      well.cellLines.some(c => c.name === cellLineName)
    );
    const existingCellLine = existingWell?.cellLines.find(c => c.name === cellLineName);
    
    if (existingCellLine) {
      // Check if this is an Empty-X cell line
      const isEmptyCellLine = cellLineName.trim().startsWith('Empty-');
      setIndividualCellLine({
        id: 'individual',
        name: existingCellLine.name,
        density: existingCellLine.density,
        densityCoefficient: existingCellLine.densityCoefficient,
        densityUnit: existingCellLine.densityUnit
      });
      setKeepIndividualNameEmpty(isEmptyCellLine);
    } else {
      const isEmptyCellLine = cellLineName.trim().startsWith('Empty-');
      setIndividualCellLine({
        id: 'individual',
        name: cellLineName,
        density: 0,
        densityCoefficient: 0,
        densityUnit: 'Well'
      });
      setKeepIndividualNameEmpty(isEmptyCellLine);
    }
  };

  const handleBackToMain = () => {
    setViewMode('main');
    setSelectedItem('');
    setSelectedWells([]);
    setKeepIndividualNameEmpty(false);
  };

  const renderPlateTable = () => {
    const plateConfig = PLATE_CONFIGS[selectedPlateType];
    const gridWidth = 100 / plateConfig.columnGapFactor;
    const gridHeight = 100 / plateConfig.rowGapFactor;
    
    // Calculate total conceptual dimensions including padding
    const totalConceptualWidth = gridWidth + (2 * plateConfig.outerPaddingUnit) + (2 * plateConfig.innerPaddingUnit);
    const totalConceptualHeight = gridHeight + (2 * plateConfig.outerPaddingUnit) + (2 * plateConfig.innerPaddingUnit);
    
    // Calculate dynamic aspect ratio based on plate dimensions
    // Calculate dynamic aspect ratio based on plate configuration
    // Calculate ideal aspect ratio including padding
    // Grid content dimensions (wells + gaps)
    const gridWidth2 = 100 / columnGapFactor;
    const gridHeight2 = 100 / rowGapFactor;
    
    // Add padding to account for container padding (p-4 = 16px on each side = 10px total)
    const totalPadding = 10;
    const idealWidth = gridWidth2 + totalPadding;
    const idealHeight = gridHeight2 + totalPadding;
    const aspectRatio = `${idealWidth}/${idealHeight}`;
    
    return (
      <div data-export-container="true">
        <div 
          data-table="main-plate-table"
          className="relative bg-gray-200 rounded-2xl shadow-lg" 
          style={{ 
            aspectRatio: `${totalConceptualWidth}/${totalConceptualHeight}`,
            '--total-conceptual-width': totalConceptualWidth,
            '--outer-padding-units': plateConfig.outerPaddingUnit,
            '--plate-unit-size': 'calc(100% / var(--total-conceptual-width))',
            '--outer-padding-unit-val': plateConfig.outerPaddingUnit,
            '--inner-padding-unit-val': plateConfig.innerPaddingUnit,
            padding: `calc(var(--plate-unit-size) * var(--outer-padding-unit-val))`,
          } as React.CSSProperties}
        >
          {/* Column labels - top */}
          <div 
            data-label-type="column"
            className="absolute flex items-center justify-center"
            style={{
              top: 0,
              left: `calc(var(--plate-unit-size) * (var(--outer-padding-unit-val) + 1.3))`,
              right: `calc(var(--plate-unit-size) * (var(--outer-padding-unit-val) + 1.4))`,
              height: `calc(var(--plate-unit-size) * 1.4 * var(--outer-padding-unit-val))`
            }}
          >
            <div 
              className="flex-1 grid justify-items-center"
              style={{
                gridTemplateColumns: `repeat(${numCols}, 1fr)`,
                columnGap: `${columnGapFactor}%`
              }}
            >
              {currentCols.map(col => (
                <div
                  key={col}
                  className="flex items-center justify-center text-xs sm:text-sm md:text-base font-medium text-gray-600"
                >
                  {col}
                </div>
              ))}
            </div>
          </div>

          {/* Row labels - left side */}
          <div 
            data-label-type="row"
            className="absolute flex flex-col items-center"
            style={{
              left: 0,
              top: `calc(var(--plate-unit-size) * (var(--outer-padding-unit-val) + ${n1} * var(--inner-padding-unit-val)))`,
              height: `calc(100% - (var(--plate-unit-size) * 2 * (var(--outer-padding-unit-val) + ${n2} * var(--inner-padding-unit-val))))`,
              width: `calc(var(--plate-unit-size) * var(--outer-padding-unit-val))`,
            }}
          >
            <div 
              className="grid h-full"
              style={{
                gridTemplateRows: `repeat(${numRows}, 1fr)`
              }}
            >
              {currentRows.map(row => (
                <div 
                  key={row} 
                  className="w-6 sm:w-8 md:w-10 flex items-center justify-center text-sm sm:text-base font-semibold text-gray-700"
                >
                  {row}
                </div>
              ))}
            </div>
          </div>

          {/* Outer ring with rounded corners */}
          <div 
            data-wells-container="wells-grid"
            className="relative bg-white rounded-xl w-full h-full overflow-hidden"
            style={{
              padding: `calc(var(--plate-unit-size) * 1.5)`,
            } as React.CSSProperties}
          >
            {/* Wells grid */}
            <div 
              className="grid w-full h-full"
              style={{
                gridTemplateColumns: `repeat(${numCols}, 1fr)`,
                gridTemplateRows: `repeat(${numRows}, 1fr)`,
                columnGap: `${columnGapFactor}%`,
                rowGap: `${rowGapFactor}%`
              }}
            >
              {currentRows.map(row => 
                currentCols.map((col, colIndex) => {
                  const wellId = `${row}${col}`;
                  const wellData = plateData[wellId];
                  const isSelected = selectedWells.includes(wellId);
                  const isInCurrentDrag = currentDragSelection.includes(wellId);
                  const isFirstWell = row === currentRows[0] && col === currentCols[0]; // Use first well for measurement

                  return (
                    <div 
                      key={wellId}
                      ref={isFirstWell ? wellRef : undefined}
                      className={clsx(
                        'well-cell aspect-square rounded-full border-2 cursor-pointer transition-all duration-200 select-none',
                        isSelected || isInCurrentDrag
                          ? 'border-blue-500 ring-2 ring-blue-300 ring-opacity-50'
                          : 'border-gray-300 hover:border-gray-400'
                      )}
                      data-well-id={wellId}
                      onMouseDown={() => handleMouseDown(wellId)}
                      onMouseEnter={() => handleMouseEnter(wellId)}
                    >
                      {wellData ? renderWellContent(wellData, selectedItem, viewMode === 'compound' ? 'compound' : viewMode === 'cellLine' ? 'cellLine' : undefined) : (
                        <div className="w-full h-full rounded-full bg-gray-50" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Dynamic positioning values for row label container based on plate type
  let n1: number, n2: number;
  if (numRows === 16) { // 384-well plate
    n1 = 3;
    n2 = 3.2;
  } else if (numRows === 8) { // 96-well plate
    n1 = 2;
    n2 = 2.1;
  } else if (numRows === 4) { // 24-well plate
    n1 = 1.6;
    n2 = 1.8;
  } else { // Default values
    n1 = 1;
    n2 = 1;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6 lg:p-8">
      <div 
        className="min-h-screen bg-gray-100 p-4 md:p-6 lg:p-8"
        style={{ overflow: 'visible' }}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
            <div className="relative flex items-center mb-6">
              <div className="flex items-center gap-4">
                <Beaker className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-800">Plate Planner</h1>
              </div>
              
              {/* Plate Type Toggle - only show in main view, centered across full width */}
              {viewMode === 'main' && (
                <div className="absolute left-1/2 transform -translate-x-1/2 ml-5 flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setSelectedPlateType('24 Well')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedPlateType === '24 Well'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    24 Well
                  </button>
                  <button
                    onClick={() => setSelectedPlateType('96 Well')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedPlateType === '96 Well'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    96 Well
                  </button>
                  <button
                    onClick={() => setSelectedPlateType('384 Well')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedPlateType === '384 Well'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    384 Well
                  </button>
                </div>
              )}

              {viewMode !== 'main' && (
                <button
                  onClick={handleBackToMain}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Main Table
                </button>
              )}
            </div>

            {viewMode === 'main' && (
              <div className="mb-6 flex gap-8">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-600">
                        Applied Cell Lines ({appliedCellLines.size}/{MAX_CELL_LINES})
                      </h2>
                      <button
                        onClick={createNewCellLineIndividualView}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                        disabled={everAppliedCellLines.size >= MAX_CELL_LINES}
                        title={everAppliedCellLines.size >= MAX_CELL_LINES ? `Maximum ${MAX_CELL_LINES} cell lines allowed` : 'Add new cell line'}
                      >
                        <Plus className={`w-4 h-4 ${everAppliedCellLines.size >= MAX_CELL_LINES ? 'text-gray-400' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(everAppliedCellLines).map(name => (
                      <div key={name} className="flex items-center">
                        <button
                          onClick={() => handleCellLineClick(name)}
                          className="flex items-center gap-2 px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm hover:bg-gray-200 transition-colors"
                        >
                          {cellLineShapeMap.has(name) && renderShape(cellLineShapeMap.get(name)!, 12, '#000000')}
                          <span>{getDisplayName(name)}{!appliedCellLines.has(name) ? ' (empty)' : ''}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCellLineFromDisplay(name);
                            }}
                            className="ml-1 p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Delete cell line"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </button>
                      </div>
                    ))}
                    {everAppliedCellLines.size === 0 && (
                      <span className="text-sm text-gray-500 italic">No cell lines applied</span>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-600">
                        Applied Compounds
                      </h2>
                      <button
                        onClick={createNewCompoundIndividualView}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded-full"
                        title="Add new compound"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(everAppliedCompounds).map(name => (
                      <div key={name} className="flex items-center">
                        <button
                          onClick={() => handleCompoundClick(name)}
                          className="flex items-center gap-2 px-2 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200 transition-colors"
                        >
                          {compoundColorMap.has(name) && (
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ 
                                backgroundColor: applyIntensityToColor(
                                  compoundColorMap.get(name) || COLORS[0],
                                  compoundIntensityMap[name] || 1.0,
                                  compoundValues[name] || 70
                                )
                              }}
                            />
                          )}
                          <span>{getDisplayName(name)}{!appliedCompounds.has(name) ? ' (empty)' : ''}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCompoundFromDisplay(name);
                            }}
                            className="ml-1 p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Delete compound"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </button>
                      </div>
                    ))}
                    {everAppliedCompounds.size === 0 && (
                      <span className="text-sm text-gray-500 italic">No compounds applied</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {viewMode !== 'main' && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">
                  {viewMode === 'compound' ? 'Compound' : 'Cell Line'}: {getDisplayName(selectedItem)}
                </h2>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {viewMode === 'compound' && compoundColorMap.has(selectedItem) && (
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ 
                          backgroundColor: applyIntensityToColor(
                            compoundColorMap.get(selectedItem) || COLORS[0],
                            compoundIntensityMap[selectedItem] || 1.0,
                            compoundValues[selectedItem] || 70
                          )
                        }}
                      />
                    )}
                    {viewMode === 'cellLine' && cellLineShapeMap.has(selectedItem) && 
                      renderShape(cellLineShapeMap.get(selectedItem)!, 16, '#000000')
                    }
                    <span className="text-sm text-black">
                      Showing positions of this {viewMode === 'compound' ? 'compound' : 'cell line'} across all wells
                    </span>
                  </div>
                  {selectedWells.length > 0 && (
                    <span className="text-sm text-blue-600 font-medium">
                      {selectedWells.length} wells selected
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
              <div className="flex-1" data-table-section="true">
                <div className="">
                  {renderPlateTable()}
                </div>
              </div>

              <div className="w-full lg:w-80 space-y-6" data-legend-section="true">
                {/* Toggle between Input Section and Legend - only show for main view */}
                {viewMode === 'main' && (
                  <div className="flex bg-gray-100 rounded-lg p-1" data-legend-toggles="true">
                    <button
                      onClick={() => setShowInputSection(true)}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        showInputSection
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Input Section
                    </button>
                    <button
                      onClick={() => setShowInputSection(false)}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        !showInputSection
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Legend
                    </button>
                  </div>
                )}

                {/* Input Section - only show for main view when showInputSection is true */}
                {viewMode === 'main' && showInputSection && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-700">Compounds</h2>
                        <button
                          onClick={addCompound}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full"
                          title="Add compound"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                      {compounds.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-sm">No compounds added</p>
                          <p className="text-xs mt-1">Click the + button to add a compound</p>
                        </div>
                      ) : (
                        compounds.map((compound, index) => (
                          <div key={compound.id} className="space-y-3 bg-gray-50 p-3 rounded-lg relative">
                            <button
                              onClick={() => removeCompound(compound.id)}
                              className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border rounded"
                              value={compound.name}
                              onChange={(e) => setCompounds(prev => prev.map(c => 
                                c.id === compound.id ? { ...c, name: e.target.value } : c
                              ))}
                            />
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="any"
                                className="flex-1 px-3 py-2 border rounded"
                                value={compound.concentration}
                                onChange={(e) => setCompounds(prev => prev.map(c => 
                                  c.id === compound.id ? { ...c, concentration: e.target.value } : c
                                ))}
                              />
                              <select
                                className="w-20 px-3 py-2 border rounded bg-white"
                                value={compound.concentrationUnit}
                                onChange={(e) => setCompounds(prev => prev.map(c => 
                                  c.id === compound.id ? { ...c, concentrationUnit: e.target.value } : c
                                ))}
                              >
                                {getAvailableUnits(compound.name).map(unit => (
                                  <option key={unit} value={unit}>{unit === NO_UNIT ? '' : unit}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-700">Cell Lines</h2>
                        <button
                          onClick={addCellLine}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full"
                          disabled={appliedCellLines.size >= MAX_CELL_LINES}
                          title={appliedCellLines.size >= MAX_CELL_LINES ? `Maximum ${MAX_CELL_LINES} cell lines allowed` : 'Add cell line'}
                        >
                          <Plus className={`w-5 h-5 ${appliedCellLines.size >= MAX_CELL_LINES ? 'text-gray-400' : ''}`} />
                        </button>
                      </div>
                      {cellLines.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-sm">No cell lines added</p>
                          <p className="text-xs mt-1">Click the + button to add a cell line</p>
                        </div>
                      ) : (
                        cellLines.map((cellLine, index) => (
                          <div key={cellLine.id} className="space-y-3 bg-gray-50 p-3 rounded-lg relative">
                            <button
                              onClick={() => removeCellLine(cellLine.id)}
                              className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border rounded"
                              value={cellLine.name}
                              onChange={(e) => setCellLines(prev => prev.map(c => 
                                c.id === cellLine.id ? { ...c, name: e.target.value } : c
                              ))}
                            />
                            <div className="flex gap-1 items-center">
                              <input
                                type="number"
                                step="0.1"
                                className="w-32 px-2 py-2 border rounded text-sm"
                                value={cellLine.densityCoefficient || ''}
                                onChange={(e) => setCellLines(prev => prev.map(c => 
                                  c.id === cellLine.id ? { ...c, densityCoefficient: Number(e.target.value) || 0 } : c
                                ))}
                              />
                              <span className="text-gray-600 text-sm">×</span>
                              <span className="text-gray-600 text-sm">10^</span>
                              <select
                                className="w-12 px-1 py-2 border rounded bg-white text-sm"
                                value={cellLine.density}
                                onChange={(e) => setCellLines(prev => prev.map(c => 
                                  c.id === cellLine.id ? { ...c, density: Number(e.target.value) } : c
                                ))}
                              >
                                {POWER_VALUES.map(power => (
                                  <option key={power} value={power}>{power}</option>
                                ))}
                              </select>
                              <select
                                className="flex-1 px-2 py-2 border rounded bg-white text-sm"
                                value={cellLine.densityUnit}
                                onChange={(e) => setCellLines(prev => prev.map(c => 
                                  c.id === cellLine.id ? { ...c, densityUnit: e.target.value } : c
                                ))}
                              >
                                {VOLUME_UNITS.map(unit => (
                                  <option key={unit} value={unit}>{unit === NO_UNIT ? '' : unit}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-4">
                      <button
                        className={`w-full px-4 py-2 rounded text-sm transition-colors ${
                          canApply 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={applyToWells}
                        disabled={!canApply}
                      >
                        Apply to Selected Wells
                      </button>
                      <button
                        className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-2"
                        onClick={clearSelected}
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear Selected
                      </button>
                    </div>
                  </>
                )}

                {/* Legend Section - only show for main view when showInputSection is false */}
                {viewMode === 'main' && !showInputSection && (
                  <div className="space-y-4">
                    
                    {/* Layout Toggle and Edit Button */}
                    <div className="flex gap-2" data-legend-toggles="true">
                      <div className="flex bg-gray-100 rounded-lg p-1 flex-1">
                        <button
                          onClick={() => setLegendLayout('horizontal')}
                          className={`flex-1 px-1 py-2 text-sm font-medium rounded-md transition-colors ${
                            legendLayout === 'horizontal'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          Horizontal
                        </button>
                        <button
                          onClick={() => setLegendLayout('vertical')}
                          className={`flex-1 px-1 py-2 text-sm font-medium rounded-md transition-colors ${
                            legendLayout === 'vertical'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          Vertical
                        </button>
                      </div>
                      <button
                        onClick={() => setIsLegendEditing(!isLegendEditing)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isLegendEditing
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isLegendEditing ? 'Done' : 'Edit'}
                      </button>
                    </div>

                    {everAppliedCompounds.size === 0 && everAppliedCellLines.size === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No compounds or cell lines applied to the plate</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Compounds Legend */}
                        {everAppliedCompounds.size > 0 && (
                          <div>
                            <div className="space-y-2">
                              {Array.from(everAppliedCompounds).map(compoundName => {
                                const baseColor = compoundColorMap.get(compoundName) || COLORS[0];
                                const displayColor = applyIntensityToColor(baseColor, 1.0, 70);
                                const concentrations = getUniqueCompoundConcentrations(compoundName);
                                const editedConcentrationMap = editedLegendConcentrations.get(compoundName) || new Map();
                                
                                return (
                                  <div key={compoundName} className="flex items-start gap-3 p-2">
                                    <div 
                                      className="w-6 h-6 rounded-full mt-0.5 flex-shrink-0" 
                                      style={{ 
                                        backgroundColor: applyIntensityToColor(
                                          compoundColorMap.get(compoundName) || COLORS[0],
                                          (compoundIntensityMap as Record<string, number>)[compoundName] || 1.0,
                                          compoundValues[compoundName] || 70
                                        )
                                      }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xl text-black font-medium break-all whitespace-pre-wrap">
                                        {getDisplayName(compoundName)}
                                      </div>
                                      {concentrations.length > 0 && (
                                        <div className="text-xl text-black mt-1">
                                          <div className="space-y-3">
                                            <div className={legendLayout === 'horizontal' ? "flex flex-wrap gap-x-3 gap-y-1" : "flex flex-col gap-1"}>
                                              {concentrations.map((concItem, index) => {
                                                const editedText = editedConcentrationMap.get(concItem.comparableValue) || concItem.display;
                                                const displayText = editedText;
                                                return (
                                                  <div key={index} className={`flex items-center ${legendLayout === 'horizontal' ? 'space-x-1' : 'space-x-2'}`}>
                                                    {concentrations.length > 1 && (
                                                      <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{
                                                          backgroundColor: concItem.color
                                                        }}
                                                      />
                                                    )}
                                                    {isLegendEditing ? (
                                                      <input
                                                        type="text"
                                                        value={editedText}
                                                        onChange={(e) => handleEditLegendCompoundConcentration(compoundName, concItem.comparableValue, e.target.value)}
                                                        className="text-base font-medium bg-white border border-gray-300 rounded px-2 py-1 min-w-0 flex-1"
                                                      />
                                                    ) : (
                                                      <span className="text-base font-medium">{displayText}</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Cell Lines Legend */}
                        {everAppliedCellLines.size > 0 && (
                          <div>
                            <div className="space-y-2">
                              {Array.from(everAppliedCellLines).map(cellLineName => {
                                const shape = cellLineShapeMap.get(cellLineName) || SHAPES[0];
                                const densities = getUniqueCellLineDensities(cellLineName);
                                const editedDensityMap = editedLegendDensities.get(cellLineName) || new Map();
                                
                                return (
                                  <div key={cellLineName} className="flex items-start gap-3 p-2">
                                    <div className="mt-0.5 flex-shrink-0">
                                      {renderShape(shape, 24, '#000000')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-black text-xl break-all whitespace-pre-wrap">
                                        {getDisplayName(cellLineName)}
                                      </div>
                                      {densities.length > 0 && (
                                        <div className="text-xl text-black mt-1">
                                          <div className="space-y-3">
                                            <div className={legendLayout === 'horizontal' ? "flex flex-wrap gap-x-2 gap-y-1" : "flex flex-col gap-1"}>
                                              {densities.map((densityItem, idx) => {
                                                // Use the comparable value that was stored when the density was created
                                                const comparableValue = densityItem.comparableValue;
                                                const editedText = editedDensityMap.get(comparableValue) || densityItem.display;
                                                
                                                return (
                                                  <div key={idx} className={`flex items-center ${legendLayout === 'horizontal' ? 'space-x-1' : 'space-x-2'}`}>
                                                    {densities.length > 1 && (
                                                      <div 
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: densityItem.color }}
                                                      />
                                                    )}
                                                    {isLegendEditing ? (
                                                      <input
                                                        type="text"
                                                        value={editedText}
                                                        onChange={(e) => handleEditLegendCellLineDensity(cellLineName, comparableValue, e.target.value)}
                                                        className="text-base font-medium bg-white border border-gray-300 rounded px-2 py-1 min-w-0 flex-1"
                                                      />
                                                    ) : (
                                                      <span className="text-base font-medium">{editedText}</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Export Buttons Grid */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Export Options</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Top Left: Export PNG with table and legend */}
                        <button
                          onClick={() => exportToPNGFull(selectedPlateType)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                          title="Export PNG with table and legend"
                        >
                          <Download className="w-4 h-4" />
                          <span>PNG Full</span>
                        </button>
                        
                        {/* Top Right: Export just table PNG */}
                        <button
                          onClick={() => exportToPNG(selectedPlateType)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                          title="Export PNG of table only"
                        >
                          <Image className="w-4 h-4" />
                          <span>PNG Table</span>
                        </button>
                        
                        {/* Bottom Left: Export CSV */}
                        <button
                          onClick={() => exportToPDF(selectedPlateType)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                          title="Export PDF with table and legend"
                        >
                          <FileText className="w-4 h-4" />
                          <span>PDF Full</span>
                        </button>
                        
                        {/* Bottom Right: Export XLSX */}
                        <button
                          onClick={() => exportToXLSX(plateData, selectedPlateType, currentRows, currentCols)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                          title="Export XLSX file"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>XLSX</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {viewMode === 'compound' && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-700">Edit Compound</h2>
                    
                    {/* Error message for duplicate names */}
                    {duplicateNameError && (
                      <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                        {duplicateNameError}
                      </div>
                    )}
                    
                    <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded"
                        value={tempInputValue}
                        onChange={(e) => updateIndividualCompoundName(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          className="flex-1 px-3 py-2 border rounded"
                          value={individualCompound.concentration}
                          onChange={(e) => setIndividualCompound(prev => ({ ...prev, concentration: e.target.value }))}
                        />
                        <select
                          className="w-20 px-3 py-2 border rounded bg-white"
                          value={individualCompound.concentrationUnit}
                          onChange={(e) => setIndividualCompound(prev => ({ ...prev, concentrationUnit: e.target.value }))}
                        >
                          {getAvailableUnits(individualCompound.name).map(unit => (
                            <option key={unit} value={unit}>{unit === NO_UNIT ? '' : unit}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-sm font-medium text-gray-600">Dilution Factor:</label>
                        <input
                          type="text"
                          className="w-20 px-2 py-1 border rounded text-sm"
                          value={compoundDilutionFactorInputValue}
                          onChange={(e) => setCompoundDilutionFactorInputValue(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Color Selection Slider */}
                    {/* Slider Group */}
                    <div>
                      {/* Color Selection Slider */}
                      <div className="space-y-2 mb-6">
                        <label className="block text-lg font-medium text-gray-700">
                          Color Selection: {compoundColorMap.get(selectedItem) || COLORS[0]}
                        </label>
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="359"
                            value={hexToHsl(compoundColorMap.get(selectedItem) || COLORS[0])[0]}
                            onChange={(e) => {
                              const hue = parseInt(e.target.value);
                              const [, s, l] = hexToHsl(compoundColorMap.get(selectedItem) || COLORS[0]);
                              const newColor = hslToHex(hue, s, l);
                              handleColorChange(selectedItem, newColor);
                            }}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer p-0 border-0"
                            style={{
                              background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                            }}
                          />
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute pointer-events-none"
                            style={{
                              top: '6px',
                              left: `calc(${(hexToHsl(compoundColorMap.get(selectedItem) || COLORS[0])[0] / 359)} * (100% - 16px))`,
                              backgroundColor: compoundColorMap.get(selectedItem) || COLORS[0]
                            }}
                          />
                        </div>
                      </div>

                      {/* Intensity Slider */}
                      <div className="space-y-2 mb-6">
                        <label className="block text-sm font-medium text-gray-700">
                          Color Intensity: {((compoundIntensityMap[selectedItem] || 1.0) * 100).toFixed(0)}%
                        </label>
                        <div className="relative h-2">
                          <input
                            type="range"
                            min="0.3"
                            max="2"
                            step="0.01"
                            value={compoundIntensityMap[selectedItem] || 1.0}
                            onChange={(e) => {
                              const intensity = parseFloat(e.target.value);
                              const updatedCompoundIntensityMap = {
                                ...compoundIntensityMap,
                                [selectedItem]: intensity
                              };
                              setCompoundIntensityMap(updatedCompoundIntensityMap);
                              
                              setPlateData(currentPlateData => {
                                const finalPlateData = applyConcentrationGradient(
                                  currentPlateData, 
                                  compoundColorMap, 
                                  updatedCompoundIntensityMap, 
                                  compoundValues,
                                  compoundGradientContrastMap
                                );
                                return finalPlateData;
                              });
                            }}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer p-0 border-0"
                            style={{
                              background: `linear-gradient(to right, 
                                ${applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], 0.3, 10)} 0%, 
                                ${applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], 1.0, compoundValues[selectedItem] || 50)} 50%, 
                                ${applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], 2.0, compoundValues[selectedItem] || 50)} 100%)`
                            }}
                          />
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute pointer-events-none"
                            style={{
                              top: '6px',
                              left: `calc(${((compoundIntensityMap[selectedItem] || 1.0) - 0.3) / 1.7} * (100% - 16px))`,
                              backgroundColor: applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], compoundIntensityMap[selectedItem] || 1.0, compoundValues[selectedItem] || 50)
                            }}
                          />
                        </div>
                      </div>

                      {/* Value Scale Slider */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Value Scale: {compoundValues[selectedItem] || 70}%
                        </label>
                        <div className="relative h-2">
                          <input
                            type="range"
                            min="50"
                            max="100"
                            step="1"
                            value={compoundValues[selectedItem] || 70}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value);
                              const updatedCompoundValues = {
                                ...compoundValues,
                                [selectedItem]: newValue
                              };
                              setCompoundValues(updatedCompoundValues);
                            }}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer p-0 border-0"
                            style={{
                              background: `linear-gradient(to right, 
                                ${applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], compoundIntensityMap[selectedItem] || 1.0, 50)} 0%, 
                                ${applyIntensityToColor(compoundColorMap.get(selectedItem) || COLORS[0], compoundIntensityMap[selectedItem] || 1.0, 100)} 100%
                              )`
                            }}
                          />
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute pointer-events-none"
                            style={{
                              top: '6px',
                              left: `calc(${((compoundValues[selectedItem] || 70) - 50) / 50} * (100% - 16px))`,
                              backgroundColor: (() => {
                                const baseColor = compoundColorMap.get(selectedItem) || COLORS[0];
                                const [h, s] = hexToHsl(baseColor);
                                const currentValue = compoundValues[selectedItem] || 70;
                                return hslToHex(h, s, currentValue);
                              })()
                            }}
                          />
                        </div>
                      </div>

                      {/* Gradient Contrast Slider */}
                      <div className="space-y-2 mt-6">
                        <label className="block text-lg font-medium text-gray-700">
                          Gradient Contrast: {Math.round((compoundGradientContrastMap[selectedItem] || 0.3) * 100)}%
                        </label>
                        <div className="relative h-2">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={compoundGradientContrastMap[selectedItem] || 0.3}
                            onChange={(e) => {
                              const newContrast = parseFloat(e.target.value);
                              const updatedCompoundGradientContrastMap = {
                                ...compoundGradientContrastMap,
                                [selectedItem]: newContrast
                              };
                              setCompoundGradientContrastMap(updatedCompoundGradientContrastMap);
                            }}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer p-0 border-0 bg-gray-300"
                          />
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute pointer-events-none bg-gray-500"
                            style={{
                              left: `calc(${(compoundGradientContrastMap[selectedItem] || 0.3)} * (100% - 16px))`,
                              top: '6px'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {selectedWells.length > 0 && (
                      <div className="flex flex-col gap-2 pt-4">
                        <button
                          className={`w-full px-4 py-2 rounded text-sm transition-colors ${
                            canApplyIndividual 
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          onClick={() => {
                            // Parse and validate compound dilution factor input
                            const parsedCompoundValue = parseFloat(compoundDilutionFactorInputValue);
                            const finalCompoundDilutionFactor = (isNaN(parsedCompoundValue) || parsedCompoundValue <= 0) ? 1 : parsedCompoundValue;

                            // Parse and validate cell line dilution factor input
                            const parsedCellLineValue = parseFloat(cellLineDilutionFactorInputValue);
                            const finalCellLineDilutionFactor = (isNaN(parsedCellLineValue) || parsedCellLineValue <= 0) ? 1 : parsedCellLineValue;

                            // Update the main state variables
                            setCompoundDilutionFactor(finalCompoundDilutionFactor);
                            setCellLineDilutionFactor(finalCellLineDilutionFactor);

                            // Apply to wells with validated values
                            applyIndividualToWells(selectedItem, finalCompoundDilutionFactor, finalCellLineDilutionFactor);
                          }}
                          disabled={!canApplyIndividual}
                        >
                          Apply to Selected Wells
                        </button>
                        <button
                          className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-2"
                          onClick={removeFromSelectedWells}
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove from Selected Wells
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'cellLine' && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-700">Edit Cell Line</h2>
                    
                    {/* Error message for duplicate names */}
                    {duplicateNameError && (
                      <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                        {duplicateNameError}
                      </div>
                    )}
                    
                    <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded"
                        value={tempInputValue}
                        onChange={(e) => updateIndividualCellLineName(e.target.value)}
                      />
                      <div className="flex gap-1 items-center">
                        <input
                          type="number"
                          step="0.1"
                          className="w-32 px-2 py-2 border rounded text-sm"
                          value={individualCellLine.densityCoefficient || ''}
                          onChange={(e) => setIndividualCellLine(prev => ({ ...prev, densityCoefficient: Number(e.target.value) || 0 }))}
                        />
                        <span className="text-gray-600 text-sm">×</span>
                        <span className="text-gray-600 text-sm">10^</span>
                        <select
                          className="w-12 px-1 py-2 border rounded bg-white text-sm"
                          value={individualCellLine.density}
                          onChange={(e) => setIndividualCellLine(prev => ({ ...prev, density: Number(e.target.value) }))}
                        >
                          {POWER_VALUES.map(power => (
                            <option key={power} value={power}>{power}</option>
                          ))}
                        </select>
                        <select
                          className="flex-1 px-2 py-2 border rounded bg-white text-sm"
                          value={individualCellLine.densityUnit}
                          onChange={(e) => setIndividualCellLine(prev => ({ ...prev, densityUnit: e.target.value }))}
                        >
                          {VOLUME_UNITS.map(unit => (
                            <option key={unit} value={unit}>{unit === NO_UNIT ? '' : unit}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-sm font-medium text-gray-600">Dilution Factor:</label>
                        <input
                          type="text"
                          step="0.01"
                          className="w-20 px-2 py-1 border rounded text-sm"
                          value={cellLineDilutionFactorInputValue}
                          onChange={(e) => setCellLineDilutionFactorInputValue(e.target.value)}
                        />
                      </div>
                    </div>

                    {selectedWells.length > 0 && (
                      <div className="flex flex-col gap-2 pt-4">
                        <button
                          className={`w-full px-4 py-2 rounded text-sm transition-colors ${
                            canApplyIndividual 
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          onClick={() => {
                            // Parse and validate compound dilution factor input
                            const parsedCompoundValue = parseFloat(compoundDilutionFactorInputValue);
                            const finalCompoundDilutionFactor = (isNaN(parsedCompoundValue) || parsedCompoundValue <= 0) ? 1 : parsedCompoundValue;

                            // Parse and validate cell line dilution factor input
                            const parsedCellLineValue = parseFloat(cellLineDilutionFactorInputValue);
                            const finalCellLineDilutionFactor = (isNaN(parsedCellLineValue) || parsedCellLineValue <= 0) ? 1 : parsedCellLineValue;

                            // Update the main state variables
                            setCompoundDilutionFactor(finalCompoundDilutionFactor);
                            setCellLineDilutionFactor(finalCellLineDilutionFactor);

                            // Apply to wells with validated values
                            applyIndividualToWells(selectedItem, finalCompoundDilutionFactor, finalCellLineDilutionFactor);
                          }}
                          disabled={!canApplyIndividual}
                        >
                          Apply to Selected Wells
                        </button>
                        <button
                          className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-2"
                          onClick={removeFromSelectedWells}
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove from Selected Wells
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;