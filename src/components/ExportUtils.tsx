import React from 'react';
import * as XLSX from 'xlsx-js-style';
import * as domtoimage from 'dom-to-image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PlateData } from '../types';

// Pastel color palette for highlighting identical content
function pastelPaletteARGB() {
  // ARGB (AA RR GG BB), full alpha for solid fills
  return [
    "FFFFD1DC", // Light Pink
    "FFE6F3FF", // Light Blue
    "FFD4F1D4", // Light Green
    "FFFFF2CC", // Light Yellow
    "FFFFD1B3", // Light Orange
    "FFE6D1FF", // Light Purple
    "FFB3E5FC", // Light Cyan
    "FFFFC1CC", // Light Rose
    "FFD1FFD1", // Light Mint
    "FFFFE0B3", // Light Peach
    "FFCCB3FF", // Light Lavender
    "FFB3FFF0"  // Light Aqua
  ];
}

// Function to color identical cells with the same highlight color
function colorIdenticalsSheetJS(ws: any, wsData: any[][], firstRow = 0, firstCol = 0, caseSensitive = true, typeSensitive = true) {
  const { encode_cell } = XLSX.utils;
  const palette = pastelPaletteARGB();
  const colorMap = new Map();
  let colorIdx = 0;

  const maxCols = Math.max(...wsData.map(r => (r?.length ?? 0)));
  for (let r = firstRow; r < wsData.length; r++) {
    for (let c = firstCol; c < maxCols; c++) {
      const v = wsData[r]?.[c];
      if (v === undefined || v === null || v === "") continue;

      let key;
      if (typeSensitive) {
        key = typeof v + "|" + (typeof v === "string" && !caseSensitive ? v.toLowerCase() : String(v));
      } else {
        key = (typeof v === "string" && !caseSensitive ? v.toLowerCase() : String(v));
      }

      if (!colorMap.has(key)) {
        colorMap.set(key, palette[colorIdx % palette.length]);
        colorIdx++;
      }
      const addr = encode_cell({ r, c });
      ws[addr] = ws[addr] || { t: "s", v: String(v) }; // ensure cell exists

      ws[addr].s = ws[addr].s || {};
      ws[addr].s.fill = {
        patternType: "solid",
        fgColor: { rgb: colorMap.get(key) }
      };
    }
  }
}

interface ExportUtilsProps {
  plateData: PlateData;
  selectedPlateType: '24 Well' | '96 Well' | '384 Well';
  currentRows: string[];
  currentCols: number[];
}

// Function to export PDF
export const exportToPDF = async (selectedPlateType: '24 Well' | '96 Well' | '384 Well') => {
  // Create a temporary container that only includes table and legend
  const tableSection = document.querySelector('[data-table-section="true"]') as HTMLElement;
  const legendSection = document.querySelector('[data-legend-section="true"]') as HTMLElement;
  
  if (!tableSection || !legendSection) {
    console.error('Table or legend section not found');
    return;
  }

  // Create a temporary container for export
  const tempContainer = document.createElement('div');
  tempContainer.style.display = 'flex';
  tempContainer.style.gap = '2rem';
  tempContainer.style.backgroundColor = '#ffffff';
  tempContainer.style.padding = '1rem';
  tempContainer.style.position = 'fixed';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  tempContainer.style.zIndex = '-1000';
  
  // Clone the sections
  const tableClone = tableSection.cloneNode(true) as HTMLElement;
  const legendClone = legendSection.cloneNode(true) as HTMLElement;
  
  // Apply computed styles to ensure proper rendering
  applyComputedStyles(tableSection, tableClone);
  applyComputedStyles(legendSection, legendClone);
  
  // Remove unwanted UI elements from the cloned sections
  removeUIElementsFromClones(tableClone, legendClone);
  
  // Force specific styles on legend clone to ensure it renders properly
  legendClone.style.display = 'block';
  legendClone.style.visibility = 'visible';
  legendClone.style.opacity = '1';
  legendClone.style.position = 'static';
  legendClone.style.zIndex = 'auto';
  
  // Set flex properties for proper layout
  tableClone.style.flex = '1';
  legendClone.style.width = '320px';
  legendClone.style.flexShrink = '0';
  
  // Append clones to temp container
  tempContainer.appendChild(tableClone);
  tempContainer.appendChild(legendClone);
  
  // Apply translateY(-8px) to specific elements before rendering
  // Column labels - target the div elements that display column numbers
  tableClone.querySelectorAll('[data-label-type="column"] .flex-1.grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });
  
  // Row labels - target the div elements that display row letters
  tableClone.querySelectorAll('[data-label-type="row"] .grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });
  
  // Compound and cell line names in legend - target the main name text
  legendClone.querySelectorAll('div.text-xl.text-black.font-medium').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-10px)';
  });
  
  // Compound concentration and cell line density text in legend
  legendClone.querySelectorAll('span.text-base.font-medium').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-10px)';
  });
  
  // Add temp container to document
  document.body.appendChild(tempContainer);

  try {
    // Calculate scale for high quality (300 DPI equivalent)
    const scale = 3;
    
    // Export with white background (same as non-transparent PNG Full)
    const canvas = await html2canvas(tempContainer, {
      scale: scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false
    });
    
    // Convert canvas to image data
    const imgData = canvas.toDataURL('image/png');
    
    // Calculate PDF dimensions
    const imgWidth = canvas.width / scale;
    const imgHeight = canvas.height / scale;
    
    // Create PDF with appropriate size
    // Use landscape orientation if width > height, otherwise portrait
    const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'px',
      format: [imgWidth, imgHeight]
    });
    
    // Add image to PDF
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
    // Save the PDF
    const fileName = `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}_full.pdf`;
    pdf.save(fileName);
    
  } catch (error) {
    console.error('Error exporting PDF:', error);
  } finally {
    // Remove temp container
    document.body.removeChild(tempContainer);
  }
};

// Helper function to format cell content for CSV
const formatCellContent = (wellData: any): string => {
  if (!wellData) return '';
  
  const lines: string[] = [];
  
  // Add compounds
  if (wellData.compounds && wellData.compounds.length > 0) {
    wellData.compounds.forEach((compound: any) => {
      if (compound.name && compound.name.trim()) {
        const concentration = compound.concentration || '';
        const unit = compound.concentrationUnit || '';
        const concentrationText = concentration ? `${concentration}${unit ? ` ${unit}` : ''}` : '';
        lines.push(`${compound.name}${concentrationText ? `  ${concentrationText}` : ''}`);
      }
    });
  }
  
  // Add cell lines
  if (wellData.cellLines && wellData.cellLines.length > 0) {
    wellData.cellLines.forEach((cellLine: any) => {
      if (cellLine.name && cellLine.name.trim()) {
        let densityText = '';
        if (cellLine.densityCoefficient > 0) {
          if (cellLine.density === 0) {
            densityText = `${cellLine.densityCoefficient}${cellLine.densityUnit !== '' ? ` per ${cellLine.densityUnit}` : ''}`;
          } else {
            // Convert to superscript for display
            const superscriptMap: { [key: string]: string } = {
              '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
              '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
            };
            const superscript = cellLine.density.toString().split('').map((char: string) => superscriptMap[char] || char).join('');
            densityText = `${cellLine.densityCoefficient} × 10${superscript}${cellLine.densityUnit !== '' ? ` per ${cellLine.densityUnit}` : ''}`;
          }
        }
        lines.push(`${cellLine.name}${densityText ? `  ${densityText}` : ''}`);
      }
    });
  }
  
  return lines.join('\n');
};

// Function to export XLSX
export const exportToXLSX = (plateData: PlateData, selectedPlateType: '24 Well' | '96 Well' | '384 Well', currentRows: string[], currentCols: number[]) => {
  // Create worksheet data
  const wsData: any[][] = [];
  
  // Header row with column numbers
  const headerRow = [''].concat(currentCols.map(col => col.toString()));
  wsData.push(headerRow);
  
  // Data rows
  currentRows.forEach(row => {
    const rowData = [row]; // Start with row letter
    
    currentCols.forEach(col => {
      const wellId = `${row}${col}`;
      const wellData = plateData[wellId];
      const cellContent = formatCellContent(wellData);
      rowData.push(cellContent);
    });
    
    wsData.push(rowData);
  });

  // Create both normal and highlighted versions
  createNormalXLSX(wsData, selectedPlateType);
  createHighlightedXLSX(wsData, selectedPlateType);
};

// Function to create normal XLSX file
function createNormalXLSX(wsData: any[][], selectedPlateType: '24 Well' | '96 Well' | '384 Well') {
  // Create worksheet data
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Calculate column widths based on content
  const colWidths: { wch: number }[] = [];
  
  // Calculate width for each column
  for (let colIndex = 0; colIndex < wsData[0].length; colIndex++) {
    let maxWidth = 0;
    
    // Check header width
    if (wsData[0][colIndex]) {
      maxWidth = Math.max(maxWidth, wsData[0][colIndex].toString().length);
    }
    
    // Check data width for this column
    for (let rowIndex = 1; rowIndex < wsData.length; rowIndex++) {
      const cellValue = wsData[rowIndex][colIndex];
      if (cellValue) {
        // Split by newlines and find the longest line
        const lines = cellValue.toString().split('\n');
        const longestLineLength = Math.max(...lines.map((line: string) => line.length));
        maxWidth = Math.max(maxWidth, longestLineLength);
      }
    }
    
    // Set minimum width of 10 and add some padding
    colWidths.push({ wch: Math.max(10, maxWidth + 2) });
  }
  
  // Apply column widths
  ws['!cols'] = colWidths;
  
  // Set cell styles and calculate proper row heights
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const rowHeights: { hpt: number }[] = [];
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    let maxLinesInRow = 1;
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddress]) continue;
      
      // Initialize cell style object if it doesn't exist
      if (!ws[cellAddress].s) {
        ws[cellAddress].s = {};
      }
      if (!ws[cellAddress].s.alignment) {
        ws[cellAddress].s.alignment = {};
      }
      
      // Enable text wrapping with top alignment
      ws[cellAddress].s = {
        ...ws[cellAddress].s,
        alignment: {
          ...ws[cellAddress].s.alignment,
          wrapText: true,
          vertical: 'top'
        }
      };
      
      // Calculate total lines needed for this cell
      const cellValue = ws[cellAddress].v;
      if (cellValue && typeof cellValue === 'string') {
        const lines = cellValue.split('\n');
        
        // Calculate total lines considering both explicit breaks and wrapping
        let totalLines = 0;
        const colWidth = Math.max(10, colWidths[col]?.wch || 10);
        const effectiveWidth = Math.max(8, colWidth - 4); // Account for padding
        
        lines.forEach(line => {
          if (line.length === 0) {
            totalLines += 1;
          } else {
            // More accurate line wrapping calculation
            const estimatedWrappedLines = Math.ceil(line.length / effectiveWidth);
            totalLines += estimatedWrappedLines;
          }
        });
        
        maxLinesInRow = Math.max(maxLinesInRow, totalLines);
      }
    }
    
    // Set row height with more generous spacing
    // Use 18 points per line with additional padding for better readability
    const baseHeight = 16;
    const padding = 6;
    const rowHeight = Math.max(20, (maxLinesInRow * baseHeight) + padding);
    rowHeights.push({ hpt: rowHeight });
  }
  
  // Apply row heights to worksheet
  (ws as any)['!rows'] = rowHeights;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Plate Layout');
  
  // Generate and download the file
  const fileName = `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Function to create highlighted XLSX file
function createHighlightedXLSX(wsData: any[][], selectedPlateType: '24 Well' | '96 Well' | '384 Well') {
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Apply highlighting to identical content (skip header row and first column)
  colorIdenticalsSheetJS(ws, wsData, 1, 1, false, false);
  
  // Calculate column widths based on content
  const colWidths: { wch: number }[] = [];
  
  // Calculate width for each column
  for (let colIndex = 0; colIndex < wsData[0].length; colIndex++) {
    let maxWidth = 0;
    
    // Check header width
    if (wsData[0][colIndex]) {
      maxWidth = Math.max(maxWidth, wsData[0][colIndex].toString().length);
    }
    
    // Check data width for this column
    for (let rowIndex = 1; rowIndex < wsData.length; rowIndex++) {
      const cellValue = wsData[rowIndex][colIndex];
      if (cellValue) {
        // Split by newlines and find the longest line
        const lines = cellValue.toString().split('\n');
        const longestLineLength = Math.max(...lines.map((line: string) => line.length));
        maxWidth = Math.max(maxWidth, longestLineLength);
      }
    }
    
    // Set minimum width of 10 and add some padding
    colWidths.push({ wch: Math.max(10, maxWidth + 2) });
  }
  
  // Apply column widths
  ws['!cols'] = colWidths;
  
  // Set cell styles and calculate proper row heights
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const rowHeights: { hpt: number }[] = [];
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    let maxLinesInRow = 1;
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddress]) continue;
      
      // Initialize cell style object if it doesn't exist
      if (!ws[cellAddress].s) {
        ws[cellAddress].s = {};
      }
      if (!ws[cellAddress].s.alignment) {
        ws[cellAddress].s.alignment = {};
      }
      
      // Enable text wrapping with top alignment
      ws[cellAddress].s = {
        ...ws[cellAddress].s,
        alignment: {
          ...ws[cellAddress].s.alignment,
          wrapText: true,
          vertical: 'top'
        }
      };
      
      // Calculate total lines needed for this cell
      const cellValue = ws[cellAddress].v;
      if (cellValue && typeof cellValue === 'string') {
        const lines = cellValue.split('\n');
        
        // Calculate total lines considering both explicit breaks and wrapping
        let totalLines = 0;
        const colWidth = Math.max(10, colWidths[col]?.wch || 10);
        const effectiveWidth = Math.max(8, colWidth - 4); // Account for padding
        
        lines.forEach(line => {
          if (line.length === 0) {
            totalLines += 1;
          } else {
            // More accurate line wrapping calculation
            const estimatedWrappedLines = Math.ceil(line.length / effectiveWidth);
            totalLines += estimatedWrappedLines;
          }
        });
        
        maxLinesInRow = Math.max(maxLinesInRow, totalLines);
      }
    }
    
    // Set row height with more generous spacing
    // Use 18 points per line with additional padding for better readability
    const baseHeight = 18;
    const padding = 6;
    const rowHeight = Math.max(20, (maxLinesInRow * baseHeight) + padding);
    rowHeights.push({ hpt: rowHeight });
  }
  
  // Apply row heights to worksheet
  (ws as any)['!rows'] = rowHeights;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Plate Layout');
  
  // Generate and download the highlighted file
  const fileName = `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}_highlighted.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Function to export PNG
export const exportToPNG = async (selectedPlateType: '24 Well' | '96 Well' | '384 Well') => {
  // Find the export container element (includes padding around the table)
  const exportContainerElement = document.querySelector('[data-export-container="true"]') as HTMLElement;
  
  if (!exportContainerElement) {
    console.error('Export container element not found');
    return;
  }

  // Store original overflow style and temporarily set to hidden
  const originalOverflow = exportContainerElement.style.overflow;
  exportContainerElement.style.overflow = 'hidden';

  // Find the wells container and plate table elements
  const wellsContainer = exportContainerElement.querySelector('[data-wells-container="wells-grid"]') as HTMLElement;
  const plateTable = exportContainerElement.querySelector('[data-table="main-plate-table"]') as HTMLElement;
  
  // Store original background styles
  const originalExportContainerBg = exportContainerElement.style.backgroundColor;
  const originalWellsContainerBg = wellsContainer?.style.backgroundColor || '';
  const originalPlateTableBg = plateTable?.style.backgroundColor || '';

  // Apply translateY(-8px) to specific elements before rendering
  // Column labels - target the div elements that display column numbers
  exportContainerElement.querySelectorAll('[data-label-type="column"] .flex-1.grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });
  
  // Row labels - target the div elements that display row letters
  exportContainerElement.querySelectorAll('[data-label-type="row"] .grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });

  try {
    // Calculate scale for 600 DPI
    const scale = 6;
    
    // Set backgrounds for regular version: transparent container, white wells, preserve grey labels
    exportContainerElement.style.backgroundColor = 'transparent';
    if (wellsContainer) wellsContainer.style.backgroundColor = '#ffffff';
    // Keep plateTable background unchanged to preserve grey labels
    
    // Export regular version with white background
    const canvas = await html2canvas(exportContainerElement, {
      scale: scale,
      backgroundColor: null,
      useCORS: true,
      allowTaint: false
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    await exportDataUrlAsPNG(dataUrl, `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}.png`);
    
    // Restore backgrounds before transparent export
    exportContainerElement.style.backgroundColor = originalExportContainerBg;
    if (wellsContainer) wellsContainer.style.backgroundColor = originalWellsContainerBg;
    if (plateTable) plateTable.style.backgroundColor = originalPlateTableBg;
    
    // Export transparent version
    await exportTransparentVersionPNGHtml2Canvas(exportContainerElement, scale, selectedPlateType);
    
  } catch (error) {
    console.error('Error exporting PNG:', error);
  } finally {
    // Restore original overflow style
    exportContainerElement.style.overflow = originalOverflow;
    
    // Ensure all backgrounds are restored
    exportContainerElement.style.backgroundColor = originalExportContainerBg;
    if (wellsContainer) wellsContainer.style.backgroundColor = originalWellsContainerBg;
    if (plateTable) plateTable.style.backgroundColor = originalPlateTableBg;
    
    // Reset translateY transforms
    exportContainerElement.querySelectorAll('[data-label-type="column"] .flex-1.grid > div').forEach(el => {
      (el as HTMLElement).style.transform = '';
    });
    
    exportContainerElement.querySelectorAll('[data-label-type="row"] .grid > div').forEach(el => {
      (el as HTMLElement).style.transform = '';
    });
  }
};

// Function to export PNG Full (table + legend)
export const exportToPNGFull = async (selectedPlateType: '24 Well' | '96 Well' | '384 Well') => {
  // Create a temporary container that only includes table and legend
  const tableSection = document.querySelector('[data-table-section="true"]') as HTMLElement;
  const legendSection = document.querySelector('[data-legend-section="true"]') as HTMLElement;
  
  if (!tableSection || !legendSection) {
    console.error('Table or legend section not found');
    return;
  }

  // Create a temporary container for export
  const tempContainer = document.createElement('div');
  tempContainer.style.display = 'flex';
  tempContainer.style.gap = '2rem';
  tempContainer.style.backgroundColor = '#ffffff';
  tempContainer.style.padding = '1rem';
  tempContainer.style.position = 'fixed';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  tempContainer.style.zIndex = '-1000';
  
  // Clone the sections
  const tableClone = tableSection.cloneNode(true) as HTMLElement;
  const legendClone = legendSection.cloneNode(true) as HTMLElement;
  
  // Apply computed styles to ensure proper rendering
  applyComputedStyles(tableSection, tableClone);
  applyComputedStyles(legendSection, legendClone);
  
  // Remove unwanted UI elements from the cloned sections
  removeUIElementsFromClones(tableClone, legendClone);
  
  // Force specific styles on legend clone to ensure it renders properly
  legendClone.style.display = 'block';
  legendClone.style.visibility = 'visible';
  legendClone.style.opacity = '1';
  legendClone.style.position = 'static';
  legendClone.style.zIndex = 'auto';
  
  // Set flex properties for proper layout
  tableClone.style.flex = '1';
  legendClone.style.width = '320px';
  legendClone.style.flexShrink = '0';
  
  // Append clones to temp container
  tempContainer.appendChild(tableClone);
  tempContainer.appendChild(legendClone);
  
  // Apply translateY(-8px) to specific elements before rendering
  // Column labels - target the div elements that display column numbers
  tableClone.querySelectorAll('[data-label-type="column"] .flex-1.grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });
  
  // Row labels - target the div elements that display row letters
  tableClone.querySelectorAll('[data-label-type="row"] .grid > div').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-8px)';
  });
  
  // Compound and cell line names in legend - target the main name text
  legendClone.querySelectorAll('div.text-xl.text-black.font-medium').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-10px)';
  });
  
  // Compound concentration and cell line density text in legend
  legendClone.querySelectorAll('span.text-base.font-medium').forEach(el => {
    (el as HTMLElement).style.transform = 'translateY(-10px)';
  });
  
  // Add temp container to document
  document.body.appendChild(tempContainer);

  // Find elements within the cloned structure to hide or adjust
  const exportContainerElement = tempContainer.querySelector('[data-export-container="true"]') as HTMLElement;
  
  // Store original styles
  const originalContainerBg = exportContainerElement?.style.backgroundColor || '';

  try {
    // Calculate scale for 600 DPI
    const scale = 6;
    
    // Export regular version
    const canvas = await html2canvas(tempContainer, {
      scale: scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    await exportDataUrlAsPNG(dataUrl, `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}_full.png`);
    
    // Export transparent version
    if (exportContainerElement) {
      exportContainerElement.style.backgroundColor = 'transparent';
      
      // Also make wells container transparent
      const wellsContainer = tempContainer.querySelector('[data-wells-container="wells-grid"]') as HTMLElement;
      const plateTable = tempContainer.querySelector('[data-table="main-plate-table"]') as HTMLElement;
      
      const originalWellsContainerBg = wellsContainer?.style.backgroundColor || '';
      const originalPlateTableBg = plateTable?.style.backgroundColor || '';
      
      if (wellsContainer) wellsContainer.style.backgroundColor = 'transparent';
      if (plateTable) plateTable.style.backgroundColor = 'transparent';
      
      // Also make temp container transparent
      tempContainer.style.backgroundColor = 'transparent';
      
      const transparentCanvas = await html2canvas(tempContainer, {
        scale: scale,
        backgroundColor: null,
        useCORS: true,
        allowTaint: false
      });
      
      const transparentDataUrl = transparentCanvas.toDataURL('image/png');
      await exportDataUrlAsPNG(transparentDataUrl, `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}_full_transparent.png`);
      
      // Restore backgrounds
      if (wellsContainer) wellsContainer.style.backgroundColor = originalWellsContainerBg;
      if (plateTable) plateTable.style.backgroundColor = originalPlateTableBg;
    }
    
  } catch (error) {
    console.error('Error exporting PNG Full:', error);
  } finally {
    // Remove temp container
    document.body.removeChild(tempContainer);
    
    if (exportContainerElement) {
      exportContainerElement.style.backgroundColor = originalContainerBg;
    }
  }
};

// Helper function to remove UI elements from cloned sections
const removeUIElementsFromClones = (tableClone: HTMLElement, legendClone: HTMLElement) => {
  // Remove toggle button containers (Input/Legend and Horizontal/Vertical toggles)
  const toggleContainers = legendClone.querySelectorAll('[data-legend-toggles="true"]');
  toggleContainers.forEach(container => {
    container.remove();
  });
  
  // Remove the entire export section by finding "Export Options" text and removing its parent container
  const allElements = legendClone.querySelectorAll('*');
  allElements.forEach(element => {
    if (element.textContent?.trim() === 'Export Options') {
      // Find the parent container that includes the border-t class (the export section container)
      let parentContainer = element.parentElement;
      while (parentContainer && !parentContainer.classList.contains('border-t')) {
        parentContainer = parentContainer.parentElement;
      }
      if (parentContainer) {
        parentContainer.remove();
      } else {
        // Fallback: remove the element itself if no border-t parent is found
        element.remove();
      }
    }
  });
  
  // Remove any remaining buttons as a safety measure
  const remainingButtons = [...tableClone.querySelectorAll('button'), ...legendClone.querySelectorAll('button')];
  remainingButtons.forEach(button => {
    button.remove();
  });
  
  // Remove any remaining hr elements
  const separationLines = legendClone.querySelectorAll('hr');
  separationLines.forEach(line => {
    line.remove();
  });
};

// Helper function to export data URL as PNG
const exportDataUrlAsPNG = (dataUrl: string, filename: string): Promise<void> => {
  return new Promise((resolve) => {
    // Create download link
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    resolve();
  });
};

// Helper function to apply computed styles to cloned elements
const applyComputedStyles = (originalElement: HTMLElement, clonedElement: HTMLElement) => {
  // Get computed styles from the original element
  const computedStyles = window.getComputedStyle(originalElement);
  
  // Apply all computed styles as inline styles to the cloned element
  for (let i = 0; i < computedStyles.length; i++) {
    const property = computedStyles[i];
    const value = computedStyles.getPropertyValue(property);
    clonedElement.style.setProperty(property, value);
  }
  
  // Recursively apply to all child elements
  const originalChildren = originalElement.children;
  const clonedChildren = clonedElement.children;
  
  for (let i = 0; i < originalChildren.length; i++) {
    if (originalChildren[i] instanceof HTMLElement && clonedChildren[i] instanceof HTMLElement) {
      applyComputedStyles(originalChildren[i] as HTMLElement, clonedChildren[i] as HTMLElement);
    }
  }
};

// Helper function to export transparent version with html2canvas
const exportTransparentVersionPNGHtml2Canvas = async (
  exportContainerElement: HTMLElement,
  scale: number,
  selectedPlateType: '24 Well' | '96 Well' | '384 Well'
) => {
  // Find the wells container and table elements
  const wellsContainer = exportContainerElement.querySelector('[data-wells-container="wells-grid"]') as HTMLElement;
  const plateTable = exportContainerElement.querySelector('[data-table="main-plate-table"]') as HTMLElement;
  
  if (!wellsContainer || !plateTable) {
    console.error('Wells container or plate table not found');
    return;
  }

  // Store original styles
  const originalWellsContainerBg = wellsContainer.style.backgroundColor;
  const originalPlateTableBg = plateTable.style.backgroundColor;
  
  try {
    // Set transparent backgrounds
    wellsContainer.style.backgroundColor = 'transparent';
    plateTable.style.backgroundColor = 'transparent';
    
    // Capture with transparent wells background using html2canvas
    const transparentCanvas = await html2canvas(exportContainerElement, {
      scale: scale,
      backgroundColor: null,
      useCORS: true,
      allowTaint: false
    });
    
    const transparentDataUrl = transparentCanvas.toDataURL('image/png');
    
    // Export transparent version
    await exportDataUrlAsPNG(transparentDataUrl, `plate_layout_${selectedPlateType.replace(' ', '_').toLowerCase()}_transparent.png`);
    
  } finally {
    // Restore original backgrounds
    wellsContainer.style.backgroundColor = originalWellsContainerBg;
    plateTable.style.backgroundColor = originalPlateTableBg;
  }
};


const ExportUtils: React.FC<ExportUtilsProps> = ({ plateData, selectedPlateType, currentRows, currentCols }) => {
  return null; // This component doesn't render anything, it's just for utility functions
};

export default ExportUtils;